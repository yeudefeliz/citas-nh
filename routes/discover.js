// routes/discover.js — Tarjeta aleatoria de "descubrir" (estilo swipe).
// Excluye: al propio usuario, a quienes ya votó, y bloqueos en ambas direcciones.

const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { calcularEdad } = require('../utils/validacion');

const router = express.Router();

// Devuelve las URLs públicas de las fotos de un usuario.
function urlsFotos(userId) {
  const fotos = db
    .prepare('SELECT filename FROM photos WHERE user_id = ? ORDER BY position ASC, id ASC')
    .all(userId);
  return fotos.map((f) => '/uploads/' + f.filename);
}

// GET /api/discover — Una tarjeta aleatoria por llamada, o { card: null } si no hay.
router.get('/', auth, (req, res) => {
  const yo = req.userId;

  const fila = db
    .prepare(
      `SELECT u.id, u.display_name, u.dob,
              p.bio, p.gender, p.looking_for, p.languages, p.interests, p.town
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       WHERE u.id != ?
         AND u.id NOT IN (SELECT target_id FROM votes WHERE voter_id = ?)
         AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
         AND u.id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?)
       ORDER BY RANDOM()
       LIMIT 1`
    )
    .get(yo, yo, yo, yo);

  if (!fila) {
    return res.json({ card: null });
  }

  return res.json({
    card: {
      userId: fila.id,
      displayName: fila.display_name,
      age: calcularEdad(fila.dob),
      town: fila.town || '',
      bio: fila.bio || '',
      gender: fila.gender || '',
      lookingFor: fila.looking_for || '',
      languages: JSON.parse(fila.languages || '[]'),
      interests: JSON.parse(fila.interests || '[]'),
      photos: urlsFotos(fila.id),
    },
  });
});

module.exports = router;
