// routes/events.js — Eventos en NH creados por la comunidad.
//   GET  /api/events           → próximos eventos (con conteo de asistentes)
//   POST /api/events           → crear un evento
//   POST /api/events/:id/rsvp → confirmar/quitar asistencia (toggle)

const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { limpiarTexto } = require('../utils/validacion');

const router = express.Router();

const MAX_TITULO = 80;
const MAX_DESC = 500;
const MAX_LUGAR = 120;

// Arma el objeto de evento con conteo de asistentes y si YO voy.
function armarEvento(fila, yo) {
  const conteo = db
    .prepare('SELECT COUNT(*) AS n FROM event_rsvps WHERE event_id = ?')
    .get(fila.id).n;
  const voy = yo
    ? !!db
        .prepare('SELECT 1 FROM event_rsvps WHERE event_id = ? AND user_id = ?')
        .get(fila.id, yo)
    : false;
  return {
    id: fila.id,
    title: fila.title,
    description: fila.description || '',
    place: fila.place || '',
    town: fila.town || '',
    eventDate: fila.event_date,
    imageUrl: fila.image_url || '',
    attendeeCount: conteo,
    rsvp: voy,
    createdAt: fila.created_at,
  };
}

// GET /api/events — próximos eventos (hoy en adelante), por fecha.
router.get('/', auth, (req, res) => {
  const hoy = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const filas = db
    .prepare(
      `SELECT * FROM events WHERE date(event_date) >= date(?)
       ORDER BY event_date ASC LIMIT 50`
    )
    .all(hoy);
  return res.json({ events: filas.map((f) => armarEvento(f, req.userId)) });
});

// POST /api/events — crear un evento (la fecha debe ser hoy o futura).
router.post('/', auth, (req, res) => {
  const titulo = limpiarTexto(req.body.title || '');
  if (!titulo || titulo.length > MAX_TITULO) {
    return res.status(400).json({ error: 'INVALID_TITLE' });
  }

  const descripcion = limpiarTexto(req.body.description || '');
  if (descripcion.length > MAX_DESC) {
    return res.status(400).json({ error: 'INVALID_DESCRIPTION' });
  }

  const lugar = limpiarTexto(req.body.place || '');
  if (lugar.length > MAX_LUGAR) {
    return res.status(400).json({ error: 'INVALID_PLACE' });
  }

  const pueblo = limpiarTexto(req.body.town || '');
  if (pueblo.length > 60) {
    return res.status(400).json({ error: 'INVALID_TOWN' });
  }

  // Fecha válida y no en el pasado (comparamos solo el día).
  const fecha = new Date(req.body.eventDate);
  if (isNaN(fecha.getTime())) {
    return res.status(400).json({ error: 'INVALID_DATE' });
  }
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (fecha < hoy) {
    return res.status(400).json({ error: 'DATE_IN_PAST' });
  }

  const imagen = typeof req.body.imageUrl === 'string'
    ? req.body.imageUrl.trim().slice(0, 500)
    : '';

  const ahora = new Date().toISOString();
  const nuevo = db
    .prepare(
      `INSERT INTO events (title, description, place, town, event_date, image_url, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(titulo, descripcion, lugar, pueblo, fecha.toISOString(), imagen, req.userId, ahora);

  const fila = db.prepare('SELECT * FROM events WHERE id = ?').get(nuevo.lastInsertRowid);
  return res.status(201).json({ event: armarEvento(fila, req.userId) });
});

// POST /api/events/:id/rsvp — "Voy ✅" (toggle: si ya iba, se quita).
router.post('/:id/rsvp', auth, (req, res) => {
  const eventoId = Number(req.params.id);
  const fila = db.prepare('SELECT * FROM events WHERE id = ?').get(eventoId);
  if (!fila) {
    return res.status(404).json({ error: 'EVENT_NOT_FOUND' });
  }

  const existe = db
    .prepare('SELECT id FROM event_rsvps WHERE event_id = ? AND user_id = ?')
    .get(eventoId, req.userId);

  let voy;
  if (existe) {
    db.prepare('DELETE FROM event_rsvps WHERE id = ?').run(existe.id);
    voy = false;
  } else {
    db.prepare(
      'INSERT INTO event_rsvps (event_id, user_id, created_at) VALUES (?, ?, ?)'
    ).run(eventoId, req.userId, new Date().toISOString());
    voy = true;
  }

  const conteo = db
    .prepare('SELECT COUNT(*) AS n FROM event_rsvps WHERE event_id = ?')
    .get(eventoId).n;

  return res.json({ rsvp: voy, attendeeCount: conteo });
});

module.exports = router;
