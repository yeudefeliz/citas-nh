// routes/toppicks.js — Top Picks 💎: 3 perfiles diarios "elegidos para ti".
//   GET /api/top-picks → {picks:[{...3 tarjetas}], premium}
// Scoring: looking_for compatible + intereses en común + idiomas en común
// + edad cercana + misma ciudad. Excluye ya votados, bloqueados y matches.
// Determinista por día: el orden no cambia al recargar (seed = userId + fecha).

const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { calcularEdad } = require('../utils/validacion');
const { esPremium } = require('./billing');

const router = express.Router();

// Hash simple (djb2) para el desempate determinista del día.
function hashDia(semilla) {
  let h = 5381;
  for (let i = 0; i < semilla.length; i++) {
    h = ((h << 5) + h + semilla.charCodeAt(i)) >>> 0;
  }
  return h;
}

function urlsFotos(userId) {
  return db
    .prepare('SELECT filename FROM photos WHERE user_id = ? ORDER BY position ASC, id ASC')
    .all(userId)
    .map((f) => '/uploads/' + f.filename);
}

function puntaje(yo, cand) {
  let puntos = 0;
  if (yo.looking_for && cand.looking_for && yo.looking_for === cand.looking_for) {
    puntos += 3; // buscan lo mismo
  }
  const misIntereses = new Set(JSON.parse(yo.interests || '[]').map((i) => String(i).toLowerCase()));
  const susIntereses = JSON.parse(cand.interests || '[]').map((i) => String(i).toLowerCase());
  const enComun = susIntereses.filter((i) => misIntereses.has(i)).length;
  puntos += Math.min(6, enComun * 2);
  const misIdiomas = new Set(JSON.parse(yo.languages || '[]'));
  const susIdiomas = JSON.parse(cand.languages || '[]');
  puntos += Math.min(2, susIdiomas.filter((l) => misIdiomas.has(l)).length);
  const difEdad = Math.abs(calcularEdad(yo.dob) - calcularEdad(cand.dob));
  if (difEdad <= 3) puntos += 2;
  else if (difEdad <= 6) puntos += 1;
  if (yo.town && cand.town && yo.town.trim().toLowerCase() === cand.town.trim().toLowerCase()) {
    puntos += 2; // misma ciudad
  }
  return puntos;
}

// GET /api/top-picks — 3 perfiles del día.
router.get('/', auth, (req, res) => {
  const yo = req.userId;
  const hoy = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const miPerfil = db
    .prepare(
      `SELECT u.dob, p.looking_for, p.interests, p.languages, p.town
       FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = ?`
    )
    .get(yo);
  if (!miPerfil) {
    return res.status(404).json({ error: 'USER_NOT_FOUND' });
  }

  const filas = db
    .prepare(
      `SELECT u.id, u.display_name, u.dob, u.is_verified,
              p.bio, p.gender, p.looking_for, p.languages, p.interests, p.town
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       WHERE u.id != ?
         AND u.id NOT IN (SELECT target_id FROM votes WHERE voter_id = ?)
         AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
         AND u.id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?)
         AND u.id NOT IN (
           SELECT CASE WHEN user1_id = ? THEN user2_id ELSE user1_id END
           FROM matches WHERE user1_id = ? OR user2_id = ?
         )
       LIMIT 200`
    )
    .all(yo, yo, yo, yo, yo, yo, yo);

  const puntuados = filas.map((f) => ({
    fila: f,
    puntos: puntaje(miPerfil, f),
    desempate: hashDia(`${yo}:${hoy}:${f.id}`),
  }));

  // Más puntos primero; el desempate del día mantiene el orden estable.
  puntuados.sort((a, b) => b.puntos - a.puntos || a.desempate - b.desempate);

  const picks = puntuados.slice(0, 3).map(({ fila }) => ({
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
    isVerified: !!fila.is_verified,
  }));

  return res.json({ picks, premium: esPremium(yo) });
});

module.exports = router;
