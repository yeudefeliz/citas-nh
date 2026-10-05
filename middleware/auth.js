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

// Reconocimiento del dueño/fundador (ver utils/owner.js). También en
// try/catch: si falla, la autenticación sigue normal.
let asegurarDuenno = null;
try {
  asegurarDuenno = require('../utils/owner').asegurarDuenno;
} catch (e) {
  asegurarDuenno = null;
}
// Usuarios ya revisados en este proceso (el chequeo de dueño se hace
// una vez por usuario por arranque; es idempotente).
const duennoRevisado = new Set();

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

    // Verificar que el usuario TODAVÍA existe en la DB. En Render el disco
    // es efímero: si el servicio se reinició, la DB se borró pero el JWT
    // del teléfono sobrevivió. Sin este chequeo, las rutas explotan con
    // INTERNAL_ERROR en vez de pedir login de nuevo.
    if (db) {
      try {
        const existe = db
          .prepare('SELECT 1 FROM users WHERE id = ?')
          .get(datos.userId);
        if (!existe) {
          return res.status(401).json({ error: 'SESSION_EXPIRED' });
        }
      } catch (e) {
        // Si la DB falla aquí, se deja pasar y la ruta lo manejará.
      }
    }

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

    // Reconocimiento del dueño/fundador: la primera cuenta de la app
    // queda verificada con insignia 👑 sin pasar por la revisión manual.
    if (asegurarDuenno && !duennoRevisado.has(datos.userId)) {
      duennoRevisado.add(datos.userId);
      try {
        asegurarDuenno(datos.userId);
      } catch (e) {
        // No es crítico; la petición sigue igual.
      }
    }

    next();
  } catch (e) {
    // Token expirado, mal firmado o corrupto → 401.
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
}

module.exports = { auth, getJwtSecret };
