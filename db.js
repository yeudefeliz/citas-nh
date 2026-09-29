// db.js — Conexión a SQLite y creación de las tablas del MVP.
// Este módulo se importa una sola vez (desde server.js) y exporta la
// instancia de la base de datos para que las rutas la reutilicen.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// La base de datos vive en ./data/citasnh.db (ruta relativa a este archivo,
// para que funcione sin importar desde dónde se arranque el servidor).
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'citasnh.db'));

// Activar las llaves foráneas: sin esto, los "ON DELETE CASCADE" no funcionan.
db.pragma('foreign_keys = ON');
// Modo WAL: mejor concurrencia y menos riesgo de corrupción que el modo journal clásico.
db.pragma('journal_mode = WAL');

// Crear todas las tablas si todavía no existen.
// created_at usa datetime('now') en UTC como valor por defecto.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    dob TEXT NOT NULL,
    zip TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio TEXT DEFAULT '',
    gender TEXT DEFAULT '',
    looking_for TEXT DEFAULT '',
    languages TEXT DEFAULT '[]',
    interests TEXT DEFAULT '[]',
    town TEXT DEFAULT '',
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    position INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY,
    voter_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    target_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    vote TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(voter_id, target_id)
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY,
    user1_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    user2_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user1_id, user2_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
    sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS blocks (
    id INTEGER PRIMARY KEY,
    blocker_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(blocker_id, blocked_id)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY,
    reporter_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    reported_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Visitas de perfil: quién vio el perfil de quién (una por día por pareja).
  CREATE TABLE IF NOT EXISTS profile_views (
    id INTEGER PRIMARY KEY,
    viewer_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    viewed_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_views_day
    ON profile_views(viewer_id, viewed_id, date(created_at));

  -- Señalización WebRTC para videollamadas (el chat usa polling).
  CREATE TABLE IF NOT EXISTS call_signals (
    id INTEGER PRIMARY KEY,
    from_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    to_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    payload TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_call_signals_to
    ON call_signals(to_id, id);

  -- Regalos virtuales comprados con Stripe (un pago por regalo).
  CREATE TABLE IF NOT EXISTS gifts (
    id INTEGER PRIMARY KEY,
    sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    match_id INTEGER REFERENCES matches(id) ON DELETE CASCADE,
    gift_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_gifts_match ON gifts(match_id, id);

  -- Eventos en NH creados por la comunidad.
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    place TEXT DEFAULT '',
    town TEXT DEFAULT '',
    event_date TEXT NOT NULL,
    image_url TEXT DEFAULT '',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);

  -- Confirmaciones de asistencia (toggle: existe = "voy").
  CREATE TABLE IF NOT EXISTS event_rsvps (
    id INTEGER PRIMARY KEY,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(event_id, user_id)
  );

  -- Stories de 24 horas: foto o video corto que desaparece solo.
  CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    media_url TEXT NOT NULL,
    media_type TEXT NOT NULL DEFAULT 'photo',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_stories_user_time ON stories(user_id, created_at);

  -- Reacciones a mensajes del chat (un emoji por usuario y mensaje).
  CREATE TABLE IF NOT EXISTS message_reactions (
    id INTEGER PRIMARY KEY,
    message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(message_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_reactions_msg ON message_reactions(message_id);
`);

// --- Migración: columnas premium (Stripe) ---------------------------------
// CREATE TABLE IF NOT EXISTS no agrega columnas a tablas viejas, así que
// revisamos PRAGMA table_info y aplicamos ALTER TABLE solo si falta.
const columnasUsers = db
  .prepare('PRAGMA table_info(users)')
  .all()
  .map((c) => c.name);
const columnasPremium = {
  is_premium: 'INTEGER NOT NULL DEFAULT 0',
  premium_until: 'TEXT',
  stripe_customer_id: 'TEXT',
  stripe_subscription_id: 'TEXT',
  boost_until: 'TEXT',
};
for (const [nombre, tipo] of Object.entries(columnasPremium)) {
  if (!columnasUsers.includes(nombre)) {
    db.prepare(`ALTER TABLE users ADD COLUMN ${nombre} ${tipo}`).run();
  }
}

// --- Migración: super likes (columna is_super en votes) ------------------
const columnasVotes = db
  .prepare('PRAGMA table_info(votes)')
  .all()
  .map((c) => c.name);
if (!columnasVotes.includes('is_super')) {
  db.prepare('ALTER TABLE votes ADD COLUMN is_super INTEGER NOT NULL DEFAULT 0').run();
}

// --- Migración: modo invisible + verificación ---------------------------
const nuevasColumnasUsers = {
  invisible_mode: 'INTEGER NOT NULL DEFAULT 0',
  verification_status: "TEXT NOT NULL DEFAULT 'none'",
  is_verified: 'INTEGER NOT NULL DEFAULT 0',
};
for (const [nombre, tipo] of Object.entries(nuevasColumnasUsers)) {
  if (!columnasUsers.includes(nombre)) {
    db.prepare(`ALTER TABLE users ADD COLUMN ${nombre} ${tipo}`).run();
  }
}

// --- Migración: mensajes de voz y regalos (columnas type y audio_url) ----
const columnasMessages = db
  .prepare('PRAGMA table_info(messages)')
  .all()
  .map((c) => c.name);
if (!columnasMessages.includes('type')) {
  db.prepare("ALTER TABLE messages ADD COLUMN type TEXT NOT NULL DEFAULT 'text'").run();
}
if (!columnasMessages.includes('audio_url')) {
  db.prepare('ALTER TABLE messages ADD COLUMN audio_url TEXT').run();
}

// --- Seed: 2 eventos de ejemplo si la tabla está vacía -------------------
const conteoEventos = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
if (conteoEventos === 0) {
  const en2Semanas = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  en2Semanas.setHours(20, 0, 0, 0);
  const en3Semanas = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
  en3Semanas.setHours(19, 0, 0, 0);
  const insertar = db.prepare(
    `INSERT INTO events (title, description, place, town, event_date, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`
  );
  const ahora = new Date().toISOString();
  insertar.run(
    'Noche de solteros en Manchester',
    'Ven a conocer gente nueva de NH en persona: música, tragos y buena vibra. ¡Los matches se hacen en vivo! 💃🕺',
    'Downtown Manchester',
    'Manchester',
    en2Semanas.toISOString(),
    ahora
  );
  insertar.run(
    'Bachata bajo las estrellas en Nashua',
    'Clase de bachata al aire libre y después social bailable. Trae tus mejores pasos 🇩🇴🌙',
    'Riverside Park',
    'Nashua',
    en3Semanas.toISOString(),
    ahora
  );
}

// --- Migración: referidos (código único, quién invitó, bonus de super likes) --
const nuevasColumnasRef = {
  referral_code: 'TEXT',
  referred_by: 'INTEGER',
  bonus_superlikes: 'INTEGER NOT NULL DEFAULT 0',
};
for (const [nombre, tipo] of Object.entries(nuevasColumnasRef)) {
  if (!columnasUsers.includes(nombre)) {
    db.prepare(`ALTER TABLE users ADD COLUMN ${nombre} ${tipo}`).run();
  }
}

// Genera un código de referido de 8 caracteres (sin colisiones).
function generarCodigoRef() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I confusos
  let codigo;
  do {
    codigo = '';
    for (let i = 0; i < 8; i++) {
      codigo += alfabeto[Math.floor(Math.random() * alfabeto.length)];
    }
  } while (db.prepare('SELECT 1 FROM users WHERE referral_code = ?').get(codigo));
  return codigo;
}

// Usuarios viejos sin código: se les asigna uno.
const sinCodigo = db.prepare('SELECT id FROM users WHERE referral_code IS NULL').all();
const asignarCodigo = db.prepare('UPDATE users SET referral_code = ? WHERE id = ?');
for (const u of sinCodigo) {
  asignarCodigo.run(generarCodigoRef(), u.id);
}

module.exports = db;
module.exports.generarCodigoRef = generarCodigoRef;
