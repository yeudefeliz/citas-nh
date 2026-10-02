// utils/media.js — Helpers para archivos guardados como BLOB en la DB.
// Fase 2 de persistencia: el disco de Render es efímero, pero la DB se
// replica a R2 con Litestream. Guardar los bytes en la DB hace que las
// fotos, videos, selfies y notas de voz sobrevivan reinicios.

const crypto = require('crypto');
const path = require('path');

// Nombre de archivo aleatorio + extensión original (sin rutas raras).
function nombreArchivo(prefijo, originalname) {
  const ext = path.extname(originalname || '').toLowerCase();
  const aleatorio = crypto.randomBytes(16).toString('hex');
  return (prefijo ? prefijo + '-' : '') + aleatorio + ext;
}

// Sirve un Buffer con su MIME. Los nombres son aleatorios → cacheable.
function servirBlob(res, buffer, mime) {
  if (!buffer || buffer.length === 0) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }
  res.set('Content-Type', mime || 'application/octet-stream');
  res.set('Content-Length', String(buffer.length));
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  return res.send(buffer);
}

// ¿Nombre de archivo sano? (anti path traversal para las rutas /uploads/:f)
function nombreSano(nombre) {
  return (
    typeof nombre === 'string' &&
    /^[a-z0-9][a-z0-9\-_]*\.[a-z0-9]+$/i.test(nombre) &&
    !nombre.includes('..')
  );
}

module.exports = { nombreArchivo, servirBlob, nombreSano };
