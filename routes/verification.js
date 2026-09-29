// routes/verification.js — Verificación de perfil con selfie.
// Flujo simple y automático: el usuario sube una selfie NUEVA (distinta a
// sus fotos de perfil, comprobado por hash SHA-256 del archivo). Si pasa
// la comprobación, el perfil queda verificado con el badge ✅.

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Las selfies de verificación NO son públicas: van a ./private/verification.
const verifDir = path.join(__dirname, '..', 'private', 'verification');
if (!fs.existsSync(verifDir)) {
  fs.mkdirSync(verifDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, verifDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      cb(null, 'verif-' + crypto.randomBytes(12).toString('hex') + ext);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      const error = new Error('Solo se permiten imágenes.');
      error.code = 'INVALID_FILE_TYPE';
      cb(error);
    }
  },
});

function sha256Archivo(ruta) {
  const datos = fs.readFileSync(ruta);
  return crypto.createHash('sha256').update(datos).digest('hex');
}

// GET /api/verification/status — estado actual de mi verificación.
router.get('/status', auth, (req, res) => {
  const u = db
    .prepare('SELECT verification_status, is_verified FROM users WHERE id = ?')
    .get(req.userId);
  if (!u) return res.status(404).json({ error: 'USER_NOT_FOUND' });
  return res.json({
    status: u.verification_status || 'none',
    isVerified: !!u.is_verified,
  });
});

// POST /api/verification/request — sube una selfie (campo "selfie").
// La selfie debe ser una imagen válida y DISTINTA a las fotos del perfil.
// Si pasa, el perfil queda verificado automáticamente.
router.post('/request', auth, upload.single('selfie'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'NO_FILE' });
  }

  const yaVerificado = db
    .prepare('SELECT is_verified FROM users WHERE id = ?')
    .get(req.userId);
  if (yaVerificado && yaVerificado.is_verified) {
    try { fs.unlinkSync(req.file.path); } catch (e) { /* nada */ }
    return res.json({ status: 'verified', isVerified: true });
  }

  // Hash de la selfie subida.
  let hashSelfie;
  try {
    hashSelfie = sha256Archivo(req.file.path);
  } catch (e) {
    try { fs.unlinkSync(req.file.path); } catch (e2) { /* nada */ }
    return res.status(400).json({ error: 'INVALID_FILE' });
  }

  // La selfie NO puede ser una foto que ya está en el perfil: tiene que
  // ser una foto nueva tomada ahora (prueba básica de "persona real").
  const fotos = db
    .prepare('SELECT filename FROM photos WHERE user_id = ?')
    .all(req.userId);
  for (const f of fotos) {
    const rutaFoto = path.join(__dirname, '..', 'uploads', f.filename);
    try {
      if (sha256Archivo(rutaFoto) === hashSelfie) {
        try { fs.unlinkSync(req.file.path); } catch (e) { /* nada */ }
        return res.status(400).json({ error: 'SELFIE_SAME_AS_PHOTO' });
      }
    } catch (e) {
      // La foto vieja ya no existe en disco; la saltamos.
    }
  }

  db.prepare(
    `UPDATE users SET verification_status = 'verified', is_verified = 1 WHERE id = ?`
  ).run(req.userId);

  return res.json({ status: 'verified', isVerified: true });
});

module.exports = router;
