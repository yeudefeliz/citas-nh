// routes/admin.js — Panel de administración con analíticas.
// Endpoints (montados bajo /api/admin):
//   POST /api/admin/login {key} → {token} (JWT con role:'admin', expira en 12h)
//   GET  /api/admin/overview    → KPIs generales + ingresos estimados
//   GET  /api/admin/users?days=30    → serie diaria de registros
//   GET  /api/admin/activity?days=30 → serie diaria de likes, matches, mensajes
//   GET  /api/admin/recent      → últimos 20 usuarios (SIN password_hash)
//   GET  /api/admin/revenue     → desglose de ingresos estimados
//   GET  /api/admin/users-by-town → usuarios por pueblo/ZIP con %
//
// SEGURIDAD:
// - La clave del admin sale de la variable de entorno ADMIN_KEY.
//   Si no está definida, el login responde 404 (el panel no existe).
// - NUNCA se hardcodea la clave en el código.
// - Rate limit en el login: máx 10 intentos por 15 minutos por IP.
// - Todos los endpoints (menos login) exigen JWT con role 'admin'.

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { getJwtSecret } = require('../middleware/auth');
const { GIFT_CATALOG } = require('../utils/gifts');
const { calcularEdad } = require('../utils/validacion');
const { grantAchievement } = require('../utils/achievements');
const { REJECT_REASONS } = require('./verification');

const router = express.Router();

// Precios conocidos (centavos de USD) — fuente única: utils/gifts.js + planes.
const PREMIUM_MENSUAL_CENTS = 499; // $4.99/mes
const BOOST_CENTS = 199; // $1.99 por boost de 30 min

// --- Rate limit del login (en memoria: 10 intentos / 15 min por IP) ---------
const intentosLogin = new Map(); // ip -> [timestamps]
const VENTANA_MS = 15 * 60 * 1000;
const MAX_INTENTOS = 10;

function ipDe(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.ip || 'desconocida';
}

function rateLimitLogin(req, res, next) {
  const ip = ipDe(req);
  const ahora = Date.now();
  const lista = (intentosLogin.get(ip) || []).filter((t) => ahora - t < VENTANA_MS);
  if (lista.length >= MAX_INTENTOS) {
    return res.status(429).json({ error: 'TOO_MANY_ATTEMPTS' });
  }
  lista.push(ahora);
  intentosLogin.set(ip, lista);
  next();
}

// --- Middleware: exige JWT con role 'admin' --------------------------------
function adminAuth(req, res, next) {
  const encabezado = req.headers.authorization || '';
  const [esquema, token] = encabezado.split(' ');
  if (esquema !== 'Bearer' || !token) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  try {
    const datos = jwt.verify(token, getJwtSecret());
    if (datos.role !== 'admin') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    next();
  } catch (e) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
}

// --- POST /api/admin/login --------------------------------------------------
// {key} → {token}. Sin ADMIN_KEY definida → 404 (el panel no existe).
router.post('/admin/login', rateLimitLogin, (req, res) => {
  const claveAdmin = process.env.ADMIN_KEY;
  if (!claveAdmin) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }
  const clave = typeof req.body.key === 'string' ? req.body.key : '';
  // Comparación en tiempo constante para no filtrar por timing.
  const crypto = require('crypto');
  const a = Buffer.from(clave);
  const b = Buffer.from(claveAdmin);
  const coincide = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!coincide) {
    return res.status(401).json({ error: 'INVALID_KEY' });
  }
  const token = jwt.sign({ role: 'admin' }, getJwtSecret(), { expiresIn: '12h' });
  return res.json({ token });
});

// --- Helpers de series diarias ----------------------------------------------
function ultimosDias(n) {
  const dias = [];
  const hoy = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - i);
    dias.push(d.toISOString().slice(0, 10));
  }
  return dias;
}

function serieDiaria(tabla, dias, filtroExtra) {
  const desde = dias[0];
  const filas = db
    .prepare(
      `SELECT date(created_at) AS dia, COUNT(*) AS n
       FROM ${tabla}
       WHERE date(created_at) >= ?${filtroExtra ? ' AND ' + filtroExtra : ''}
       GROUP BY dia`
    )
    .all(desde);
  const mapa = new Map(filas.map((f) => [f.dia, f.n]));
  return dias.map((dia) => ({ date: dia, count: mapa.get(dia) || 0 }));
}

// --- GET /api/admin/overview -------------------------------------------------
router.get('/admin/overview', adminAuth, (req, res) => {
  const hoy = new Date().toISOString().slice(0, 10);
  const hace7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const usersToday = db
    .prepare('SELECT COUNT(*) AS n FROM users WHERE date(created_at) = ?')
    .get(hoy).n;
  const usersWeek = db
    .prepare('SELECT COUNT(*) AS n FROM users WHERE date(created_at) >= ?')
    .get(hace7).n;
  const matches = db.prepare('SELECT COUNT(*) AS n FROM matches').get().n;
  const matchesToday = db
    .prepare('SELECT COUNT(*) AS n FROM matches WHERE date(created_at) = ?')
    .get(hoy).n;
  const messages = db.prepare('SELECT COUNT(*) AS n FROM messages').get().n;
  const messagesToday = db
    .prepare('SELECT COUNT(*) AS n FROM messages WHERE date(created_at) = ?')
    .get(hoy).n;
  const likesToday = db
    .prepare("SELECT COUNT(*) AS n FROM votes WHERE vote = 'like' AND date(created_at) = ?")
    .get(hoy).n;
  const premiumCount = db
    .prepare('SELECT COUNT(*) AS n FROM users WHERE is_premium = 1')
    .get().n;
  const boostActive = db
    .prepare('SELECT COUNT(*) AS n FROM users WHERE boost_until > datetime(\'now\')')
    .get().n;

  // Ingresos estimados (centavos).
  const premiumCents = premiumCount * PREMIUM_MENSUAL_CENTS;
  const regalos = db
    .prepare('SELECT gift_id, COUNT(*) AS n FROM gifts GROUP BY gift_id')
    .all();
  let giftCents = 0;
  for (const r of regalos) {
    const g = GIFT_CATALOG.find((x) => x.id === r.gift_id);
    if (g) giftCents += g.priceCents * r.n;
  }
  const boostsVendidos = db
    .prepare('SELECT COUNT(*) AS n FROM users WHERE boost_until IS NOT NULL')
    .get().n;
  const boostCents = boostsVendidos * BOOST_CENTS;
  const totalCents = premiumCents + giftCents + boostCents;

  return res.json({
    users,
    usersToday,
    usersWeek,
    matches,
    matchesToday,
    messages,
    messagesToday,
    likesToday,
    premiumCount,
    boostActive,
    revenue: {
      premiumSubs: premiumCount,
      premiumCents,
      giftSales: regalos.length,
      giftCents,
      boostSales: boostsVendidos,
      boostCents,
      totalCents,
      totalUSD: (totalCents / 100).toFixed(2),
    },
  });
});

// --- GET /api/admin/users?days=30 → registros por día ------------------------
router.get('/admin/users', adminAuth, (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90);
  return res.json({ series: serieDiaria('users', ultimosDias(days)) });
});

// --- GET /api/admin/activity?days=30 → likes, matches, mensajes por día -----
router.get('/admin/activity', adminAuth, (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90);
  const dias = ultimosDias(days);
  return res.json({
    likes: serieDiaria('votes', dias, "vote = 'like'"),
    matches: serieDiaria('matches', dias),
    messages: serieDiaria('messages', dias),
  });
});

// --- GET /api/admin/recent → últimos 20 usuarios (sin password_hash) ---------
router.get('/admin/recent', adminAuth, (req, res) => {
  const filas = db
    .prepare(
      `SELECT u.id, u.display_name, u.email, p.town, u.created_at, u.is_premium
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       ORDER BY u.id DESC
       LIMIT 20`
    )
    .all();
  return res.json({
    users: filas.map((f) => ({
      id: f.id,
      displayName: f.display_name,
      email: f.email,
      town: f.town || '',
      createdAt: f.created_at,
      isPremium: !!f.is_premium,
    })),
  });
});

// --- GET /api/admin/revenue → desglose de ingresos estimados -----------------
router.get('/admin/revenue', adminAuth, (req, res) => {
  const premiumSubs = db
    .prepare('SELECT COUNT(*) AS n FROM users WHERE is_premium = 1')
    .get().n;

  const porRegalo = db
    .prepare('SELECT gift_id, COUNT(*) AS n FROM gifts GROUP BY gift_id')
    .all()
    .map((r) => {
      const g = GIFT_CATALOG.find((x) => x.id === r.gift_id);
      return {
        giftId: r.gift_id,
        emoji: g ? g.emoji : '🎁',
        count: r.n,
        cents: g ? g.priceCents * r.n : 0,
      };
    });

  const boostsVendidos = db
    .prepare('SELECT COUNT(*) AS n FROM users WHERE boost_until IS NOT NULL')
    .get().n;

  const giftCents = porRegalo.reduce((s, r) => s + r.cents, 0);
  const premiumCents = premiumSubs * PREMIUM_MENSUAL_CENTS;
  const boostCents = boostsVendidos * BOOST_CENTS;

  return res.json({
    premium: {
      activeSubs: premiumSubs,
      monthlyPerSubUSD: (PREMIUM_MENSUAL_CENTS / 100).toFixed(2),
      estimatedMonthlyUSD: (premiumCents / 100).toFixed(2),
    },
    gifts: porRegalo,
    giftsTotalUSD: (giftCents / 100).toFixed(2),
    boosts: {
      sold: boostsVendidos,
      priceUSD: (BOOST_CENTS / 100).toFixed(2),
      totalUSD: (boostCents / 100).toFixed(2),
    },
    grandTotalUSD: ((premiumCents + giftCents + boostCents) / 100).toFixed(2),
  });
});

// --- GET /api/admin/users-by-town → usuarios por pueblo/ZIP ----------------
// [{town, zip, count, pct}]. El pueblo sale del perfil; si está vacío se
// agrupa como "—". El ZIP es el más común de ese pueblo.
router.get('/admin/users-by-town', adminAuth, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const filas = db
    .prepare(
      `SELECT TRIM(COALESCE(p.town, '')) AS town, u.zip AS zip, COUNT(*) AS n
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       GROUP BY TRIM(COALESCE(p.town, '')), u.zip
       ORDER BY n DESC`
    )
    .all();

  // Agrupa por pueblo; zip = el más común de ese pueblo.
  const porPueblo = {};
  for (const f of filas) {
    const pueblo = f.town || '—';
    if (!porPueblo[pueblo]) porPueblo[pueblo] = { count: 0, zips: {} };
    porPueblo[pueblo].count += f.n;
    const z = (f.zip || '').trim();
    if (z) porPueblo[pueblo].zips[z] = (porPueblo[pueblo].zips[z] || 0) + f.n;
  }

  const towns = Object.entries(porPueblo)
    .map(([town, d]) => {
      const topZip = Object.entries(d.zips).sort((a, b) => b[1] - a[1])[0];
      return {
        town,
        zip: topZip ? topZip[0] : '',
        count: d.count,
        pct: total ? Math.round((d.count / total) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  return res.json({ total, towns });
});

// --- GET /api/admin/verifications/pending → selfies en revisión -------------
router.get('/admin/verifications/pending', adminAuth, (req, res) => {
  const filas = db
    .prepare(
      `SELECT u.id, u.display_name, u.dob, u.created_at, p.town
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.verification_status = 'pending'
       ORDER BY u.id ASC`
    )
    .all();
  return res.json({
    pending: filas.map((f) => ({
      userId: f.id,
      displayName: f.display_name,
      age: calcularEdad(f.dob),
      town: f.town || '',
      createdAt: f.created_at,
    })),
  });
});

// --- GET /api/admin/verifications/photo/:userId → selfie privada (admin) ----
// Fase 2 persistencia: la selfie vive como BLOB en la DB.
router.get('/admin/verifications/photo/:userId', adminAuth, (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'BAD_ID' });
  const u = db
    .prepare('SELECT verification_data AS data, verification_mime AS mime FROM users WHERE id = ? AND verification_status = ?')
    .get(userId, 'pending');
  if (!u || !u.data) return res.status(404).json({ error: 'NOT_FOUND' });
  res.set('Content-Type', u.mime || 'image/jpeg');
  res.set('Content-Length', String(u.data.length));
  return res.send(u.data);
});

// --- POST /api/admin/verifications/:userId/approve → aprueba la selfie ------
router.post('/admin/verifications/:userId/approve', adminAuth, (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'BAD_ID' });
  const u = db
    .prepare('SELECT verification_status FROM users WHERE id = ?')
    .get(userId);
  if (!u) return res.status(404).json({ error: 'NOT_FOUND' });
  db.prepare(
    `UPDATE users
     SET verification_status = 'verified', is_verified = 1, verification_reject_reason = NULL
     WHERE id = ?`
  ).run(userId);
  const nuevos = [];
  if (grantAchievement(userId, 'verified')) nuevos.push('verified');
  return res.json({ ok: true, newAchievements: nuevos });
});

// --- POST /api/admin/verifications/:userId/reject {reason} → rechaza --------
router.post('/admin/verifications/:userId/reject', adminAuth, (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const reason = req.body && req.body.reason;
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'BAD_ID' });
  if (!REJECT_REASONS.includes(reason)) return res.status(400).json({ error: 'BAD_REASON' });
  const u = db
    .prepare('SELECT verification_status, verification_photo FROM users WHERE id = ?')
    .get(userId);
  if (!u) return res.status(404).json({ error: 'NOT_FOUND' });
  // La selfie rechazada se borra de la DB (dato sensible; el usuario puede reintentar).
  db.prepare(
    `UPDATE users
     SET verification_status = 'rejected', is_verified = 0,
         verification_photo = NULL, verification_data = NULL,
         verification_mime = NULL, verification_reject_reason = ?
     WHERE id = ?`
  ).run(reason, userId);
  return res.json({ ok: true });
});

// --- DELETE /api/admin/users/:id — Borra un usuario y todo lo suyo -------
// (perfil, fotos, selfie, mensajes con sus blobs; las tablas hijas caen
// por ON DELETE CASCADE). Solo para limpieza/moderación.
router.delete('/admin/users/:id', adminAuth, (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'BAD_ID' });
  const u = db
    .prepare('SELECT id FROM users WHERE id = ?')
    .get(userId);
  if (!u) return res.status(404).json({ error: 'NOT_FOUND' });
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  return res.json({ ok: true, deleted: userId });
});

module.exports = router;
