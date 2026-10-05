// utils/owner.js — Reconocimiento del dueño/fundador de la app.
//
// Regla: la PRIMERA cuenta registrada en la app (el id menor de users)
// es la del fundador. Esa cuenta queda reconocida como dueña:
// is_owner = 1, verificada automáticamente (is_verified = 1,
// verification_status = 'verified', age_confirmed = 1) y con la
// insignia 👑 Fundador en su perfil y tarjetas.
// También cuentan como dueños los correos listados en la variable de
// entorno OWNER_EMAILS (separados por coma), si algún día hace falta
// agregar otra cuenta dueña sin tocar código.
//
// Esto NO cambia las reglas para los demás usuarios: todos los demás
// siguen pasando por la verificación manual con selfie.

const db = require('../db');

function correosDuenno() {
  return (process.env.OWNER_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function esDuenno(user) {
  if (!user) return false;
  const lista = correosDuenno();
  if (user.email && lista.includes(String(user.email).toLowerCase())) {
    return true;
  }
  const primero = db.prepare('SELECT MIN(id) AS id FROM users').get();
  return !!(primero && primero.id === user.id);
}

// Si el usuario es el dueño, asegura sus banderas de dueño/verificado.
// Idempotente: solo escribe cuando falta algo. Nunca lanza errores.
function asegurarDuenno(userId) {
  try {
    const u = db
      .prepare('SELECT id, email, is_owner, is_verified FROM users WHERE id = ?')
      .get(userId);
    if (!u || !esDuenno(u)) return false;
    if (!u.is_owner || !u.is_verified) {
      db.prepare(
        `UPDATE users
            SET is_owner = 1, is_verified = 1,
                verification_status = 'verified', age_confirmed = 1,
                verification_reject_reason = NULL
          WHERE id = ?`
      ).run(userId);
    }
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { esDuenno, asegurarDuenno };
