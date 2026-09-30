// utils/creditos.js — Sistema de créditos de Citas NH.
// 10 créditos gratis que se recargan cada 6 horas (hasta el tope).
// Premium = créditos ilimitados (no se descuenta nada).
// Costos: ver fotos de perfil (tarjeta de Descubrir) = 1,
//         enviar mensaje o nota de voz = 1, abrir/leer conversación = 1.

const db = require('../db');

const MAX_CREDITS = 10;
const REFILL_MS = 6 * 60 * 60 * 1000; // 6 horas

// ¿El premium de este usuario está vigente? (más estricto que el flag solo:
// también respeta la fecha de fin del período).
function esPremiumVigente(userId) {
  const u = db
    .prepare('SELECT is_premium, premium_until FROM users WHERE id = ?')
    .get(userId);
  if (!u || !u.is_premium) return false;
  if (u.premium_until && u.premium_until <= new Date().toISOString()) return false;
  return true;
}

// Aplica la recarga si ya pasaron 6+ horas desde la última.
// Devuelve la fila actualizada {credits, credits_refilled_at}.
function aplicarRecarga(userId) {
  let fila = db
    .prepare('SELECT credits, credits_refilled_at FROM users WHERE id = ?')
    .get(userId);
  if (!fila) return null;
  const ahora = new Date();
  const ultima = fila.credits_refilled_at ? new Date(fila.credits_refilled_at) : null;
  if (!ultima || ahora - ultima >= REFILL_MS) {
    const iso = ahora.toISOString();
    db.prepare(
      'UPDATE users SET credits = ?, credits_refilled_at = ? WHERE id = ?'
    ).run(MAX_CREDITS, iso, userId);
    fila = { credits: MAX_CREDITS, credits_refilled_at: iso };
  } else if (fila.credits == null) {
    // Fila vieja sin saldo: arranca con el tope.
    db.prepare('UPDATE users SET credits = ? WHERE id = ?').run(MAX_CREDITS, userId);
    fila.credits = MAX_CREDITS;
  }
  return fila;
}

// Segundos hasta la próxima recarga (0 si ya toca recargar).
function segundosParaRecarga(fila) {
  const ultima = fila.credits_refilled_at ? new Date(fila.credits_refilled_at) : null;
  if (!ultima) return 0;
  const ms = REFILL_MS - (Date.now() - ultima.getTime());
  return Math.max(0, Math.ceil(ms / 1000));
}

// GET /api/credits → saldo actual (aplica recarga si corresponde).
function saldoCreditos(userId) {
  if (esPremiumVigente(userId)) {
    return {
      credits: MAX_CREDITS,
      maxCredits: MAX_CREDITS,
      unlimited: true,
      isPremium: true,
      refillInSec: 0,
    };
  }
  const fila = aplicarRecarga(userId);
  if (!fila) return null;
  return {
    credits: fila.credits,
    maxCredits: MAX_CREDITS,
    unlimited: false,
    isPremium: false,
    refillInSec: fila.credits >= MAX_CREDITS ? 0 : segundosParaRecarga(fila),
  };
}

// Intenta gastar `costo` créditos.
// → {ok:true, credits, refillInSec, unlimited} si se pudo,
//   {ok:false, error:'NO_CREDITS', credits:0, refillInSec} si no hay saldo.
function gastarCredito(userId, costo) {
  costo = Number.isInteger(costo) && costo > 0 ? costo : 1;
  if (esPremiumVigente(userId)) {
    return { ok: true, unlimited: true, credits: MAX_CREDITS, refillInSec: 0 };
  }
  const fila = aplicarRecarga(userId);
  if (!fila) return { ok: false, error: 'USER_NOT_FOUND', credits: 0, refillInSec: 0 };
  if (fila.credits < costo) {
    return { ok: false, error: 'NO_CREDITS', credits: 0, refillInSec: segundosParaRecarga(fila) };
  }
  const nuevo = fila.credits - costo;
  db.prepare('UPDATE users SET credits = ? WHERE id = ?').run(nuevo, userId);
  return { ok: true, credits: nuevo, refillInSec: nuevo >= MAX_CREDITS ? 0 : segundosParaRecarga(fila) };
}

module.exports = { MAX_CREDITS, REFILL_MS, saldoCreditos, gastarCredito, esPremiumVigente };
