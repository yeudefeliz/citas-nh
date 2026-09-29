// routes/referral.js — Invita amigos y gana super likes extra.
//   GET /api/referral → {code, link, count, bonusSuperlikes}
// El registro con ?ref=CODIGO se maneja en routes/auth.js.

const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Enlace público de registro con el código de referido.
function referralLink(req, code) {
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}/#/registro?ref=${encodeURIComponent(code)}`;
}

// GET /api/referral — Mi código, mi enlace, cuántos invitados y mi bonus.
router.get('/', auth, (req, res) => {
  const yo = db
    .prepare('SELECT referral_code, bonus_superlikes FROM users WHERE id = ?')
    .get(req.userId);
  if (!yo) {
    return res.status(404).json({ error: 'USER_NOT_FOUND' });
  }
  const count = db
    .prepare('SELECT COUNT(*) AS n FROM users WHERE referred_by = ?')
    .get(req.userId).n;
  return res.json({
    code: yo.referral_code,
    link: referralLink(req, yo.referral_code),
    count,
    bonusSuperlikes: yo.bonus_superlikes || 0,
  });
});

module.exports = router;
