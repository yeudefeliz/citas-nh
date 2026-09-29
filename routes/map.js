// routes/map.js — Mapa de solteros cerca (solo conteos, nunca identidades).
//   GET /api/map/singles → [{zip, town, lat, lng, count}]
//
// PRIVACIDAD:
// - Solo usuarios activos (last_seen en los últimos 30 días) y con foto.
// - Los usuarios con modo invisible NO aparecen.
// - Se excluyen bloqueos en ambas direcciones.
// - Solo se devuelve el conteo por zona; jamás quién está en cada zona.

const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { coordsDeZip } = require('../utils/zipcoords');

const router = express.Router();

// GET /api/map/singles — Conteos de solteros por ZIP.
router.get('/singles', auth, (req, res) => {
  const hace30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const filas = db
    .prepare(
      `SELECT u.zip AS zip, p.town AS town, COUNT(*) AS n
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       WHERE u.last_seen >= ?
         AND (u.invisible_mode IS NULL OR u.invisible_mode = 0)
         AND EXISTS (SELECT 1 FROM photos WHERE user_id = u.id)
         AND u.id != ?
         AND NOT EXISTS (
           SELECT 1 FROM blocks
           WHERE (blocker_id = ? AND blocked_id = u.id)
              OR (blocker_id = u.id AND blocked_id = ?)
         )
       GROUP BY u.zip, p.town`
    )
    .all(hace30d, req.userId, req.userId, req.userId);

  // Agrupa por ZIP (suma los pueblos); town = el pueblo más común del ZIP.
  const porZip = {};
  for (const f of filas) {
    const z = (f.zip || '').trim();
    if (!porZip[z]) porZip[z] = { count: 0, towns: {} };
    porZip[z].count += f.n;
    const t = (f.town || '').trim();
    if (t) porZip[z].towns[t] = (porZip[z].towns[t] || 0) + f.n;
  }

  const singles = [];
  for (const [zip, d] of Object.entries(porZip)) {
    const coords = coordsDeZip(zip);
    if (!coords) continue; // ZIP fuera del mapa: no se muestra
    const topTown = Object.entries(d.towns).sort((a, b) => b[1] - a[1])[0];
    singles.push({
      zip,
      town: topTown ? topTown[0] : '',
      lat: coords.lat,
      lng: coords.lng,
      count: d.count,
    });
  }

  return res.json({ singles });
});

module.exports = router;
