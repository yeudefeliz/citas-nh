// routes/matches.js — Votos (like/pass) y lista de matches.
// Un match se crea cuando dos usuarios se dan "like" mutuamente.

const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { calcularEdad } = require('../utils/validacion');

const router = express.Router();

function urlsFotos(userId) {
  const fotos = db
    .prepare('SELECT filename FROM photos WHERE user_id = ? ORDER BY position ASC, id ASC')
    .all(userId);
  return fotos.map((f) => '/uploads/' + f.filename);
}

// POST /api/votes — Vota "like" o "pass" sobre otro usuario.
router.post('/votes', auth, (req, res) => {
  const targetUserId = Number(req.body && req.body.targetUserId);
  const vote = req.body && req.body.vote;
  const yo = req.userId;

  if (targetUserId === yo) {
    return res.status(400).json({ error: 'CANNOT_VOTE_SELF' });
  }
  if (vote !== 'like' && vote !== 'pass') {
    return res.status(400).json({ error: 'INVALID_VOTE' });
  }
  if (!Number.isInteger(targetUserId)) {
    return res.status(404).json({ error: 'USER_NOT_FOUND' });
  }

  const objetivo = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
  if (!objetivo) {
    return res.status(404).json({ error: 'USER_NOT_FOUND' });
  }

  const yaVoto = db
    .prepare('SELECT id FROM votes WHERE voter_id = ? AND target_id = ?')
    .get(yo, targetUserId);
  if (yaVoto) {
    return res.status(400).json({ error: 'ALREADY_VOTED' });
  }

  db.prepare(
    'INSERT INTO votes (voter_id, target_id, vote, created_at) VALUES (?, ?, ?, ?)'
  ).run(yo, targetUserId, vote, new Date().toISOString());

  // ¿Hay match? Solo si mi voto es "like" Y el otro ya me dio "like" a mí.
  if (vote === 'like') {
    const reciproco = db
      .prepare("SELECT id FROM votes WHERE voter_id = ? AND target_id = ? AND vote = 'like'")
      .get(targetUserId, yo);

    if (reciproco) {
      // user1_id siempre es el id menor: así el par (a,b) es único.
      const user1 = Math.min(yo, targetUserId);
      const user2 = Math.max(yo, targetUserId);

      let match = db
        .prepare('SELECT id FROM matches WHERE user1_id = ? AND user2_id = ?')
        .get(user1, user2);

      if (!match) {
        const nuevo = db
          .prepare('INSERT INTO matches (user1_id, user2_id, created_at) VALUES (?, ?, ?)')
          .run(user1, user2, new Date().toISOString());
        match = { id: nuevo.lastInsertRowid };
      }

      return res.json({ ok: true, match: true, matchId: match.id });
    }
  }

  return res.json({ ok: true, match: false });
});

// GET /api/matches — Lista de matches del usuario, sin los bloqueados
// (en ninguna de las dos direcciones).
router.get('/matches', auth, (req, res) => {
  const yo = req.userId;

  const filas = db
    .prepare(
      'SELECT id, user1_id, user2_id, created_at FROM matches WHERE user1_id = ? OR user2_id = ? ORDER BY created_at DESC'
    )
    .all(yo, yo);

  const bloqueados = db.prepare(
    `SELECT 1 FROM blocks
     WHERE (blocker_id = ? AND blocked_id = ?)
        OR (blocker_id = ? AND blocked_id = ?)`
  );

  const resultado = [];
  for (const m of filas) {
    const otroId = m.user1_id === yo ? m.user2_id : m.user1_id;

    // Saltar si hay bloqueo en cualquier dirección.
    if (bloqueados.get(yo, otroId, otroId, yo)) {
      continue;
    }

    const u = db
      .prepare('SELECT id, display_name, dob FROM users WHERE id = ?')
      .get(otroId);
    if (!u) continue; // El otro usuario fue borrado; lo saltamos.

    const perfil = db
      .prepare('SELECT town FROM profiles WHERE user_id = ?')
      .get(otroId);

    const ultimo = db
      .prepare(
        'SELECT text, created_at FROM messages WHERE match_id = ? ORDER BY id DESC LIMIT 1'
      )
      .get(m.id);

    resultado.push({
      matchId: m.id,
      user: {
        userId: u.id,
        displayName: u.display_name,
        age: calcularEdad(u.dob),
        town: (perfil && perfil.town) || '',
        photos: urlsFotos(u.id),
      },
      createdAt: m.created_at,
      lastMessage: ultimo
        ? { text: ultimo.text, createdAt: ultimo.created_at }
        : null,
    });
  }

  return res.json({ matches: resultado });
});

module.exports = router;
