// routes/credits.js — Saldo de créditos.
// Endpoints (montados bajo /api):
//   GET /api/credits → {credits, maxCredits, unlimited, isPremium, refillInSec} (auth)

const express = require('express');
const { auth } = require('../middleware/auth');
const { saldoCreditos } = require('../utils/creditos');

const router = express.Router();

router.get('/', auth, (req, res) => {
  const saldo = saldoCreditos(req.userId);
  if (!saldo) return res.status(404).json({ error: 'USER_NOT_FOUND' });
  return res.json(saldo);
});

module.exports = router;
