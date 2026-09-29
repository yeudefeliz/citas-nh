// routes/matches.js — Votos (like/pass), super likes y lista de matches.
// Un match se crea cuando dos usuarios se dan "like" mutuamente.

const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { calcularEdad } = require('../utils/validacion');
const { esPremium } = require('./billing');

// Likes por día para cuentas gratis (los premium no tienen límite).
const FREE_LIKES_POR_DIA = 10;
// Super likes por día para cuentas gratis (los premium son ilimitados).
const FREE_SUPERLIKES_POR_DIA = 1;

const router = express.Router();

function urlsFotos(userId) {
  const fotos = db
    .prepare('SELECT filename FROM photos WHERE user_id = ? ORDER BY position ASC, id ASC')
    .all(userId);
  return fotos.map((f) => '/uploads/' + f.filename);
}

// Lógica compartida de votar. Lanza {status, code} si algo es inválido.
function votar(yo, targetUserId, vote, isSuper) {
  if (targetUserId === yo) {
    throw { status: 400, code: 'CANNOT_VOTE_SELF' };
  }
  if (vote !== 'like' && vote !== 'pass') {
    throw { status: 400, code: 'INVALID_VOTE' };
  }
  if (!Number.isInteger(targetUserId)) {
    throw { status: 404, code: 'USER_NOT_FOUND' };
  }
  if (isSuper && vote !== 'like') {
    throw { status: 400, code: 'INVALID_VOTE' };
  }

  const objetivo = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
  if (!objetivo) {
    throw { status: 404, code: 'USER_NOT_FOUND' };
  }

  const yaVoto = db
    .prepare('SELECT id FROM votes WHERE voter_id = ? AND target_id = ?')
    .get(yo, targetUserId);
  if (yaVoto) {
    throw { status: 400, code: 'ALREADY_VOTED' };
  }

  const premium = esPremium(yo);
  const hoyUTC = "date(created_at) = date('now')";

  // Límite diario de likes para cuentas gratis (los premium son ilimitados).
  if (vote === 'like' && !premium) {
    const dadosHoy = db
      .prepare(
        `SELECT COUNT(*) AS c FROM votes WHERE voter_id = ? AND vote = 'like' AND ${hoyUTC}`
      )
      .get(yo).c;
    if (dadosHoy >= FREE_LIKES_POR_DIA) {
      throw { status: 403, code: 'LIKE_LIMIT_REACHED' };
    }
  }

  // Límite diario de SUPER likes para cuentas gratis (premium: ilimitados).
  if (isSuper && !premium) {
    const superHoy = db
      .prepare(
        `SELECT COUNT(*) AS c FROM votes
         WHERE voter_id = ? AND vote = 'like' AND is_super = 1 AND ${hoyUTC}`
      )
      .get(yo).c;
    if (superHoy >= FREE_SUPERLIKES_POR_DIA) {
      throw { status: 403, code: 'SUPERLIKE_LIMIT_REACHED' };
    }
  }

  db.prepare(
    'INSERT INTO votes (voter_id, target_id, vote, is_super, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(yo, targetUserId, vote, isSuper ? 1 : 0, new Date().toISOString());

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

      return { ok: true, match: true, matchId: match.id, super: !!isSuper };
    }
  }

  return { ok: true, match: false, super: !!isSuper };
}

// POST /api/votes — Vota "like" o "pass" sobre otro usuario.
// Acepta {targetUserId, vote, super?}: super=true solo con vote:"like".
router.post('/votes', auth, (req, res) => {
  try {
    const targetUserId = Number(req.body && req.body.targetUserId);
    const vote = req.body && req.body.vote;
    const isSuper = !!(req.body && req.body.super);
    return res.json(votar(req.userId, targetUserId, vote, isSuper));
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.code || 'GENERIC' });
  }
});

// POST /api/like — Atajo para dar "like" (siempre like, nunca pass).
// Acepta {targetUserId, super?}.
router.post('/like', auth, (req, res) => {
  try {
    const targetUserId = Number(req.body && req.body.targetUserId);
    const isSuper = !!(req.body && req.body.super);
    return res.json(votar(req.userId, targetUserId, 'like', isSuper));
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.code || 'GENERIC' });
  }
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
      .prepare('SELECT id, display_name, dob, is_verified FROM users WHERE id = ?')
      .get(otroId);
    if (!u) continue; // El otro usuario fue borrado; lo saltamos.

    const perfil = db
      .prepare('SELECT town FROM profiles WHERE user_id = ?')
      .get(otroId);

    const ultimo = db
      .prepare(
        'SELECT text, type, created_at FROM messages WHERE match_id = ? ORDER BY id DESC LIMIT 1'
      )
      .get(m.id);

    // Texto visible del último mensaje (voz y regalos usan un marcador).
    let ultimoTexto = ultimo ? ultimo.text : '';
    if (ultimo && ultimo.type === 'voice') ultimoTexto = '🎤 Nota de voz';
    if (ultimo && ultimo.type === 'gift') ultimoTexto = '🎁 ¡Te envió un regalo!';

    resultado.push({
      matchId: m.id,
      user: {
        userId: u.id,
        displayName: u.display_name,
        age: calcularEdad(u.dob),
        town: (perfil && perfil.town) || '',
        photos: urlsFotos(u.id),
        isVerified: !!u.is_verified,
      },
      createdAt: m.created_at,
      lastMessage: ultimo
        ? { text: ultimoTexto, createdAt: ultimo.created_at }
        : null,
    });
  }

  return res.json({ matches: resultado });
});

module.exports = router;
