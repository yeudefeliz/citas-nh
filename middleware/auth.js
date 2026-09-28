// middleware/auth.js — Protege las rutas que requieren sesión.
// Lee el encabezado "Authorization: Bearer <token>", verifica el JWT y
// guarda el id del usuario en req.userId. Si falta o es inválido → 401.

const jwt = require('jsonwebtoken');

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
    next();
  } catch (e) {
    // Token expirado, mal firmado o corrupto → 401.
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
}

module.exports = { auth, getJwtSecret };
