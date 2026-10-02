// routes/verification.js — Verificación de perfil con selfie y revisión manual.
// Flujo:
//   1. El usuario sube una selfie NUEVA (distinta a sus fotos de perfil,
//      comprobado por hash SHA-256), confirma que tiene 18+ y acepta las
//      pautas de decencia.
//   2. El perfil queda "pending" (en revisión) y NO sale en descubrimiento.
//   3. El admin aprueba o rechaza (con motivo) desde /admin.
// Solo al aprobar, el perfil queda verificado con el badge ✅.

const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { grantAchievement } = require('../utils/achievements');
const { nombreArchivo } = require('../utils/media');

const router = express.Router();

// Motivos de rechazo válidos (códigos estables para i18n en el cliente).
const REJECT_REASONS = [
  'FACE_NOT_CLEAR',
  'FACE_COVERED',
  'PROVOCATIVE',
  'NOT_REAL',
  'UNDERAGE_SUSPECT',
];

// Las selfies de verificación NO son públicas y van a la DB como BLOB
// (fase 2 persistencia: el disco de Render es efímero, la DB se replica).
const upload = multer({
  storage: multer.memoryStorage(),
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

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
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
  // Con memoryStorage no hay archivo en disco: no hay nada que limpiar.

  // Segunda capa 18+: declaración explícita obligatoria.
  if (req.body.age_confirm !== '1' && req.body.age_confirm !== 'true') {
    return res.status(400).json({ error: 'AGE_CONFIRM_REQUIRED' });
  }
  // Aceptación de las pautas de decencia obligatoria.
  if (req.body.guidelines_accept !== '1' && req.body.guidelines_accept !== 'true') {
    return res.status(400).json({ error: 'GUIDELINES_ACCEPT_REQUIRED' });
  }

  const actual = db
    .prepare('SELECT is_verified, verification_status, verification_photo FROM users WHERE id = ?')
    .get(req.userId);
  if (!actual) {
    return res.status(404).json({ error: 'USER_NOT_FOUND' });
  }
  if (actual.is_verified) {
    return res.json({ status: 'verified', isVerified: true });
  }

  // Hash de la selfie subida (directo del buffer en memoria).
  const hashSelfie = sha256Buffer(req.file.buffer);

  // La selfie NO puede ser una foto que ya está en el perfil: tiene que
  // ser una foto nueva tomada ahora (prueba básica de "persona real").
  const fotos = db.prepare('SELECT data FROM photos WHERE user_id = ? AND data IS NOT NULL').all(req.userId);
  for (const f of fotos) {
    if (sha256Buffer(f.data) === hashSelfie) {
      return res.status(400).json({ error: 'SELFIE_SAME_AS_PHOTO' });
    }
  }

  // Si había una selfie pendiente/rechazada anterior, el UPDATE la reemplaza.
  const filename = nombreArchivo('verif', req.file.originalname);
  db.prepare(
    `UPDATE users
     SET verification_status = 'pending',
         verification_photo = ?,
         verification_data = ?,
         verification_mime = ?,
         verification_reject_reason = NULL,
         age_confirmed = 1
     WHERE id = ?`
  ).run(filename, req.file.buffer, req.file.mimetype, req.userId);

  return res.json({ status: 'pending', isVerified: false });
});

module.exports = router;
module.exports.REJECT_REASONS = REJECT_REASONS;
