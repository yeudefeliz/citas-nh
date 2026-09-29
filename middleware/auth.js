// middleware/auth.js — Protege las rutas que requieren sesión.
// Lee el encabezado "Authorization: Bearer <token>", verifica el JWT y
// guarda el id del usuario en req.userId. Si falta o es inválido → 401.

const jwt = require('jsonwebtoken');

// db se usa solo para el UPDATE ligero de last_seen (con throttle).
// Está en try/catch para que un problema de disco jamás rompa la auth.
let db = null;
try {
  db = require('../db');
} catch (e) {
  db = null;
}

// Bandera para mostrar el aviso del secreto solo una vez por arranque.
let avisoMostrado = false;

// El secreto del JWT sale de la variable de entorno JWT_SECRET.
// Si no existe, se usa un secreto de desarrollo y se avisa por consola
// (en producción SIEMPRE hay que definir JWT_SECRET).
function getJwtSecret() {
  const secreto = process.env.JWT_SECRET;
  if (!secreto && !avisoMostrado) {
    console.warn(
      '⚠️  AVISO: JWT_SECRET no está definido. Usando secreto de desarrollo. ' +
      'Define JWT_SECRET en producción.'
    );
    avisoMostrado = true;
  }
  return secreto || 'dev-secret-cambia-esto';
}

function auth(req, res, next) {
  const encabezado = req.headers.authorization || '';
  const [esquema, token] = encabezado.split(' ');

  if (esquema !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  try {
    const datos = jwt.verify(token, getJwtSecret());
    // El token se firmó con { userId }, así que lo recuperamos de ahí.
    req.userId = datos.userId;

    // Última conexión (throttle: solo se escribe si tiene +2 min de
    // antigüedad, para no saturar la base en cada petición).
    if (db) {
      try {
        const ahora = new Date().toISOString();
        const hace2min = new Date(Date.now() - 2 * 60 * 1000).toISOString();
        db.prepare(
          'UPDATE users SET last_seen = ? WHERE id = ? AND (last_seen IS NULL OR last_seen < ?)'
        ).run(ahora, datos.userId, hace2min);
      } catch (e) {
        // Si falla, la petición sigue igual; no es crítico.
      }
    }

    next();
  } catch (e) {
    // Token expirado, mal firmado o corrupto → 401.
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
}

module.exports = { auth, getJwtSecret };
