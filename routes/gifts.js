// routes/gifts.js — Regalos virtuales (monetización con Stripe).
//   GET  /api/gifts/catalog  → el catálogo (precios y emojis)
//   POST /api/gifts/send {matchId, giftId} → {url} (Stripe Checkout, pago único)
// El webhook de Stripe (billing.js) crea el regalo y el mensaje tipo 'gift'
// en el chat cuando el pago se completa.

const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { GIFT_CATALOG, getGift } = require('../utils/gifts');

const router = express.Router();

function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return require('stripe')(key);
}

function baseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function obtenerMatch(matchId, userId) {
  return db
    .prepare(
      'SELECT id, user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)'
    )
    .get(matchId, userId, userId);
}

function hayBloqueo(a, b) {
  return !!db
    .prepare(
      `SELECT 1 FROM blocks
       WHERE (blocker_id = ? AND blocked_id = ?)
          OR (blocker_id = ? AND blocked_id = ?)`
    )
    .get(a, b, b, a);
}

// GET /api/gifts/catalog — catálogo público (precios en centavos USD).
router.get('/catalog', (req, res) => {
  return res.json({
    gifts: GIFT_CATALOG.map((g) => ({
      id: g.id,
      emoji: g.emoji,
      priceCents: g.priceCents,
    })),
  });
});

// POST /api/gifts/send — crea la sesión de pago del regalo.
// Solo entre matches y sin bloqueo entre los dos.
router.post('/send', auth, async (req, res) => {
  const giftId = typeof req.body.giftId === 'string' ? req.body.giftId : '';
  const regalo = getGift(giftId);
  if (!regalo) {
    return res.status(400).json({ error: 'INVALID_GIFT' });
  }

  const matchId = Number(req.body.matchId);
  const match = obtenerMatch(matchId, req.userId);
  if (!match) {
    return res.status(404).json({ error: 'MATCH_NOT_FOUND' });
  }
  const otroId =
    match.user1_id === req.userId ? match.user2_id : match.user1_id;
  if (hayBloqueo(req.userId, otroId)) {
    return res.status(403).json({ error: 'BLOCKED' });
  }

  const s = stripe();
  if (!s) {
    return res.status(503).json({ error: 'PREMIUM_NOT_CONFIGURED' });
  }

  const user = db
    .prepare('SELECT id, email, stripe_customer_id FROM users WHERE id = ?')
    .get(req.userId);
  if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });

  try {
    const base = baseUrl(req);
    const params = {
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: regalo.priceCents,
            product_data: { name: regalo.productName },
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: 'gift',
        userId: String(user.id),
        matchId: String(match.id),
        giftId: regalo.id,
      },
      success_url: `${base}/#/chat/${match.id}?regalo=exito`,
      cancel_url: `${base}/#/chat/${match.id}?regalo=cancelado`,
      locale: 'es',
    };
    if (user.stripe_customer_id) {
      params.customer = user.stripe_customer_id;
    } else {
      params.customer_email = user.email;
    }
    const session = await s.checkout.sessions.create(params);
    return res.json({ url: session.url });
  } catch (e) {
    console.error('Stripe gift:', e.message);
    return res.status(502).json({ error: 'PAYMENT_ERROR' });
  }
});

// registrarRegalo(): la llama el webhook cuando el pago del regalo se
// completa. Guarda el regalo y lo publica en el chat como mensaje especial.
function registrarRegalo(senderId, matchId, giftId) {
  const regalo = getGift(giftId);
  if (!regalo) return false;

  const match = db
    .prepare('SELECT id, user1_id, user2_id FROM matches WHERE id = ?')
    .get(matchId);
  if (!match) return false;
  if (match.user1_id !== senderId && match.user2_id !== senderId) return false;

  const receiverId =
    match.user1_id === senderId ? match.user2_id : match.user1_id;
  if (hayBloqueo(senderId, receiverId)) return false;

  const ahora = new Date().toISOString();
  db.prepare(
    `INSERT INTO gifts (sender_id, receiver_id, match_id, gift_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(senderId, receiverId, match.id, regalo.id, ahora);

  // Mensaje especial en el chat: type='gift', text=ID del regalo.
  db.prepare(
    `INSERT INTO messages (match_id, sender_id, text, type, created_at)
     VALUES (?, ?, ?, 'gift', ?)`
  ).run(match.id, senderId, regalo.id, ahora);

  return true;
}

module.exports = { router, registrarRegalo };
