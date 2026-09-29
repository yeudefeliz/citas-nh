// routes/stories.js — Stories de 24 horas (foto o video corto).
//   POST   /api/stories            → subir una story (multipart, campo "media")
//   GET    /api/stories/feed       → stories de las últimas 24 h (matches primero)
//   DELETE /api/stories/:id        → borrar mi propia story
//   GET    /api/stories/media/:archivo?token=<JWT> → sirve el archivo (privado)
// Las stories expiran solas: el feed solo muestra created_at > ahora − 24 h.

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { auth, getJwtSecret } = require('../middleware/auth');
const { calcularEdad } = require('../utils/validacion');

const router = express.Router();

const MAX_STORY_BYTES = 15 * 1024 * 1024; // 15 MB

// Los archivos de stories NO son públicos: viven en ./private/stories y se
// sirven con autenticación (igual que las notas de voz).
const storiesDir = path.join(__dirname, '..', 'private', 'stories');
if (!fs.existsSync(storiesDir)) {
  fs.mkdirSync(storiesDir, { recursive: true });
}

const uploadStory = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, storiesDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      cb(null, 'story-' + crypto.randomBytes(12).toString('hex') + ext);
    },
  }),
  limits: { fileSize: MAX_STORY_BYTES },
  fileFilter: (req, file, cb) => {
    const mt = file.mimetype || '';
    if (mt.startsWith('image/') || mt.startsWith('video/')) {
      cb(null, true);
    } else {
      const error = new Error('Solo se permiten fotos o videos.');
      error.code = 'INVALID_FILE_TYPE';
      cb(error);
    }
  },
});

// Borra del disco las stories viejas (más de 24 h) del usuario: limpieza ligera.
function limpiarViejas(userId) {
  const viejas = db
    .prepare(
      `SELECT id, media_url FROM stories
       WHERE user_id = ? AND datetime(created_at) < datetime('now', '-24 hours')`
    )
    .all(userId);
  const borrar = db.prepare('DELETE FROM stories WHERE id = ?');
  for (const s of viejas) {
    borrar.run(s.id);
    const archivo = path.basename(s.media_url || '');
    if (archivo) {
      try {
        fs.unlinkSync(path.join(storiesDir, archivo));
      } catch (e) {
        /* ya no existía */
      }
    }
  }
}

// ¿Existe bloqueo entre estos dos usuarios (en cualquier dirección)?
function hayBloqueo(a, b) {
  return !!db
    .prepare(
      `SELECT 1 FROM blocks
       WHERE (blocker_id = ? AND blocked_id = ?)
          OR (blocker_id = ? AND blocked_id = ?)`
    )
    .get(a, b, b, a);
}

// ¿Tengo match con este usuario?
function hayMatch(a, b) {
  return !!db
    .prepare(
      `SELECT 1 FROM matches
       WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)`
    )
    .get(a, b, b, a);
}

function fotoPerfil(userId) {
  const f = db
    .prepare('SELECT filename FROM photos WHERE user_id = ? ORDER BY position ASC, id ASC LIMIT 1')
    .get(userId);
  return f ? '/uploads/' + f.filename : null;
}

// POST /api/stories — Subir una story (foto o video, máx. 15 MB).
router.post('/', auth, uploadStory.single('media'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'NO_FILE' });
  }
  limpiarViejas(req.userId);

  const mediaType = (req.file.mimetype || '').startsWith('video/') ? 'video' : 'photo';
  const ahora = new Date().toISOString();
  const nuevo = db
    .prepare(
      `INSERT INTO stories (user_id, media_url, media_type, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(req.userId, '/api/stories/media/' + req.file.filename, mediaType, ahora);

  return res.status(201).json({
    story: {
      id: nuevo.lastInsertRowid,
      mediaUrl: '/api/stories/media/' + req.file.filename,
      mediaType,
      createdAt: ahora,
    },
  });
});

// GET /api/stories/feed — Stories de las últimas 24 h, agrupadas por usuario.
// Matches primero, luego el resto; sin bloqueos en ninguna dirección.
router.get('/feed', auth, (req, res) => {
  const yo = req.userId;
  const filas = db
    .prepare(
      `SELECT s.id, s.user_id, s.media_url, s.media_type, s.created_at,
              u.display_name, u.dob
       FROM stories s
       JOIN users u ON u.id = s.user_id
       WHERE s.user_id != ?
         AND datetime(s.created_at) > datetime('now', '-24 hours')
       ORDER BY s.created_at DESC
       LIMIT 200`
    )
    .all(yo);

  const grupos = new Map();
  for (const f of filas) {
    if (hayBloqueo(yo, f.user_id)) continue;
    if (!grupos.has(f.user_id)) {
      grupos.set(f.user_id, {
        userId: f.user_id,
        displayName: f.display_name,
        age: calcularEdad(f.dob),
        photo: fotoPerfil(f.user_id),
        isMatch: hayMatch(yo, f.user_id),
        stories: [],
      });
    }
    grupos.get(f.user_id).stories.push({
      id: f.id,
      mediaUrl: f.media_url,
      mediaType: f.media_type,
      createdAt: f.created_at,
    });
  }

  // Ordena las stories de cada usuario: la más nueva primero.
  const lista = Array.from(grupos.values()).map((g) => {
    g.stories.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return g;
  });
  // Matches primero; dentro de cada grupo, el dueño más reciente primero.
  lista.sort((a, b) => {
    if (a.isMatch !== b.isMatch) return a.isMatch ? -1 : 1;
    const ta = a.stories[0] ? a.stories[0].createdAt : '';
    const tb = b.stories[0] ? b.stories[0].createdAt : '';
    return ta < tb ? 1 : -1;
  });

  // Mis propias stories (para el botón + y para borrarlas).
  const mias = db
    .prepare(
      `SELECT id, media_url, media_type, created_at FROM stories
       WHERE user_id = ? AND datetime(created_at) > datetime('now', '-24 hours')
       ORDER BY created_at DESC`
    )
    .all(yo)
    .map((s) => ({
      id: s.id,
      mediaUrl: s.media_url,
      mediaType: s.media_type,
      createdAt: s.created_at,
    }));

  return res.json({ feed: lista, mine: mias });
});

// DELETE /api/stories/:id — Borrar mi propia story.
router.delete('/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  const story = db.prepare('SELECT user_id, media_url FROM stories WHERE id = ?').get(id);
  if (!story || story.user_id !== req.userId) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }
  db.prepare('DELETE FROM stories WHERE id = ?').run(id);
  const archivo = path.basename(story.media_url || '');
  if (archivo) {
    try {
      fs.unlinkSync(path.join(storiesDir, archivo));
    } catch (e) {
      /* ya no existía */
    }
  }
  return res.json({ ok: true });
});

// GET /api/stories/media/:archivo?token=<JWT> — Sirve el archivo de la story.
// Solo si el que pide puede verla (sin bloqueo con el dueño, o es el dueño).
router.get('/media/:archivo', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  let userId = null;
  try {
    const datos = jwt.verify(token, getJwtSecret());
    userId = datos.userId;
  } catch (e) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  const archivo = path.basename(req.params.archivo || '');
  if (!archivo || !/^story-[a-f0-9]+\.[a-z0-9]+$/.test(archivo)) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  const story = db
    .prepare('SELECT user_id FROM stories WHERE media_url = ?')
    .get('/api/stories/media/' + archivo);
  if (!story) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }
  if (story.user_id !== userId && hayBloqueo(userId, story.user_id)) {
    return res.status(403).json({ error: 'BLOCKED' });
  }

  const ruta = path.join(storiesDir, archivo);
  if (!fs.existsSync(ruta)) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }
  return res.sendFile(ruta);
});

module.exports = router;
