// routes/auth.js — Registro, login, sesión actual y borrado de cuenta.

const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { auth, getJwtSecret } = require('../middleware/auth');
const { emailValido, zipValido, dobValida, calcularEdad } = require('../utils/validacion');

const router = express.Router();

// Carpeta donde se guardan las fotos (para borrarlas al eliminar la cuenta).
const uploadsDir = path.join(__dirname, '..', 'uploads');

// Construye el objeto público del usuario (NUNCA incluye password_hash).
function usuarioPublico(fila) {
  return {
    id: fila.id,
    email: fila.email,
    displayName: fila.display_name,
    zip: fila.zip,
  };
}

// Firma un token JWT válido por 7 días.
function firmarToken(userId) {
  return jwt.sign({ userId }, getJwtSecret(), { expiresIn: '7d' });
}

// POST /api/auth/register — Crea la cuenta y devuelve el token de sesión.
router.post('/register', (req, res) => {
  const { email, password, displayName, dob, zip } = req.body || {};

  // Validaciones en el servidor (el frontend puede mentir, el servidor no).
  if (!emailValido(email)) {
    return res.status(400).json({ error: 'INVALID_EMAIL' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'WEAK_PASSWORD' });
  }
  const nombre = typeof displayName === 'string' ? displayName.trim() : '';
  if (nombre.length < 2 || nombre.length > 30) {
    return res.status(400).json({ error: 'INVALID_NAME' });
  }
  if (!dobValida(dob)) {
    return res.status(400).json({ error: 'INVALID_DOB' });
  }
  if (calcularEdad(dob) < 18) {
    return res.status(400).json({ error: 'UNDERAGE' });
  }
  if (!zipValido(zip)) {
    return res.status(400).json({ error: 'INVALID_ZIP' });
  }

  const emailLimpio = email.trim().toLowerCase();
  const zipLimpio = zip.trim();

  // El email debe ser único.
  const existe = db.prepare('SELECT id FROM users WHERE email = ?').get(emailLimpio);
  if (existe) {
    return res.status(409).json({ error: 'EMAIL_TAKEN' });
  }

  // Guardamos el hash con bcrypt (10 rounds), jamás la contraseña en texto plano.
  const passwordHash = bcrypt.hashSync(password, 10);
  const ahora = new Date().toISOString();

  const resultado = db
    .prepare(
      'INSERT INTO users (email, password_hash, display_name, dob, zip, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(emailLimpio, passwordHash, nombre, dob, zipLimpio, ahora);

  // Todo usuario nuevo empieza con una fila de perfil vacía.
  db.prepare('INSERT INTO profiles (user_id, updated_at) VALUES (?, ?)').run(
    resultado.lastInsertRowid,
    ahora
  );

  const token = firmarToken(resultado.lastInsertRowid);
  return res.status(201).json({
    token,
    user: {
      id: resultado.lastInsertRowid,
      email: emailLimpio,
      displayName: nombre,
      zip: zipLimpio,
    },
  });
});

// POST /api/auth/login — Inicia sesión con email y contraseña.
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const emailLimpio = typeof email === 'string' ? email.trim().toLowerCase() : '';

  const fila = db.prepare('SELECT * FROM users WHERE email = ?').get(emailLimpio);

  // Mismo error si el email no existe o la contraseña está mal
  // (así no se le dice al atacante cuál de los dos falló).
  if (!fila || typeof password !== 'string' || !bcrypt.compareSync(password, fila.password_hash)) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }

  const token = firmarToken(fila.id);
  return res.json({ token, user: usuarioPublico(fila) });
});

// GET /api/auth/me — Devuelve los datos de la sesión actual.
router.get('/me', auth, (req, res) => {
  const fila = db
    .prepare('SELECT id, email, display_name, dob, zip FROM users WHERE id = ?')
    .get(req.userId);
  if (!fila) {
    return res.status(404).json({ error: 'USER_NOT_FOUND' });
  }
  return res.json({
    user: {
      id: fila.id,
      email: fila.email,
      displayName: fila.display_name,
      zip: fila.zip,
      dob: fila.dob,
    },
  });
});

// DELETE /api/auth/account — Borra la cuenta, sus fotos del disco y todo lo
// relacionado (las tablas hijas se borran solas por ON DELETE CASCADE).
router.delete('/account', auth, (req, res) => {
  const fotos = db
    .prepare('SELECT filename FROM photos WHERE user_id = ?')
    .all(req.userId);

  db.prepare('DELETE FROM users WHERE id = ?').run(req.userId);

  // Borrar los archivos de foto del disco (si alguno falla, no rompemos nada).
  for (const foto of fotos) {
    try {
      fs.unlinkSync(path.join(uploadsDir, foto.filename));
    } catch (e) {
      // El archivo ya no existía; seguimos con el siguiente.
    }
  }

  return res.json({ ok: true });
});

module.exports = router;
