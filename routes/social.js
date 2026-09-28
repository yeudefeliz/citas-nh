// routes/social.js — Bloqueos y reportes.
// Bloquear no borra el match, pero cierra el chat (ver routes/chat.js).

const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Valida que el objetivo exista y no sea uno mismo.
// Devuelve { error } si algo falla, o { targetId } si todo está bien.
function validarObjetivo(req, codigoPropio) {
  const targetId = Number(req.body && req.body.targetUserId);
  if (targetId === req.userId) {
    return { error: codigoPropio, status: 400 };
  }
  if (!Number.isInteger(targetId)) {
    return { error: 'USER_NOT_FOUND', status: 404 };
  }
  const existe = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
  if (!existe) {
    return { error: 'USER_NOT_FOUND', status: 404 };
  }
  return { targetId };
}

// POST /api/blocks — Bloquea a otro usuario.
router.post('/blocks', auth, (req, res) => {
  const v = validarObjetivo(req, 'CANNOT_BLOCK_SELF');
  if (v.error) {
    return res.status(v.status).json({ error: v.error });
  }

  db.prepare(
    'INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)'
  ).run(req.userId, v.targetId, new Date().toISOString());

  return res.json({ ok: true });
});

// GET /api/blocks — Lista de usuarios bloqueados por mí.
router.get('/blocks', auth, (req, res) => {
  const filas = db
    .prepare(
      `SELECT u.id, u.display_name
       FROM blocks b
       JOIN users u ON u.id = b.blocked_id
       WHERE b.blocker_id = ?
       ORDER BY b.created_at DESC`
    )
    .all(req.userId);

  return res.json({
    blocks: filas.map((f) => ({ userId: f.id, displayName: f.display_name })),
  });
});

// DELETE /api/blocks/:targetUserId — Desbloquea a un usuario.
router.delete('/blocks/:targetUserId', auth, (req, res) => {
  const targetId = Number(req.params.targetUserId);
  if (Number.isInteger(targetId)) {
    db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(
      req.userId,
      targetId
    );
  }
  return res.json({ ok: true });
});

// POST /api/reports — Reporta a otro usuario (moderación futura).
router.post('/reports', auth, (req, res) => {
  const v = validarObjetivo(req, 'CANNOT_REPORT_SELF');
  if (v.error) {
    return res.status(v.status).json({ error: v.error });
  }

  const motivo =
    typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  if (motivo.length > 500) {
    return res.status(400).json({ error: 'INVALID_REASON' });
  }

  db.prepare(
    'INSERT INTO reports (reporter_id, reported_id, reason, created_at) VALUES (?, ?, ?, ?)'
  ).run(req.userId, v.targetId, motivo, new Date().toISOString());

  return res.json({ ok: true });
});

module.exports = router;
