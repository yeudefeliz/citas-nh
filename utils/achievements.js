// utils/achievements.js — Gamificación: logros y niveles.
// Los logros se otorgan con grantAchievement(userId, code): es idempotente
// (INSERT OR IGNORE) y devuelve true solo si el logro es NUEVO, para que el
// frontend pueda celebrar con un toast solo la primera vez.

const db = require('../db');

// Los 7 logros, en orden para mostrarlos en la UI.
const ACHIEVEMENT_CODES = [
  'first_like', // dio su primer like
  'first_match', // consiguió su primer match
  'chatterbox', // envió 50 mensajes
  'popular', // recibió 10 likes
  'verified', // verificó su perfil
  'social', // confirmó asistencia a 3 eventos
  'sharer', // invitó a 3 amigos con su código
];

// Otorga un logro. Devuelve true si es nuevo, false si ya lo tenía.
function grantAchievement(userId, code) {
  if (!ACHIEVEMENT_CODES.includes(code)) return false;
  const r = db
    .prepare(
      'INSERT OR IGNORE INTO achievements (user_id, code, earned_at) VALUES (?, ?, ?)'
    )
    .run(userId, code, new Date().toISOString());
  return r.changes > 0;
}

// Nivel según cantidad de logros: 1=Nuevo(0), 2=Conocido(2), 3=Popular(4),
// 4=Estrella(6), 5=Leyenda(7).
function levelFor(count) {
  if (count >= 7) return 5;
  if (count >= 6) return 4;
  if (count >= 4) return 3;
  if (count >= 2) return 2;
  return 1;
}

// Estado completo de logros de un usuario para la UI.
// levelName es la CLAVE de i18n ("ach_level_1"…): el frontend la traduce.
function getAchievements(userId) {
  const filas = db
    .prepare('SELECT code, earned_at FROM achievements WHERE user_id = ?')
    .all(userId);
  const ganados = new Map(filas.map((f) => [f.code, f.earned_at]));
  const nivel = levelFor(filas.length);
  return {
    level: nivel,
    levelName: 'ach_level_' + nivel, // clave i18n
    total: ACHIEVEMENT_CODES.length,
    earnedCount: filas.length,
    achievements: ACHIEVEMENT_CODES.map((code) => ({
      code,
      earned: ganados.has(code),
      earnedAt: ganados.get(code) || null,
    })),
  };
}

module.exports = { ACHIEVEMENT_CODES, grantAchievement, getAchievements, levelFor };
