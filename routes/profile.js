// routes/profile.js — Ver/editar el perfil y gestionar las fotos.

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { limpiarTexto, calcularEdad } = require('../utils/validacion');

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

// Valores permitidos para gender y lookingFor.
const GENEROS = ['', 'mujer', 'hombre', 'no-binario', 'otro'];
const BUSCA = ['', 'mujeres', 'hombres', 'todos'];

// Arma el objeto de perfil que se devuelve al frontend.
function armarPerfil(userId) {
  const p = db
    .prepare(
      'SELECT bio, gender, looking_for, languages, interests, town FROM profiles WHERE user_id = ?'
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
  };
}

// GET /api/profile — Devuelve el perfil del usuario autenticado.
router.get('/', auth, (req, res) => {
  return res.json({ profile: armarPerfil(req.userId) });
});

// GET /api/profile/:userId — Perfil público de OTRO usuario.
// Registra la visita (una por día por pareja) para "Quién vio tu perfil".
router.get('/:userId', auth, (req, res) => {
  const otroId = Number(req.params.userId);
  if (!Number.isInteger(otroId)) {
    return res.status(404).json({ error: 'USER_NOT_FOUND' });
  }

  const u = db
    .prepare('SELECT id, display_name, dob FROM users WHERE id = ?')
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

    // Registrar la visita: el índice único (viewer, viewed, fecha) hace que
    // solo se guarde una por día por pareja (INSERT OR IGNORE).
    db.prepare(
      `INSERT OR IGNORE INTO profile_views (viewer_id, viewed_id, created_at)
       VALUES (?, ?, ?)`
    ).run(yo, otroId, new Date().toISOString());
  }

  const p = armarPerfil(otroId);
  return res.json({
    profile: Object.assign(
      {
        userId: u.id,
        displayName: u.display_name,
        age: calcularEdad(u.dob),
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

module.exports = router;
