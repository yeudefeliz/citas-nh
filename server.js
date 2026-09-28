// server.js — Punto de entrada del backend de Citas NH.
// Arranca Express, sirve archivos estáticos, monta las rutas de la API
// y maneja los errores de forma centralizada.

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Importar db.js crea la carpeta ./data y las tablas si no existen.
require('./db');

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
app.use('/uploads', express.static(uploadsDir));

// public/ → el frontend (lo construye otro agente; si la carpeta no existe,
// express.static simplemente deja pasar la petición al siguiente manejador).
app.use(express.static(path.join(__dirname, 'public')));

// --- Rutas de la API ---------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/discover', require('./routes/discover'));
app.use('/api', require('./routes/matches')); // POST /api/votes, GET /api/matches
app.use('/api/chat', require('./routes/chat'));
app.use('/api', require('./routes/social')); // /api/blocks, /api/reports
app.use('/api', billing.router); // /api/billing/*, /api/admirers

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
  // Archivo demasiado grande (límite de multer: 5 MB).
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'FILE_TOO_LARGE' });
  }
  // El fileFilter rechazó el archivo (no es imagen).
  if (err.code === 'INVALID_FILE_TYPE') {
    return res.status(400).json({ error: 'INVALID_FILE_TYPE' });
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
