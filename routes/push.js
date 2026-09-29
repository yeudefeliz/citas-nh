// routes/push.js — Suscripciones Web Push.
//   GET  /api/push/vapid-public-key → {publicKey} (null si no está configurado)
//   POST /api/push/subscribe {subscription:{endpoint,keys:{p256dh,auth}}, lang} → {ok}
//   DELETE /api/push/unsubscribe {endpoint} → {ok}

const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// GET /api/push/vapid-public-key — La clave pública VAPID para suscribirse.
// Pública por diseño: no es un secreto.
router.get('/vapid-public-key', (req, res) => {
  return res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

// POST /api/push/subscribe — Guarda o actualiza la suscripción del dispositivo.
router.post('/subscribe', auth, (req, res) => {
  const sub = (req.body && req.body.subscription) || {};
  const endpoint = typeof sub.endpoint === 'string' ? sub.endpoint : '';
  const p256dh = sub.keys && typeof sub.keys.p256dh === 'string' ? sub.keys.p256dh : '';
  const authKey = sub.keys && typeof sub.keys.auth === 'string' ? sub.keys.auth : '';
  if (!endpoint || !p256dh || !authKey || endpoint.length > 2000) {
    return res.status(400).json({ error: 'INVALID_SUBSCRIPTION' });
  }
  const lang = req.body && req.body.lang === 'en' ? 'en' : 'es';
  const ahora = new Date().toISOString();
  // Un endpoint pertenece a un solo usuario: si cambia de cuenta, se reasigna.
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  db.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, lang, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(req.userId, endpoint, p256dh, authKey, lang, ahora);
  return res.json({ ok: true });
});

// DELETE /api/push/unsubscribe — Borra la suscripción de este dispositivo.
router.delete('/unsubscribe', auth, (req, res) => {
  const endpoint = req.body && typeof req.body.endpoint === 'string' ? req.body.endpoint : '';
  if (endpoint) {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(
      endpoint,
      req.userId
    );
  }
  return res.json({ ok: true });
});

module.exports = router;
