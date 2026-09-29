// routes/billing.js — Premium con Stripe.
// Endpoints (montados bajo /api):
//   GET  /api/billing/status    → {isPremium, premiumUntil, boostUntil, boostActive, stripeConfigured} (auth)
//   POST /api/billing/checkout  → {url} (auth) — crea la sesión de pago de Stripe
//   POST /api/billing/boost     → {url} (auth) — Boost de 30 min por $1.99 (pago único)
//   POST /api/billing/portal    → {url} (auth) — portal para gestionar/cancelar
//   GET  /api/admirers          → quién me dio like (auth; completo solo premium)
//   GET  /api/visitors          → quién vio mi perfil (auth; completo solo premium)
// Webhook (sin auth, verificado por firma):
//   POST /api/billing/webhook   → se monta en server.js con cuerpo RAW

const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { calcularEdad } = require('../utils/validacion');

const router = express.Router();

// Cliente de Stripe solo si hay clave secreta configurada.
function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return require('stripe')(key);
}

// URL pública de la app (Render manda x-forwarded-*).
function baseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function esPremium(userId) {
  const u = db.prepare('SELECT is_premium FROM users WHERE id = ?').get(userId);
  return !!(u && u.is_premium);
}

function activarPremium(userId, customerId, subscriptionId, periodEnd) {
  db.prepare(
    `UPDATE users
     SET is_premium = 1, premium_until = ?,
         stripe_customer_id = ?, stripe_subscription_id = ?
     WHERE id = ?`
  ).run(periodEnd || null, customerId || null, subscriptionId || null, userId);
}

function desactivarPremium(userId) {
  db.prepare(
    `UPDATE users
     SET is_premium = 0, premium_until = NULL, stripe_subscription_id = NULL
     WHERE id = ?`
  ).run(userId);
}

// Activa el Boost: el perfil sale primero en Descubrir por 30 minutos.
function activarBoost(userId, customerId) {
  const hasta = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  db.prepare(
    `UPDATE users SET boost_until = ?,
     stripe_customer_id = COALESCE(?, stripe_customer_id)
     WHERE id = ?`
  ).run(hasta, customerId || null, userId);
}

// ¿El boost de este usuario sigue activo?
function boostActivo(boostUntil) {
  return !!(boostUntil && boostUntil > new Date().toISOString());
}

// GET /api/billing/status — ¿soy premium? ¿Stripe está configurado? ¿Boost activo?
router.get('/billing/status', auth, (req, res) => {
  const u = db
    .prepare('SELECT is_premium, premium_until, boost_until FROM users WHERE id = ?')
    .get(req.userId);
  if (!u) return res.status(404).json({ error: 'USER_NOT_FOUND' });
  return res.json({
    isPremium: !!u.is_premium,
    premiumUntil: u.premium_until || null,
    boostUntil: u.boost_until || null,
    boostActive: boostActivo(u.boost_until),
    stripeConfigured: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID),
  });
});

// POST /api/billing/checkout — crea la sesión de suscripción y devuelve la URL.
router.post('/billing/checkout', auth, async (req, res) => {
  const s = stripe();
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!s || !priceId) {
    return res.status(503).json({ error: 'PREMIUM_NOT_CONFIGURED' });
  }
  const user = db
    .prepare('SELECT id, email, stripe_customer_id FROM users WHERE id = ?')
    .get(req.userId);
  if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });

  try {
    const base = baseUrl(req);
    const params = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId: String(user.id) },
      subscription_data: { metadata: { userId: String(user.id) } },
      success_url: `${base}/#/premium?estado=exito`,
      cancel_url: `${base}/#/premium?estado=cancelado`,
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
    console.error('Stripe checkout:', e.message);
    return res.status(502).json({ error: 'PAYMENT_ERROR' });
  }
});

// POST /api/billing/boost — Boost de perfil por $1.99 (pago ÚNICO, 30 min).
// Crea la sesión de Stripe con price_data inline (sin price ID hardcodeado).
router.post('/billing/boost', auth, async (req, res) => {
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
            unit_amount: 199, // $1.99
            product_data: {
              name: 'Boost de perfil — Citas NH (30 min)',
            },
          },
          quantity: 1,
        },
      ],
      metadata: { type: 'boost', userId: String(user.id) },
      success_url: `${base}/#/perfil?boost=exito`,
      cancel_url: `${base}/#/perfil?boost=cancelado`,
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
    console.error('Stripe boost:', e.message);
    return res.status(502).json({ error: 'PAYMENT_ERROR' });
  }
});

// POST /api/billing/portal — portal de Stripe para gestionar o cancelar.
router.post('/billing/portal', auth, async (req, res) => {
  const s = stripe();
  if (!s) return res.status(503).json({ error: 'PREMIUM_NOT_CONFIGURED' });
  const user = db
    .prepare('SELECT stripe_customer_id FROM users WHERE id = ?')
    .get(req.userId);
  if (!user || !user.stripe_customer_id) {
    return res.status(400).json({ error: 'NO_SUBSCRIPTION' });
  }
  try {
    const session = await s.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${baseUrl(req)}/#/ajustes`,
    });
    return res.json({ url: session.url });
  } catch (e) {
    console.error('Stripe portal:', e.message);
    return res.status(502).json({ error: 'PAYMENT_ERROR' });
  }
});

// GET /api/admirers — quién me dio like y todavía no es match ni lo voté.
// Gratis: solo el conteo (bloqueado). Premium: la lista completa.
router.get('/admirers', auth, (req, res) => {
  const yo = req.userId;
  const filas = db
    .prepare(
      `SELECT u.id, u.display_name, u.dob, u.is_verified, p.town, MAX(v.is_super) AS is_super
       FROM votes v
       JOIN users u ON u.id = v.voter_id
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE v.target_id = ? AND v.vote = 'like'
         AND NOT EXISTS (SELECT 1 FROM votes WHERE voter_id = ? AND target_id = u.id)
         AND NOT EXISTS (
           SELECT 1 FROM blocks
           WHERE (blocker_id = ? AND blocked_id = u.id)
              OR (blocker_id = u.id AND blocked_id = ?)
         )
       GROUP BY u.id
       ORDER BY MAX(v.created_at) DESC`
    )
    .all(yo, yo, yo, yo);

  if (!esPremium(yo)) {
    return res.json({ locked: true, count: filas.length });
  }

  const fotosDe = (uid) =>
    db
      .prepare(
        'SELECT filename FROM photos WHERE user_id = ? ORDER BY position ASC, id ASC'
      )
      .all(uid)
      .map((f) => '/uploads/' + f.filename);

  return res.json({
    locked: false,
    admirers: filas.map((f) => ({
      userId: f.id,
      displayName: f.display_name,
      age: calcularEdad(f.dob),
      town: f.town || '',
      photos: fotosDe(f.id),
      isSuper: !!f.is_super,
      isVerified: !!f.is_verified,
    })),
  });
});

// GET /api/visitors — quién vio mi perfil (una entrada por visitante, lo más
// reciente primero). Gratis: solo el conteo (bloqueado). Premium: la lista.
router.get('/visitors', auth, (req, res) => {
  const yo = req.userId;
  const filas = db
    .prepare(
      `SELECT u.id, u.display_name, u.dob, u.is_verified, p.town, MAX(pv.created_at) AS viewed_at
       FROM profile_views pv
       JOIN users u ON u.id = pv.viewer_id
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE pv.viewed_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM blocks
           WHERE (blocker_id = ? AND blocked_id = u.id)
              OR (blocker_id = u.id AND blocked_id = ?)
         )
       GROUP BY u.id
       ORDER BY viewed_at DESC
       LIMIT 50`
    )
    .all(yo, yo, yo);

  if (!esPremium(yo)) {
    return res.json({ locked: true, count: filas.length });
  }

  const fotosDe = (uid) =>
    db
      .prepare(
        'SELECT filename FROM photos WHERE user_id = ? ORDER BY position ASC, id ASC'
      )
      .all(uid)
      .map((f) => '/uploads/' + f.filename);

  return res.json({
    locked: false,
    visitors: filas.map((f) => ({
      userId: f.id,
      displayName: f.display_name,
      age: calcularEdad(f.dob),
      town: f.town || '',
      photos: fotosDe(f.id),
      viewedAt: f.viewed_at,
      isVerified: !!f.is_verified,
    })),
  });
});

// POST /api/billing/webhook — eventos de Stripe (firma verificada, cuerpo RAW).
async function webhook(req, res) {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) return res.status(503).send('webhook no configurado');

  let event;
  try {
    event = s.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      secret
    );
  } catch (e) {
    return res.status(400).send('firma inválida');
  }

  try {
    const tipo = event.type;

    if (tipo === 'checkout.session.completed') {
      const sess = event.data.object;
      const userId = Number(sess.metadata && sess.metadata.userId);

      // Boost ($1.99, pago único): activa 30 minutos de visibilidad.
      if (sess.mode === 'payment' && sess.metadata && sess.metadata.type === 'boost') {
        if (userId) activarBoost(userId, sess.customer || null);
        return res.json({ received: true });
      }

      // Regalo virtual (pago único): lo registra y lo publica en el chat.
      if (sess.mode === 'payment' && sess.metadata && sess.metadata.type === 'gift') {
        try {
          const { registrarRegalo } = require('./gifts');
          registrarRegalo(
            userId,
            Number(sess.metadata.matchId),
            sess.metadata.giftId
          );
        } catch (e) {
          console.error('Webhook gift:', e.message);
        }
        return res.json({ received: true });
      }

      // Suscripción Premium ($4.99/mes).
      const subId = sess.subscription || null;
      let periodEnd = null;
      if (subId) {
        try {
          const sub = await s.subscriptions.retrieve(subId);
          periodEnd = sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null;
        } catch (e) {
          console.error('Webhook: no se pudo leer la suscripción:', e.message);
        }
      }
      if (userId) activarPremium(userId, sess.customer || null, subId, periodEnd);
    } else if (tipo === 'invoice.payment_succeeded') {
      const inv = event.data.object;
      if (inv.subscription) {
        try {
          const sub = await s.subscriptions.retrieve(inv.subscription);
          const userId = Number(sub.metadata && sub.metadata.userId);
          const periodEnd = sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null;
          if (userId) activarPremium(userId, sub.customer || null, sub.id, periodEnd);
        } catch (e) {
          console.error('Webhook invoice:', e.message);
        }
      }
    } else if (tipo === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const userId = Number(sub.metadata && sub.metadata.userId);
      if (userId) desactivarPremium(userId);
    }
  } catch (e) {
    console.error('Webhook:', e.message);
  }

  return res.json({ received: true });
}

module.exports = { router, webhook, esPremium };
