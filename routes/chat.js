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
const { grantAchievement } = require('../utils/achievements');
const { presencia } = require('../utils/presence');
const { sendPush } = require('../utils/push');
const { gastarCredito } = require('../utils/creditos');
const { revisarBonusChat } = require('../utils/karma');
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

// Emojis permitidos para reaccionar a mensajes.
const EMOJIS_REACCION = ['❤️', '😂', '🔥', '😮', '😢', '👍'];

// Arma el resumen de reacciones de un mensaje: [{emoji, count, mine}].
function resumenReacciones(messageId, userId) {
  const filas = db
    .prepare(
      `SELECT emoji, COUNT(*) AS c,
              SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS mia
       FROM message_reactions WHERE message_id = ?
       GROUP BY emoji`
    )
    .all(userId, messageId);
  return filas.map((f) => ({
    emoji: f.emoji,
    count: f.c,
    mine: f.mia > 0,
  }));
}

// Arma el objeto público de un plan de cita para el chat.
function armarPlan(fila, yo) {
  if (!fila) return null;
  const creador = db
    .prepare('SELECT display_name FROM users WHERE id = ?')
    .get(fila.created_by);
  return {
    id: fila.id,
    place: fila.place,
    dateTime: fila.date_time,
    note: fila.note || '',
    status: fila.status, // 'proposed' | 'accepted' | 'declined'
    createdBy: fila.created_by,
    mine: fila.created_by === yo,
    creatorName: creador ? creador.display_name : '',
  };
}

// Adjunta el plan de cita a los mensajes type='dateplan' (text = planId).
function adjuntarPlanes(mensajes, yo) {
  const porId = {};
  return mensajes.map((m) => {
    const base = {
      id: m.id,
      senderId: m.sender_id,
      text: m.text,
      type: m.type || 'text',
      audioUrl: m.audio_url || null,
      createdAt: m.created_at,
      reactions: resumenReacciones(m.id, yo),
    };
    if (base.type === 'dateplan') {
      const planId = Number(m.text);
      if (!porId[planId]) {
        const fila = db.prepare('SELECT * FROM date_plans WHERE id = ?').get(planId);
        porId[planId] = armarPlan(fila, yo);
      }
      base.dateplan = porId[planId];
    }
    return base;
  });
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

  // Abrir la conversación (leer mensajes) cuesta 1 crédito.
  // El polling (?after=<id>) es gratis: solo se cobra al entrar.
  if (!req.query.after) {
    const cobro = gastarCredito(req.userId, 1);
    if (!cobro.ok) {
      return res.status(402).json({ error: cobro.error, refillInSec: cobro.refillInSec });
    }
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

  return res.json({ messages: adjuntarPlanes(mensajes, req.userId) });
});

// Push de "nuevo mensaje" al otro miembro, solo si NO está en línea
// (si está en línea ya lo ve por el polling; así no spameamos).
function pushSiAusente(matchId, emisorId, receptorId) {
  try {
    const receptor = db
      .prepare('SELECT last_seen, invisible_mode FROM users WHERE id = ?')
      .get(receptorId);
    if (!receptor) return;
    if (presencia(receptor.last_seen, receptor.invisible_mode).online) return;
    const emisor = db
      .prepare('SELECT display_name FROM users WHERE id = ?')
      .get(emisorId);
    sendPush(receptorId, 'message', {
      name: (emisor && emisor.display_name) || '',
      url: '/#/chat/' + matchId,
    });
  } catch (e) {
    /* el mensaje igual se envió */
  }
}

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

  // Enviar mensaje cuesta 1 crédito (gratis si es Premium).
  const cobro = gastarCredito(req.userId, 1);
  if (!cobro.ok) {
    return res.status(402).json({ error: cobro.error, refillInSec: cobro.refillInSec });
  }

  const ahora = new Date().toISOString();
  const nuevo = db
    .prepare(
      'INSERT INTO messages (match_id, sender_id, text, created_at) VALUES (?, ?, ?, ?)'
    )
    .run(match.id, req.userId, texto, ahora);

  // Logro "chatterbox": envió 50 mensajes (de cualquier tipo).
  const nuevosLogros = [];
  const enviados = db
    .prepare('SELECT COUNT(*) AS c FROM messages WHERE sender_id = ?')
    .get(req.userId).c;
  if (enviados >= 50 && grantAchievement(req.userId, 'chatterbox')) {
    nuevosLogros.push('chatterbox');
  }

  pushSiAusente(match.id, req.userId, otroId);

  // Bonus de Karma si este chat nació de una sugerencia de celestino.
  revisarBonusChat(match.id);

  return res.status(201).json({
    message: {
      id: nuevo.lastInsertRowid,
      senderId: req.userId,
      text: texto,
      type: 'text',
      audioUrl: null,
      createdAt: ahora,
      reactions: [],
    },
    newAchievements: nuevosLogros,
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

  // La nota de voz también cuesta 1 crédito (gratis si es Premium).
  const cobroVoz = gastarCredito(req.userId, 1);
  if (!cobroVoz.ok) {
    try { fs.unlinkSync(req.file.path); } catch (e) { /* nada */ }
    return res.status(402).json({ error: cobroVoz.error, refillInSec: cobroVoz.refillInSec });
  }

  const ahora = new Date().toISOString();
  const audioUrl = '/api/chat/voice/' + req.file.filename;
  const nuevo = db
    .prepare(
      `INSERT INTO messages (match_id, sender_id, text, type, audio_url, created_at)
       VALUES (?, ?, '', 'voice', ?, ?)`
    )
    .run(match.id, req.userId, audioUrl, ahora);

  // Logro "chatterbox": cuenta las notas de voz también.
  const nuevosLogros = [];
  const enviados = db
    .prepare('SELECT COUNT(*) AS c FROM messages WHERE sender_id = ?')
    .get(req.userId).c;
  if (enviados >= 50 && grantAchievement(req.userId, 'chatterbox')) {
    nuevosLogros.push('chatterbox');
  }

  pushSiAusente(match.id, req.userId, otroId);

  // Bonus de Karma si este chat nació de una sugerencia de celestino.
  revisarBonusChat(match.id);

  return res.status(201).json({
    message: {
      id: nuevo.lastInsertRowid,
      senderId: req.userId,
      text: '',
      type: 'voice',
      audioUrl,
      createdAt: ahora,
      reactions: [],
    },
    newAchievements: nuevosLogros,
  });
});

// POST /api/chat/:matchId/messages/:msgId/react — Reacciona a un mensaje.
// {emoji}: uno de ❤️ 😂 🔥 😮 😢 👍. Tocar el mismo emoji lo quita (toggle).
router.post('/:matchId/messages/:msgId/react', auth, (req, res) => {
  const match = obtenerMatch(req.params.matchId, req.userId);
  if (!match) {
    return res.status(404).json({ error: 'MATCH_NOT_FOUND' });
  }
  const otroId = match.user1_id === req.userId ? match.user2_id : match.user1_id;
  if (hayBloqueo(req.userId, otroId)) {
    return res.status(403).json({ error: 'BLOCKED' });
  }

  const emoji = req.body && req.body.emoji;
  if (!EMOJIS_REACCION.includes(emoji)) {
    return res.status(400).json({ error: 'INVALID_EMOJI' });
  }

  const msgId = Number(req.params.msgId);
  const mensaje = db
    .prepare('SELECT id FROM messages WHERE id = ? AND match_id = ?')
    .get(msgId, match.id);
  if (!mensaje) {
    return res.status(404).json({ error: 'MESSAGE_NOT_FOUND' });
  }

  const existente = db
    .prepare('SELECT emoji FROM message_reactions WHERE message_id = ? AND user_id = ?')
    .get(msgId, req.userId);

  if (existente && existente.emoji === emoji) {
    // Toggle: mismo emoji → se quita.
    db.prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?')
      .run(msgId, req.userId);
  } else if (existente) {
    // Cambia el emoji de su reacción.
    db.prepare('UPDATE message_reactions SET emoji = ? WHERE message_id = ? AND user_id = ?')
      .run(emoji, msgId, req.userId);
  } else {
    db.prepare('INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)')
      .run(msgId, req.userId, emoji);
  }

  return res.json({ reactions: resumenReacciones(msgId, req.userId) });
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

// POST /api/chat/:matchId/dateplan — Propone una cita: {place, dateTime, note?}.
// Crea el plan + un mensaje type='dateplan' que lo muestra en el chat.
router.post('/:matchId/dateplan', auth, (req, res) => {
  const match = obtenerMatch(req.params.matchId, req.userId);
  if (!match) {
    return res.status(404).json({ error: 'MATCH_NOT_FOUND' });
  }
  const otroId = match.user1_id === req.userId ? match.user2_id : match.user1_id;
  if (hayBloqueo(req.userId, otroId)) {
    return res.status(403).json({ error: 'BLOCKED' });
  }

  const lugar = typeof req.body.place === 'string' ? req.body.place.trim() : '';
  if (!lugar || lugar.length > 120) {
    return res.status(400).json({ error: 'INVALID_PLAN' });
  }
  const nota = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 300) : '';

  // Fecha/hora válida y en el futuro (con 1 h de gracia por relojes).
  const cuando = new Date(req.body.dateTime);
  if (isNaN(cuando.getTime()) || cuando.getTime() < Date.now() - 60 * 60 * 1000) {
    return res.status(400).json({ error: 'INVALID_PLAN' });
  }

  const ahora = new Date().toISOString();
  const plan = db
    .prepare(
      `INSERT INTO date_plans (match_id, created_by, place, date_time, note, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'proposed', ?)`
    )
    .run(match.id, req.userId, lugar, cuando.toISOString(), nota, ahora);

  const planId = plan.lastInsertRowid;
  const msg = db
    .prepare(
      `INSERT INTO messages (match_id, sender_id, text, type, created_at)
       VALUES (?, ?, ?, 'dateplan', ?)`
    )
    .run(match.id, req.userId, String(planId), ahora);

  const fila = db.prepare('SELECT * FROM date_plans WHERE id = ?').get(planId);
  return res.status(201).json({
    plan: armarPlan(fila, req.userId),
    message: {
      id: msg.lastInsertRowid,
      senderId: req.userId,
      text: String(planId),
      type: 'dateplan',
      audioUrl: null,
      createdAt: ahora,
      reactions: [],
      dateplan: armarPlan(fila, req.userId),
    },
  });
});

// POST /api/chat/:matchId/dateplan/:id/respond — Acepta o rechaza la cita.
// {accept: true/false}. Solo puede responder quien NO la propuso, y solo
// si sigue en estado 'proposed'. Al responder se publica un mensaje nuevo
// con la tarjeta actualizada (el polling del chat lo recoge solo).
router.post('/:matchId/dateplan/:id/respond', auth, (req, res) => {
  const match = obtenerMatch(req.params.matchId, req.userId);
  if (!match) {
    return res.status(404).json({ error: 'MATCH_NOT_FOUND' });
  }
  const otroId = match.user1_id === req.userId ? match.user2_id : match.user1_id;
  if (hayBloqueo(req.userId, otroId)) {
    return res.status(403).json({ error: 'BLOCKED' });
  }

  const planId = Number(req.params.id);
  const fila = db
    .prepare('SELECT * FROM date_plans WHERE id = ? AND match_id = ?')
    .get(planId, match.id);
  if (!fila) {
    return res.status(404).json({ error: 'PLAN_NOT_FOUND' });
  }
  if (fila.created_by === req.userId) {
    return res.status(403).json({ error: 'NOT_YOUR_PLAN' });
  }
  if (fila.status !== 'proposed') {
    return res.status(400).json({ error: 'PLAN_RESPONDED' });
  }

  const acepta = req.body && (req.body.accept === true || req.body.accept === 'true' || req.body.accept === 1);
  const nuevoEstado = acepta ? 'accepted' : 'declined';
  db.prepare('UPDATE date_plans SET status = ? WHERE id = ?').run(nuevoEstado, planId);

  // Push al que propuso la cita cuando el otro la acepta.
  if (acepta) {
    try {
      const quien = db
        .prepare('SELECT display_name FROM users WHERE id = ?')
        .get(req.userId);
      sendPush(fila.created_by, 'dateplan_accepted', {
        name: (quien && quien.display_name) || '',
        url: '/#/chat/' + match.id,
      });
    } catch (e) {
      /* la respuesta igual quedó guardada */
    }
  }

  const ahora = new Date().toISOString();
  const msg = db
    .prepare(
      `INSERT INTO messages (match_id, sender_id, text, type, created_at)
       VALUES (?, ?, ?, 'dateplan', ?)`
    )
    .run(match.id, req.userId, String(planId), ahora);

  const actualizada = db.prepare('SELECT * FROM date_plans WHERE id = ?').get(planId);
  return res.json({
    plan: armarPlan(actualizada, req.userId),
    message: {
      id: msg.lastInsertRowid,
      senderId: req.userId,
      text: String(planId),
      type: 'dateplan',
      audioUrl: null,
      createdAt: ahora,
      reactions: [],
      dateplan: armarPlan(actualizada, req.userId),
    },
  });
});

module.exports = router;
