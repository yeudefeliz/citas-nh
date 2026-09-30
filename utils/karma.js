// utils/karma.js — Sistema de Karma del modo celestino 💘.
// El celestino gana Karma cuando una pareja sugerida se conoce (+20) y un
// bonus si la pareja conversa activamente (+30 con 10+ mensajes).
// El Karma se canjea por beneficios dentro de la app (nunca dinero real).

const db = require('../db');
const { sendPush } = require('./push');

const KARMA_INTRO = 20; // ambos aceptaron la sugerencia → se presentaron
const KARMA_CHAT_BONUS = 30; // la pareja intercambió 10+ mensajes
const CHAT_BONUS_MESSAGES = 10;

// Recompensas canjeables: id, costo en Karma.
const REWARDS = [
  { id: 'credits', cost: 50 }, // 10 créditos extra
  { id: 'superlikes', cost: 100 }, // 5 super likes extra
  { id: 'premium_week', cost: 200 }, // 1 semana de Premium
];

// Saldo actual de Karma de un usuario.
function saldoKarma(userId) {
  const f = db.prepare('SELECT karma FROM users WHERE id = ?').get(userId);
  return f ? f.karma || 0 : 0;
}

// Otorga (o quita, si puntos es negativo) Karma y lo registra en el historial.
// Devuelve el saldo nuevo.
function otorgarKarma(userId, puntos, reason, refId) {
  db.prepare('UPDATE users SET karma = karma + ? WHERE id = ?').run(puntos, userId);
  db.prepare(
    `INSERT INTO karma_log (user_id, delta, reason, ref_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId, puntos, reason, refId == null ? null : refId, new Date().toISOString());
  return saldoKarma(userId);
}

// Revisa si un match de celestino merece el bonus por conversación.
// Se llama después de cada mensaje enviado: si la pareja ya intercambió
// 10+ mensajes (texto o voz, sin contar los del sistema) y el bonus no se
// dio, otorga +30 Karma al celestino una sola vez.
function revisarBonusChat(matchId) {
  const s = db
    .prepare(
      `SELECT id, matchmaker_id FROM suggestions
       WHERE match_id = ? AND status = 'introduced' AND chat_bonus_awarded = 0`
    )
    .get(matchId);
  if (!s) return;
  const n = db
    .prepare(
      `SELECT COUNT(*) AS c FROM messages
       WHERE match_id = ? AND sender_id IS NOT NULL AND type IN ('text', 'voice')`
    )
    .get(matchId).c;
  if (n >= CHAT_BONUS_MESSAGES) {
    db.prepare('UPDATE suggestions SET chat_bonus_awarded = 1 WHERE id = ?').run(s.id);
    const total = otorgarKarma(s.matchmaker_id, KARMA_CHAT_BONUS, 'chat_bonus', s.id);
    try {
      sendPush(s.matchmaker_id, 'karma_earned', {
        n: KARMA_CHAT_BONUS,
        total,
        url: '/#/celestino',
      });
    } catch (e) {
      /* el push nunca rompe el flujo */
    }
  }
}

module.exports = {
  KARMA_INTRO,
  KARMA_CHAT_BONUS,
  CHAT_BONUS_MESSAGES,
  REWARDS,
  saldoKarma,
  otorgarKarma,
  revisarBonusChat,
};
