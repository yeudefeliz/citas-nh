// routes/calls.js — Señalización para videollamadas WebRTC (P2P).
// El chat usa polling, así que las señales viajan igual: el que llama
// guarda su oferta y el otro la recoge preguntando cada pocos segundos.
// Solo se permite señalizar entre usuarios que tienen un MATCH (y sin bloqueo).

const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

const TIPOS = ['ring', 'answer', 'ice', 'reject', 'hangup', 'cancel'];
const MAX_PAYLOAD = 8000;

// ¿Existe un match entre estos dos usuarios?
function hayMatch(a, b) {
  const u1 = Math.min(a, b);
  const u2 = Math.max(a, b);
  return !!db
    .prepare('SELECT 1 FROM matches WHERE user1_id = ? AND user2_id = ?')
    .get(u1, u2);
}

// ¿Existe bloqueo entre estos dos usuarios (en cualquier dirección)?
function hayBloqueo(a, b) {
  return !!db
    .prepare(
      `SELECT 1 FROM blocks
       WHERE (blocker_id = ? AND blocked_id = ?)
          OR (blocker_id = ? AND blocked_id = ?)`
    )
    .get(a, b, b, a);
}

// POST /api/calls/signal — Envía una señal al otro usuario del match.
// Body: { toUserId, type: "ring"|"answer"|"ice"|"reject"|"hangup"|"cancel", payload? }
router.post('/signal', auth, (req, res) => {
  const toUserId = Number(req.body && req.body.toUserId);
  const type = req.body && req.body.type;
  const payload = typeof (req.body && req.body.payload) === 'string' ? req.body.payload : '';
  const yo = req.userId;

  if (!Number.isInteger(toUserId) || toUserId === yo) {
    return res.status(404).json({ error: 'USER_NOT_FOUND' });
  }
  if (!TIPOS.includes(type)) {
    return res.status(400).json({ error: 'INVALID_SIGNAL' });
  }
  if (payload.length > MAX_PAYLOAD) {
    return res.status(400).json({ error: 'SIGNAL_TOO_LARGE' });
  }

  const otro = db.prepare('SELECT id FROM users WHERE id = ?').get(toUserId);
  if (!otro) {
    return res.status(404).json({ error: 'USER_NOT_FOUND' });
  }
  if (!hayMatch(yo, toUserId)) {
    return res.status(403).json({ error: 'NO_MATCH' });
  }
  if (hayBloqueo(yo, toUserId)) {
    return res.status(403).json({ error: 'BLOCKED' });
  }

  // Limpieza oportunista: señales de hace más de 1 hora ya no sirven.
  db.prepare("DELETE FROM call_signals WHERE created_at < datetime('now', '-1 hour')").run();

  const nueva = db
    .prepare(
      'INSERT INTO call_signals (from_id, to_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(yo, toUserId, type, payload, new Date().toISOString());

  return res.status(201).json({ ok: true, id: nueva.lastInsertRowid });
});

// GET /api/calls/signals?after=<id> — Recoge las señales dirigidas a mí.
// Con ?after solo trae las nuevas (para el polling).
router.get('/signals', auth, (req, res) => {
  const after = Number(req.query.after);
  let filas;
  if (Number.isInteger(after) && after > 0) {
    filas = db
      .prepare(
        'SELECT id, from_id, type, payload, created_at FROM call_signals WHERE to_id = ? AND id > ? ORDER BY id ASC LIMIT 50'
      )
      .all(req.userId, after);
  } else {
    filas = db
      .prepare(
        "SELECT id, from_id, type, payload, created_at FROM call_signals WHERE to_id = ? AND created_at > datetime('now', '-10 minutes') ORDER BY id ASC LIMIT 50"
      )
      .all(req.userId);
  }

  // Nombre del que llama, para mostrar "X te está llamando".
  const nombres = {};
  for (const f of filas) {
    if (!(f.from_id in nombres)) {
      const u = db.prepare('SELECT display_name FROM users WHERE id = ?').get(f.from_id);
      nombres[f.from_id] = u ? u.display_name : '';
    }
  }

  return res.json({
    signals: filas.map((f) => ({
      id: f.id,
      fromId: f.from_id,
      fromName: nombres[f.from_id] || '',
      type: f.type,
      payload: f.payload || '',
      createdAt: f.created_at,
    })),
  });
});

module.exports = router;
