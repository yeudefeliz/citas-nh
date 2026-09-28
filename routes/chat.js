// routes/chat.js — Mensajes dentro de un match.
// Solo los dos miembros del match pueden leer/escribir, y si hay bloqueo
// entre ellos el chat queda cerrado (403 BLOCKED).

const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

const MAX_TEXTO = 1000;

// Busca el match solo si el usuario autenticado es uno de los dos miembros.
function obtenerMatch(matchId, userId) {
  return db
    .prepare(
      'SELECT id, user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)'
    )
    .get(matchId, userId, userId);
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

// GET /api/chat/:matchId/messages — Historial (con ?after=<id> para traer solo lo nuevo).
router.get('/:matchId/messages', auth, (req, res) => {
  const match = obtenerMatch(req.params.matchId, req.userId);
  if (!match) {
    return res.status(404).json({ error: 'MATCH_NOT_FOUND' });
  }

  const otroId = match.user1_id === req.userId ? match.user2_id : match.user1_id;
  if (hayBloqueo(req.userId, otroId)) {
    return res.status(403).json({ error: 'BLOCKED' });
  }

  const after = Number(req.query.after);
  let mensajes;
  if (Number.isInteger(after) && after > 0) {
    mensajes = db
      .prepare(
        'SELECT id, sender_id, text, created_at FROM messages WHERE match_id = ? AND id > ? ORDER BY id ASC'
      )
      .all(match.id, after);
  } else {
    mensajes = db
      .prepare(
        'SELECT id, sender_id, text, created_at FROM messages WHERE match_id = ? ORDER BY id ASC'
      )
      .all(match.id);
  }

  return res.json({
    messages: mensajes.map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      text: m.text,
      createdAt: m.created_at,
    })),
  });
});

// POST /api/chat/:matchId/messages — Envía un mensaje (texto ≤ 1000, no vacío).
router.post('/:matchId/messages', auth, (req, res) => {
  const match = obtenerMatch(req.params.matchId, req.userId);
  if (!match) {
    return res.status(404).json({ error: 'MATCH_NOT_FOUND' });
  }

  const otroId = match.user1_id === req.userId ? match.user2_id : match.user1_id;
  if (hayBloqueo(req.userId, otroId)) {
    return res.status(403).json({ error: 'BLOCKED' });
  }

  const texto = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (!texto) {
    return res.status(400).json({ error: 'EMPTY_MESSAGE' });
  }
  if (texto.length > MAX_TEXTO) {
    return res.status(400).json({ error: 'MESSAGE_TOO_LONG' });
  }

  const ahora = new Date().toISOString();
  const nuevo = db
    .prepare(
      'INSERT INTO messages (match_id, sender_id, text, created_at) VALUES (?, ?, ?, ?)'
    )
    .run(match.id, req.userId, texto, ahora);

  return res.status(201).json({
    message: {
      id: nuevo.lastInsertRowid,
      senderId: req.userId,
      text: texto,
      createdAt: ahora,
    },
  });
});

module.exports = router;
