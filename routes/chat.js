// routes/chat.js — Mensajes dentro de un match.
// Solo los dos miembros del match pueden leer/escribir, y si hay bloqueo
// entre ellos el chat queda cerrado (403 BLOCKED).
// Tipos de mensaje: 'text' (normal), 'voice' (nota de voz) y 'gift' (regalo).

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { auth, getJwtSecret } = require('../middleware/auth');
const jwt = require('jsonwebtoken');

const router = express.Router();

const MAX_TEXTO = 1000;
const MAX_VOICE_BYTES = 2 * 1024 * 1024; // 2 MB

// Las notas de voz NO son públicas: van a ./private/voice y se sirven
// con autenticación (GET /api/chat/voice/:archivo?token=<JWT>).
const voiceDir = path.join(__dirname, '..', 'private', 'voice');
if (!fs.existsSync(voiceDir)) {
  fs.mkdirSync(voiceDir, { recursive: true });
}

const uploadVoz = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, voiceDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.webm';
      cb(null, 'voz-' + crypto.randomBytes(12).toString('hex') + ext);
    },
  }),
  limits: { fileSize: MAX_VOICE_BYTES },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      const error = new Error('Solo se permiten archivos de audio.');
      error.code = 'INVALID_FILE_TYPE';
      cb(error);
    }
  },
});

// Busca el match solo si el usuario autenticado es uno de los dos miembros.
function obtenerMatch(matchId, userId) {
  return db
    .prepare(
      'SELECT id, user1_id, user2_id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)'
    )
    .get(matchId, userId, userId);
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

// GET /api/chat/:matchId/messages — Historial (con ?after=<id> para traer solo lo nuevo).
router.get('/:matchId/messages', auth, (req, res) => {
  const match = obtenerMatch(req.params.matchId, req.userId);
  if (!match) {
    return res.status(404).json({ error: 'MATCH_NOT_FOUND' });
  }

  const otroId = match.user1_id === req.userId ? match.user2_id : match.user1_id;
  if (hayBloqueo(req.userId, otroId)) {
    return res.status(403).json({ error: 'BLOCKED' });
  }

  const after = Number(req.query.after);
  let mensajes;
  if (Number.isInteger(after) && after > 0) {
    mensajes = db
      .prepare(
        'SELECT id, sender_id, text, type, audio_url, created_at FROM messages WHERE match_id = ? AND id > ? ORDER BY id ASC'
      )
      .all(match.id, after);
  } else {
    mensajes = db
      .prepare(
        'SELECT id, sender_id, text, type, audio_url, created_at FROM messages WHERE match_id = ? ORDER BY id ASC'
      )
      .all(match.id);
  }

  return res.json({
    messages: mensajes.map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      text: m.text,
      type: m.type || 'text',
      audioUrl: m.audio_url || null,
      createdAt: m.created_at,
    })),
  });
});

// POST /api/chat/:matchId/messages — Envía un mensaje (texto ≤ 1000, no vacío).
router.post('/:matchId/messages', auth, (req, res) => {
  const match = obtenerMatch(req.params.matchId, req.userId);
  if (!match) {
    return res.status(404).json({ error: 'MATCH_NOT_FOUND' });
  }

  const otroId = match.user1_id === req.userId ? match.user2_id : match.user1_id;
  if (hayBloqueo(req.userId, otroId)) {
    return res.status(403).json({ error: 'BLOCKED' });
  }

  const texto = typeof req.body.text === 'string' ? req.body.text.trim() : '';
  if (!texto) {
    return res.status(400).json({ error: 'EMPTY_MESSAGE' });
  }
  if (texto.length > MAX_TEXTO) {
    return res.status(400).json({ error: 'MESSAGE_TOO_LONG' });
  }

  const ahora = new Date().toISOString();
  const nuevo = db
    .prepare(
      'INSERT INTO messages (match_id, sender_id, text, created_at) VALUES (?, ?, ?, ?)'
    )
    .run(match.id, req.userId, texto, ahora);

  return res.status(201).json({
    message: {
      id: nuevo.lastInsertRowid,
      senderId: req.userId,
      text: texto,
      type: 'text',
      audioUrl: null,
      createdAt: ahora,
    },
  });
});

// POST /api/chat/:matchId/voice — Nota de voz (campo "audio", máx. 2 MB).
// Solo miembros del match y sin bloqueo. Se guarda como mensaje type='voice'.
router.post('/:matchId/voice', auth, uploadVoz.single('audio'), (req, res) => {
  const match = obtenerMatch(req.params.matchId, req.userId);
  if (!match) {
    try { fs.unlinkSync(req.file.path); } catch (e) { /* nada */ }
    return res.status(404).json({ error: 'MATCH_NOT_FOUND' });
  }

  const otroId = match.user1_id === req.userId ? match.user2_id : match.user1_id;
  if (hayBloqueo(req.userId, otroId)) {
    try { fs.unlinkSync(req.file.path); } catch (e) { /* nada */ }
    return res.status(403).json({ error: 'BLOCKED' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'NO_FILE' });
  }

  const ahora = new Date().toISOString();
  const audioUrl = '/api/chat/voice/' + req.file.filename;
  const nuevo = db
    .prepare(
      `INSERT INTO messages (match_id, sender_id, text, type, audio_url, created_at)
       VALUES (?, ?, '', 'voice', ?, ?)`
    )
    .run(match.id, req.userId, audioUrl, ahora);

  return res.status(201).json({
    message: {
      id: nuevo.lastInsertRowid,
      senderId: req.userId,
      text: '',
      type: 'voice',
      audioUrl,
      createdAt: ahora,
    },
  });
});

// GET /api/chat/voice/:archivo?token=<JWT> — Sirve la nota de voz.
// El <audio> del navegador no manda Authorization, así que el JWT va en
// el query. Solo la pueden oír los dos miembros del match (sin bloqueo).
router.get('/voice/:archivo', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  let userId = null;
  try {
    const datos = jwt.verify(token, getJwtSecret());
    userId = datos.userId;
  } catch (e) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  // Sin "../" ni rutas raras: solo el nombre del archivo.
  const archivo = path.basename(req.params.archivo || '');
  if (!archivo || !/^voz-[a-f0-9]+\.[a-z0-9]+$/.test(archivo)) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  const mensaje = db
    .prepare("SELECT match_id, sender_id FROM messages WHERE type = 'voice' AND audio_url = ?")
    .get('/api/chat/voice/' + archivo);
  if (!mensaje) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }

  const match = obtenerMatch(mensaje.match_id, userId);
  if (!match) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  const otroId = match.user1_id === userId ? match.user2_id : match.user1_id;
  if (hayBloqueo(userId, otroId)) {
    return res.status(403).json({ error: 'BLOCKED' });
  }

  const ruta = path.join(voiceDir, archivo);
  if (!fs.existsSync(ruta)) {
    return res.status(404).json({ error: 'NOT_FOUND' });
  }
  return res.sendFile(ruta);
});

module.exports = router;
