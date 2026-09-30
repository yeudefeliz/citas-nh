// routes/discover.js — Tarjeta de "descubrir" (estilo swipe).
// Excluye: al propio usuario, a quienes ya votó, y bloqueos en ambas direcciones.
// Filtros opcionales por query: minAge, maxAge, maxDistance (millas).
// Los perfiles con boost activo salen primero.

const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { calcularEdad } = require('../utils/validacion');
const { distanciaEntreZips } = require('../utils/zipcoords');
const { presencia } = require('../utils/presence');
const { gastarCredito } = require('../utils/creditos');

const router = express.Router();

// Devuelve las URLs públicas de las fotos de un usuario.
function urlsFotos(userId) {
  const fotos = db
    .prepare('SELECT filename FROM photos WHERE user_id = ? ORDER BY position ASC, id ASC')
    .all(userId);
  return fotos.map((f) => '/uploads/' + f.filename);
}

// ¿El boost de este usuario sigue activo?
function boostActivo(boostUntil, ahoraIso) {
  return !!(boostUntil && boostUntil > ahoraIso);
}

// GET /api/discover — Una tarjeta por llamada, o { card: null } si no hay.
router.get('/', auth, (req, res) => {
  const yo = req.userId;

  // --- Filtros (todos opcionales y saneados) ---
  let minAge = parseInt(req.query.minAge, 10);
  let maxAge = parseInt(req.query.maxAge, 10);
  let maxDistance = Number(req.query.maxDistance);
  if (!Number.isInteger(minAge) || minAge < 18 || minAge > 99) minAge = null;
  if (!Number.isInteger(maxAge) || maxAge < 18 || maxAge > 99) maxAge = null;
  if (minAge !== null && maxAge !== null && minAge > maxAge) {
    const tmp = minAge;
    minAge = maxAge;
    maxAge = tmp;
  }
  if (!Number.isFinite(maxDistance) || maxDistance <= 0 || maxDistance > 3000) {
    maxDistance = null;
  }

  const yoFila = db.prepare('SELECT zip FROM users WHERE id = ?').get(yo);
  const miZip = yoFila ? yoFila.zip : null;
  const ahoraIso = new Date().toISOString();

  // Traemos un lote aleatorio de candidatos y filtramos en JS
  // (la base es pequeña; así el cálculo de edad/distancia queda exacto).
  const filas = db
    .prepare(
      `SELECT u.id, u.display_name, u.dob, u.zip, u.boost_until, u.is_verified,
              u.last_seen, u.invisible_mode,
              p.bio, p.gender, p.looking_for, p.languages, p.interests, p.town,
              p.profile_video
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       WHERE u.id != ?
         AND u.is_verified = 1
         AND u.id NOT IN (SELECT target_id FROM votes WHERE voter_id = ?)
         AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
         AND u.id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?)
       ORDER BY RANDOM()
       LIMIT 100`
    )
    .all(yo, yo, yo, yo);

  const candidatas = [];
  for (const fila of filas) {
    const edad = calcularEdad(fila.dob);
    if (minAge !== null && edad < minAge) continue;
    if (maxAge !== null && edad > maxAge) continue;

    let distancia = null;
    if (maxDistance !== null && miZip) {
      distancia = distanciaEntreZips(miZip, fila.zip);
      // Si no hay coordenadas del ZIP, el perfil se incluye igual.
      if (distancia !== null && distancia > maxDistance) continue;
    }

    candidatas.push({ fila, distancia });
  }

  // Boost activo primero; el resto queda en el orden aleatorio del lote.
  candidatas.sort((a, b) => {
    const ba = boostActivo(a.fila.boost_until, ahoraIso) ? 1 : 0;
    const bb = boostActivo(b.fila.boost_until, ahoraIso) ? 1 : 0;
    return bb - ba;
  });

  const elegida = candidatas[0];
  if (!elegida) {
    return res.json({ card: null });
  }
  // Ver fotos de perfil cuesta 1 crédito (gratis si es Premium).
  const cobro = gastarCredito(yo, 1);
  if (!cobro.ok) {
    return res.status(402).json({ error: cobro.error, refillInSec: cobro.refillInSec });
  }
  const fila = elegida.fila;
  const pres = presencia(fila.last_seen, fila.invisible_mode);

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
      videoUrl: fila.profile_video ? '/uploads/' + fila.profile_video : null,
      distanceMi:
        elegida.distancia === null ? null : Math.round(elegida.distancia),
      boosted: boostActivo(fila.boost_until, ahoraIso),
      isVerified: !!fila.is_verified,
      online: pres.online,
      lastSeen: pres.lastSeen,
    },
  });
});

module.exports = router;
