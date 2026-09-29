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

module.exports = db;
