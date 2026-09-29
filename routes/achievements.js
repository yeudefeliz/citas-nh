// routes/achievements.js — Logros y niveles del usuario.
//
//   GET /api/achievements → {level, levelName, total, earnedCount, achievements}
//   levelName es la CLAVE de i18n ("ach_level_1" … "ach_level_5"): el
//   frontend la traduce al idioma activo.

const express = require('express');
const { auth } = require('../middleware/auth');
const { getAchievements } = require('../utils/achievements');

const router = express.Router();

// GET /api/achievements — Estado de logros del usuario autenticado.
router.get('/', auth, (req, res) => {
  return res.json(getAchievements(req.userId));
});

module.exports = router;
