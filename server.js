// server.js — Punto de entrada del backend de Citas NH.
// Arranca Express, sirve archivos estáticos, monta las rutas de la API
// y maneja los errores de forma centralizada.

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Importar db.js crea la carpeta ./data y las tablas si no existen.
const db = require('./db');

const app = express();

// --- Webhook de Stripe ---------------------------------------------------
// Necesita el cuerpo RAW (sin parsear) para verificar la firma, así que se
// registra ANTES de express.json(): si el JSON se parsea primero, la firma
// ya no coincide y Stripe rechaza el webhook.
const billing = require('./routes/billing');
app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  billing.webhook
);

// El cuerpo JSON de las peticiones no puede pasar de 1 MB.
app.use(express.json({ limit: '1mb' }));

// --- Archivos estáticos ------------------------------------------------
// /uploads → las fotos de perfil subidas por los usuarios.
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
// Fase 2 persistencia: los archivos viven como BLOB en la DB (replicada a
// R2). Esta ruta los sirve desde la DB; si no están, pasa al static de
// abajo (compatibilidad con archivos viejos que sigan en disco).
const { servirBlob, nombreSano } = require('./utils/media');
app.get('/uploads/:filename', (req, res, next) => {
  const filename = req.params.filename || '';
  if (!nombreSano(filename)) return res.status(404).json({ error: 'NOT_FOUND' });
  const foto = db.prepare('SELECT data, mime FROM photos WHERE filename = ?').get(filename);
  if (foto && foto.data) return servirBlob(res, foto.data, foto.mime);
  const video = db
    .prepare('SELECT profile_video_data AS data, profile_video_mime AS mime FROM profiles WHERE profile_video = ?')
    .get(filename);
  if (video && video.data) return servirBlob(res, video.data, video.mime);
  return next();
});
app.use('/uploads', express.static(uploadsDir));

// public/ → el frontend (lo construye otro agente; si la carpeta no existe,
// express.static simplemente deja pasar la petición al siguiente manejador).
// PWA: el manifest se sirve con su MIME oficial y el service worker sin
// caché agresiva para que las actualizaciones lleguen de inmediato.
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('manifest.json') || filePath.endsWith('manifest.webmanifest')) {
      res.setHeader('Content-Type', 'application/manifest+json');
    }
    if (filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// --- Rutas de la API ---------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/discover', require('./routes/discover'));
app.use('/api', require('./routes/matches')); // POST /api/votes, GET /api/matches
app.use('/api/chat', require('./routes/chat'));
app.use('/api/calls', require('./routes/calls')); // señalización WebRTC
app.use('/api/verification', require('./routes/verification'));
app.use('/api/gifts', require('./routes/gifts').router);
app.use('/api/events', require('./routes/events'));
app.use('/api/stories', require('./routes/stories'));
app.use('/api/icebreakers', require('./routes/icebreakers'));
app.use('/api/referral', require('./routes/referral'));
app.use('/api/achievements', require('./routes/achievements'));
app.use('/api/push', require('./routes/push')); // Web Push: suscripciones
app.use('/api/map', require('./routes/map')); // mapa de solteros (conteos)
app.use('/api/credits', require('./routes/credits')); // saldo de créditos 💳
app.use('/api/matchmaker', require('./routes/matchmaker')); // modo celestino 💘
app.use('/api/top-picks', require('./routes/toppicks'));
app.use('/api', require('./routes/social')); // /api/blocks, /api/reports
app.use('/api', billing.router); // /api/billing/*, /api/admirers
app.use('/api', require('./routes/admin')); // /api/admin/* (panel de administración)

// --- Blog público --------------------------------------------------------
// Sin login: GET /blog (lista) y GET /blog/:slug (artículo).
app.use('/blog', require('./routes/blog'));

// --- Panel de administración -----------------------------------------------
// Página aparte (no forma parte del SPA): GET /admin → public/admin.html.
// El acceso se protege con la clave ADMIN_KEY (ver routes/admin.js).
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'), (err) => {
    if (err) res.status(404).json({ error: 'NOT_FOUND' });
  });
});

// --- Páginas legales ---------------------------------------------------
// El frontend creará public/terminos.html y public/privacidad.html.
// Si todavía no existen, respondemos 404 en JSON sin romper el servidor.
app.get('/terminos', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terminos.html'), (err) => {
    if (err) res.status(404).json({ error: 'NOT_FOUND' });
  });
});

app.get('/privacidad', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacidad.html'), (err) => {
    if (err) res.status(404).json({ error: 'NOT_FOUND' });
  });
});

// Ruta de API desconocida → 404 en JSON.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'NOT_FOUND' });
});

// --- Manejador central de errores --------------------------------------
// (Tiene que ir al final y llevar 4 parámetros para que Express lo use.)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Archivo demasiado grande (límite de multer: 5 MB fotos, 30 MB video).
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'FILE_TOO_LARGE' });
  }
  // El fileFilter rechazó el archivo (no es imagen / no es video).
  if (err.code === 'INVALID_FILE_TYPE') {
    return res.status(400).json({ error: 'INVALID_FILE_TYPE' });
  }
  if (err.code === 'INVALID_VIDEO') {
    return res.status(400).json({ error: 'INVALID_VIDEO' });
  }
  // JSON mal formado en el cuerpo de la petición.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'INVALID_JSON' });
  }
  console.error('Error no controlado:', err);
  return res.status(500).json({ error: 'INTERNAL_ERROR' });
});

// --- Arranque -----------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Citas NH escuchando en el puerto ${PORT}`);
});
