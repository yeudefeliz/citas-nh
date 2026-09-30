// routes/verification.js — Verificación de perfil con selfie y revisión manual.
// Flujo:
//   1. El usuario sube una selfie NUEVA (distinta a sus fotos de perfil,
//      comprobado por hash SHA-256), confirma que tiene 18+ y acepta las
//      pautas de decencia.
//   2. El perfil queda "pending" (en revisión) y NO sale en descubrimiento.
//   3. El admin aprueba o rechaza (con motivo) desde /admin.
// Solo al aprobar, el perfil queda verificado con el badge ✅.

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { grantAchievement } = require('../utils/achievements');

const router = express.Router();

// Motivos de rechazo válidos (códigos estables para i18n en el cliente).
const REJECT_REASONS = [
  'FACE_NOT_CLEAR',
  'FACE_COVERED',
  'PROVOCATIVE',
  'NOT_REAL',
  'UNDERAGE_SUSPECT',
];

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

function borrarSelfie(filename) {
  if (!filename) return;
  // Solo borra dentro del directorio de verificación (anti path traversal).
  const base = path.basename(filename);
  try {
    fs.unlinkSync(path.join(verifDir, base));
  } catch (e) {
    /* ya no existe; nada que hacer */
  }
}

// GET /api/verification/status — estado actual de mi verificación.
router.get('/status', auth, (req, res) => {
  const u = db
    .prepare(
      'SELECT verification_status, is_verified, age_confirmed, verification_reject_reason FROM users WHERE id = ?'
    )
    .get(req.userId);
  if (!u) return res.status(404).json({ error: 'USER_NOT_FOUND' });
  return res.json({
    status: u.verification_status || 'none',
    isVerified: !!u.is_verified,
    ageConfirmed: !!u.age_confirmed,
    rejectReason:
      u.verification_status === 'rejected' ? u.verification_reject_reason || 'FACE_NOT_CLEAR' : null,
  });
});

// POST /api/verification/request — sube una selfie (campo "selfie").
// Campos requeridos: age_confirm=1 (declara 18+) y guidelines_accept=1
// (acepta las pautas de decencia). La selfie debe ser una imagen válida y
// DISTINTA a las fotos del perfil. El perfil queda "pending" hasta que el
// admin la apruebe o rechace.
router.post('/request', auth, upload.single('selfie'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'NO_FILE' });
  }
  const limpiar = () => {
    try {
      fs.unlinkSync(req.file.path);
    } catch (e) {
      /* nada */
    }
  };

  // Segunda capa 18+: declaración explícita obligatoria.
  if (req.body.age_confirm !== '1' && req.body.age_confirm !== 'true') {
    limpiar();
    return res.status(400).json({ error: 'AGE_CONFIRM_REQUIRED' });
  }
  // Aceptación de las pautas de decencia obligatoria.
  if (req.body.guidelines_accept !== '1' && req.body.guidelines_accept !== 'true') {
    limpiar();
    return res.status(400).json({ error: 'GUIDELINES_ACCEPT_REQUIRED' });
  }

  const actual = db
    .prepare('SELECT is_verified, verification_status, verification_photo FROM users WHERE id = ?')
    .get(req.userId);
  if (!actual) {
    limpiar();
    return res.status(404).json({ error: 'USER_NOT_FOUND' });
  }
  if (actual.is_verified) {
    limpiar();
    return res.json({ status: 'verified', isVerified: true });
  }

  // Hash de la selfie subida.
  let hashSelfie;
  try {
    hashSelfie = sha256Archivo(req.file.path);
  } catch (e) {
    limpiar();
    return res.status(400).json({ error: 'INVALID_FILE' });
  }

  // La selfie NO puede ser una foto que ya está en el perfil: tiene que
  // ser una foto nueva tomada ahora (prueba básica de "persona real").
  const fotos = db.prepare('SELECT filename FROM photos WHERE user_id = ?').all(req.userId);
  for (const f of fotos) {
    const rutaFoto = path.join(__dirname, '..', 'uploads', f.filename);
    try {
      if (sha256Archivo(rutaFoto) === hashSelfie) {
        limpiar();
        return res.status(400).json({ error: 'SELFIE_SAME_AS_PHOTO' });
      }
    } catch (e) {
      // La foto vieja ya no existe en disco; la saltamos.
    }
  }

  // Si había una selfie pendiente/rechazada anterior, se reemplaza.
  borrarSelfie(actual.verification_photo);

  db.prepare(
    `UPDATE users
     SET verification_status = 'pending',
         verification_photo = ?,
         verification_reject_reason = NULL,
         age_confirmed = 1
     WHERE id = ?`
  ).run(path.basename(req.file.path), req.userId);

  return res.json({ status: 'pending', isVerified: false });
});

module.exports = router;
module.exports.REJECT_REASONS = REJECT_REASONS;
