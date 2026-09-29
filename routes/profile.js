// routes/profile.js — Ver/editar el perfil y gestionar las fotos.

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { esPremium } = require('./billing');
const { limpiarTexto, calcularEdad } = require('../utils/validacion');
const { presencia } = require('../utils/presence');

const router = express.Router();

// Carpeta donde se guardan las fotos subidas.
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuración de multer: solo imágenes, máximo 5 MB por archivo,
// nombre de archivo aleatorio (crypto) + extensión original.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const aleatorio = crypto.randomBytes(16).toString('hex');
      cb(null, aleatorio + ext);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      const error = new Error('Tipo de archivo no permitido: solo imágenes.');
      error.code = 'INVALID_FILE_TYPE';
      cb(error);
    }
  },
});

const MAX_FOTOS = 3;
const MAX_VIDEO_BYTES = 30 * 1024 * 1024; // 30 MB

// Configuración de multer para el VIDEO de presentación: solo video/*,
// máximo 30 MB. Se guarda en la misma carpeta pública /uploads que las fotos.
const uploadVideo = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.mp4';
      const aleatorio = crypto.randomBytes(16).toString('hex');
      cb(null, 'video-' + aleatorio + ext);
    },
  }),
  limits: { fileSize: MAX_VIDEO_BYTES },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      const error = new Error('Tipo de archivo no permitido: solo videos.');
      error.code = 'INVALID_VIDEO';
      cb(error);
    }
  },
});

// Valores permitidos para gender y lookingFor.
const GENEROS = ['', 'mujer', 'hombre', 'no-binario', 'otro'];
const BUSCA = ['', 'mujeres', 'hombres', 'todos'];

// Arma el objeto de perfil que se devuelve al frontend.
function armarPerfil(userId) {
  const p = db
    .prepare(
      'SELECT bio, gender, looking_for, languages, interests, town, profile_video FROM profiles WHERE user_id = ?'
    )
    .get(userId);
  const u = db
    .prepare(
      'SELECT invisible_mode, verification_status, is_verified FROM users WHERE id = ?'
    )
    .get(userId);
  const fotos = db
    .prepare('SELECT id, filename, position FROM photos WHERE user_id = ? ORDER BY position ASC, id ASC')
    .all(userId);
  return {
    bio: p.bio || '',
    gender: p.gender || '',
    lookingFor: p.looking_for || '',
    languages: JSON.parse(p.languages || '[]'),
    interests: JSON.parse(p.interests || '[]'),
    town: p.town || '',
    photos: fotos.map((f) => ({
      id: f.id,
      url: '/uploads/' + f.filename,
      position: f.position,
    })),
    // Video de presentación (público, como las fotos): URL o null.
    videoUrl: p.profile_video ? '/uploads/' + p.profile_video : null,
    invisibleMode: !!(u && u.invisible_mode),
    verificationStatus: (u && u.verification_status) || 'none',
    isVerified: !!(u && u.is_verified),
  };
}

// GET /api/profile — Devuelve el perfil del usuario autenticado.
router.get('/', auth, (req, res) => {
  return res.json({ profile: armarPerfil(req.userId) });
});

// POST /api/profile/invisible — Activa/desactiva el modo invisible (Premium).
// Con el modo invisible, tus visitas a perfiles NO se registran.
router.post('/invisible', auth, (req, res) => {
  if (!esPremium(req.userId)) {
    return res.status(403).json({ error: 'PREMIUM_REQUIRED' });
  }
  const enabled = req.body && req.body.enabled;
  // Aceptamos true/false, 1/0 y "true"/"false".
  const valor =
    enabled === true || enabled === 1 || enabled === 'true' || enabled === '1'
      ? 1
      : 0;
  db.prepare('UPDATE users SET invisible_mode = ? WHERE id = ?').run(
    valor,
    req.userId
  );
  return res.json({ invisibleMode: !!valor });
});

// GET /api/profile/:userId — Perfil público de OTRO usuario.
// Registra la visita (una por día por pareja) para "Quién vio tu perfil".
router.get('/:userId', auth, (req, res) => {
  const otroId = Number(req.params.userId);
  if (!Number.isInteger(otroId)) {
    return res.status(404).json({ error: 'USER_NOT_FOUND' });
  }

  const u = db
    .prepare('SELECT id, display_name, dob, is_verified, last_seen, invisible_mode FROM users WHERE id = ?')
    .get(otroId);
  if (!u) {
    return res.status(404).json({ error: 'USER_NOT_FOUND' });
  }

  const yo = req.userId;

  // Si hay bloqueo en cualquier dirección, no se muestra nada.
  if (otroId !== yo) {
    const bloqueado = db
      .prepare(
        `SELECT 1 FROM blocks
         WHERE (blocker_id = ? AND blocked_id = ?)
            OR (blocker_id = ? AND blocked_id = ?)`
      )
      .get(yo, otroId, otroId, yo);
    if (bloqueado) {
      return res.status(403).json({ error: 'BLOCKED' });
    }

    // Registrar la visita (una por día por pareja), SALVO que yo esté en
    // modo invisible: el índice único (viewer, viewed, fecha) hace que
    // solo se guarde una por día (INSERT OR IGNORE).
    const invisible = db
      .prepare('SELECT invisible_mode FROM users WHERE id = ?')
      .get(yo);
    if (!invisible || !invisible.invisible_mode) {
      db.prepare(
        `INSERT OR IGNORE INTO profile_views (viewer_id, viewed_id, created_at)
         VALUES (?, ?, ?)`
      ).run(yo, otroId, new Date().toISOString());
    }
  }

  const p = armarPerfil(otroId);
  // El modo invisible y el estado de verificación son privados: no se
  // le muestran a otros usuarios (isVerified sí es público: el badge ✅).
  delete p.invisibleMode;
  delete p.verificationStatus;
  // Estado en línea: si el otro está en modo invisible, aparece desconectado.
  const pres = presencia(u.last_seen, u.invisible_mode);
  return res.json({
    profile: Object.assign(
      {
        userId: u.id,
        displayName: u.display_name,
        age: calcularEdad(u.dob),
        isVerified: !!u.is_verified,
        online: pres.online,
        lastSeen: pres.lastSeen,
      },
      p
    ),
  });
});

// PUT /api/profile — Actualiza los campos del perfil (solo los enviados).
// Todo se sanitiza: trim + límites de longitud.
router.put('/', auth, (req, res) => {
  const { bio, gender, lookingFor, languages, interests, town } = req.body || {};
  const cambios = {};

  if (bio !== undefined) {
    const limpio = limpiarTexto(bio);
    if (limpio.length > 500) {
      return res.status(400).json({ error: 'INVALID_BIO' });
    }
    cambios.bio = limpio;
  }

  if (gender !== undefined) {
    if (typeof gender !== 'string' || !GENEROS.includes(gender)) {
      return res.status(400).json({ error: 'INVALID_GENDER' });
    }
    cambios.gender = gender;
  }

  if (lookingFor !== undefined) {
    if (typeof lookingFor !== 'string' || !BUSCA.includes(lookingFor)) {
      return res.status(400).json({ error: 'INVALID_LOOKING_FOR' });
    }
    cambios.looking_for = lookingFor;
  }

  if (languages !== undefined) {
    if (!Array.isArray(languages) || languages.length > 20) {
      return res.status(400).json({ error: 'INVALID_LANGUAGES' });
    }
    const limpios = [];
    for (const idioma of languages) {
      const t = limpiarTexto(idioma);
      if (!t || t.length > 10) {
        return res.status(400).json({ error: 'INVALID_LANGUAGES' });
      }
      limpios.push(t);
    }
    cambios.languages = JSON.stringify(limpios);
  }

  if (interests !== undefined) {
    if (!Array.isArray(interests) || interests.length > 10) {
      return res.status(400).json({ error: 'INVALID_INTERESTS' });
    }
    const limpios = [];
    for (const interes of interests) {
      const t = limpiarTexto(interes);
      if (!t || t.length > 20) {
        return res.status(400).json({ error: 'INVALID_INTERESTS' });
      }
      limpios.push(t);
    }
    cambios.interests = JSON.stringify(limpios);
  }

  if (town !== undefined) {
    const limpio = limpiarTexto(town);
    if (limpio.length > 60) {
      return res.status(400).json({ error: 'INVALID_TOWN' });
    }
    cambios.town = limpio;
  }

  // Solo actualizamos las columnas que llegaron en la petición.
  const columnas = Object.keys(cambios);
  if (columnas.length > 0) {
    const set = columnas.map((c) => `${c} = ?`).join(', ');
    const valores = columnas.map((c) => cambios[c]);
    valores.push(new Date().toISOString(), req.userId);
    db.prepare(`UPDATE profiles SET ${set}, updated_at = ? WHERE user_id = ?`).run(...valores);
  }

  return res.json({ profile: armarPerfil(req.userId) });
});

// POST /api/profile/photos — Sube una foto (campo "photo"). Máximo 3 por usuario.
router.post('/photos', auth, upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'NO_FILE' });
  }

  const conteo = db
    .prepare('SELECT COUNT(*) AS n FROM photos WHERE user_id = ?')
    .get(req.userId).n;

  if (conteo >= MAX_FOTOS) {
    // Ya tiene 3: borramos el archivo recién subido y rechazamos.
    try {
      fs.unlinkSync(req.file.path);
    } catch (e) {
      // Nada que hacer si ya no existe.
    }
    return res.status(400).json({ error: 'TOO_MANY_PHOTOS' });
  }

  db.prepare(
    'INSERT INTO photos (user_id, filename, position, created_at) VALUES (?, ?, ?, ?)'
  ).run(req.userId, req.file.filename, conteo, new Date().toISOString());

  return res.status(201).json({ photos: armarPerfil(req.userId).photos });
});

// DELETE /api/profile/photos/:id — Borra una foto propia (registro + archivo).
router.delete('/photos/:id', auth, (req, res) => {
  const foto = db
    .prepare('SELECT user_id, filename FROM photos WHERE id = ?')
    .get(req.params.id);

  if (!foto) {
    return res.status(404).json({ error: 'PHOTO_NOT_FOUND' });
  }
  if (foto.user_id !== req.userId) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  try {
    fs.unlinkSync(path.join(uploadsDir, foto.filename));
  } catch (e) {
    // El archivo ya no existía; igual borramos el registro.
  }
  db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);

  return res.json({ ok: true });
});

// POST /api/profile/video — Sube el video de presentación (campo "video").
// Solo UNO por perfil: si ya había, el viejo se borra del disco.
router.post('/video', auth, uploadVideo.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'NO_FILE' });
  }

  const anterior = db
    .prepare('SELECT profile_video FROM profiles WHERE user_id = ?')
    .get(req.userId);

  db.prepare('UPDATE profiles SET profile_video = ?, updated_at = ? WHERE user_id = ?')
    .run(req.file.filename, new Date().toISOString(), req.userId);

  // Borra el video anterior para no acumular archivos huérfanos.
  if (anterior && anterior.profile_video) {
    try {
      fs.unlinkSync(path.join(uploadsDir, anterior.profile_video));
    } catch (e) {
      // Ya no existía; no pasa nada.
    }
  }

  return res.status(201).json({ videoUrl: '/uploads/' + req.file.filename });
});

// DELETE /api/profile/video — Borra el video de presentación propio.
router.delete('/video', auth, (req, res) => {
  const anterior = db
    .prepare('SELECT profile_video FROM profiles WHERE user_id = ?')
    .get(req.userId);

  if (!anterior || !anterior.profile_video) {
    return res.status(404).json({ error: 'VIDEO_NOT_FOUND' });
  }

  db.prepare('UPDATE profiles SET profile_video = NULL, updated_at = ? WHERE user_id = ?')
    .run(new Date().toISOString(), req.userId);

  try {
    fs.unlinkSync(path.join(uploadsDir, anterior.profile_video));
  } catch (e) {
    // El archivo ya no existía; igual borramos el registro.
  }

  return res.json({ ok: true });
});

module.exports = router;
