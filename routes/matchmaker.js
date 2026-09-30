// routes/matchmaker.js — Modo celestino 💘: sugerir parejas y ganar Karma.
// Flujo:
//  1. Un usuario VERIFICADO elige a 2 personas (de sus matches) y las sugiere.
//  2. Cada una recibe la propuesta y acepta o rechaza por su cuenta.
//  3. Solo si AMBAS aceptan se crea el match + mensaje del sistema que
//     acredita al celestino, y este gana Karma (+20).
//  4. Si la pareja conversa (10+ mensajes), el celestino gana un bonus (+30).
//  5. El Karma se canjea por beneficios dentro de la app (nunca dinero real).
// Anti-abuso: 5 sugerencias/día, sin duplicados de pareja, sin sugerir a
// quien te bloqueó, y la pareja no puede tener ya un match entre ellos.

const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { calcularEdad } = require('../utils/validacion');
const { sendPush } = require('../utils/push');
const {
  KARMA_INTRO,
  REWARDS,
  saldoKarma,
  otorgarKarma,
} = require('../utils/karma');

const router = express.Router();

// Sugerencias por día para cada celestino.
const MAX_SUGGESTIONS_PER_DAY = 5;

function esVerificado(userId) {
  const u = db.prepare('SELECT is_verified FROM users WHERE id = ?').get(userId);
  return !!(u && u.is_verified);
}

function nombreDe(userId) {
  const u = db.prepare('SELECT display_name FROM users WHERE id = ?').get(userId);
  return u ? u.display_name : '';
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

// ¿Ya tienen un match entre ellos?
function yaSonMatch(a, b) {
  const x = Math.min(a, b);
  const y = Math.max(a, b);
  return !!db
    .prepare('SELECT id FROM matches WHERE user1_id = ? AND user2_id = ?')
    .get(x, y);
}

function primeraFoto(userId) {
  const f = db
    .prepare('SELECT filename FROM photos WHERE user_id = ? ORDER BY position ASC, id ASC LIMIT 1')
    .get(userId);
  return f ? '/uploads/' + f.filename : null;
}

function fichaPublica(userId) {
  const u = db
    .prepare(
      'SELECT id, display_name, dob, is_verified FROM users WHERE id = ?'
    )
    .get(userId);
  if (!u) return null;
  const perfil = db.prepare('SELECT town FROM profiles WHERE user_id = ?').get(userId);
  return {
    userId: u.id,
    displayName: u.display_name,
    age: calcularEdad(u.dob),
    town: (perfil && perfil.town) || '',
    photo: primeraFoto(u.id),
    isVerified: !!u.is_verified,
  };
}

// Mensaje del sistema en el chat nuevo: acredita al celestino.
// El texto es "mm_intro:<nombre>" y el frontend lo traduce con la clave
// i18n "matchmaker_introMsg" (el nombre viaja como dato, no hardcodeado).
function insertarMensajePresentacion(matchId, nombreCelestino) {
  try {
    db.prepare(
      `INSERT INTO messages (match_id, sender_id, text, type, created_at)
       VALUES (?, NULL, ?, 'system', ?)`
    ).run(matchId, 'mm_intro:' + nombreCelestino, new Date().toISOString());
  } catch (e) {
    /* el match igual funciona sin el mensaje */
  }
}

// GET /api/matchmaker/status — Estado del celestino: karma, cupo diario y
// tabla de recompensas.
router.get('/status', auth, (req, res) => {
  const yo = req.userId;
  const sentToday = db
    .prepare(
      `SELECT COUNT(*) AS c FROM suggestions
       WHERE matchmaker_id = ? AND date(created_at) = date('now')`
    )
    .get(yo).c;
  return res.json({
    karma: saldoKarma(yo),
    sentToday,
    maxPerDay: MAX_SUGGESTIONS_PER_DAY,
    isVerified: esVerificado(yo),
    rewards: REWARDS,
  });
});

// GET /api/matchmaker/candidates — Personas que el celestino puede sugerir:
// los otros miembros de sus matches, verificados y sin bloqueo.
router.get('/candidates', auth, (req, res) => {
  const yo = req.userId;
  const filas = db
    .prepare(
      'SELECT user1_id, user2_id FROM matches WHERE user1_id = ? OR user2_id = ?'
    )
    .all(yo, yo);
  const vistos = new Set();
  const resultado = [];
  for (const m of filas) {
    const otro = m.user1_id === yo ? m.user2_id : m.user1_id;
    if (vistos.has(otro)) continue;
    vistos.add(otro);
    if (hayBloqueo(yo, otro)) continue;
    const ficha = fichaPublica(otro);
    if (!ficha || !ficha.isVerified) continue;
    resultado.push(ficha);
  }
  return res.json({ candidates: resultado });
});

// POST /api/matchmaker/suggest — Sugerir una pareja: {userA, userB}.
router.post('/suggest', auth, (req, res) => {
  const yo = req.userId;
  if (!esVerificado(yo)) {
    return res.status(403).json({ error: 'MM_NOT_VERIFIED' });
  }
  const a = Number(req.body && req.body.userA);
  const b = Number(req.body && req.body.userB);
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    return res.status(400).json({ error: 'MM_USER_NOT_FOUND' });
  }
  if (a === yo || b === yo) {
    return res.status(400).json({ error: 'MM_CANNOT_SELF' });
  }
  if (a === b) {
    return res.status(400).json({ error: 'MM_SAME_USER' });
  }
  const ua = db.prepare('SELECT id, is_verified, display_name FROM users WHERE id = ?').get(a);
  const ub = db.prepare('SELECT id, is_verified, display_name FROM users WHERE id = ?').get(b);
  if (!ua || !ub) {
    return res.status(404).json({ error: 'MM_USER_NOT_FOUND' });
  }
  if (!ua.is_verified || !ub.is_verified) {
    return res.status(400).json({ error: 'MM_USER_NOT_VERIFIED' });
  }
  // Anti-abuso: no sugerir a quien te bloqueó (en cualquier dirección).
  if (hayBloqueo(yo, a) || hayBloqueo(yo, b)) {
    return res.status(403).json({ error: 'MM_BLOCKED' });
  }
  if (yaSonMatch(a, b)) {
    return res.status(400).json({ error: 'MM_ALREADY_MATCHED' });
  }
  // Par normalizado: user1_id siempre es el menor (evita duplicados A+B / B+A).
  const u1 = Math.min(a, b);
  const u2 = Math.max(a, b);
  const dup = db
    .prepare(
      'SELECT id FROM suggestions WHERE matchmaker_id = ? AND user1_id = ? AND user2_id = ?'
    )
    .get(yo, u1, u2);
  if (dup) {
    return res.status(400).json({ error: 'MM_DUPLICATE' });
  }
  const hoy = db
    .prepare(
      `SELECT COUNT(*) AS c FROM suggestions
       WHERE matchmaker_id = ? AND date(created_at) = date('now')`
    )
    .get(yo).c;
  if (hoy >= MAX_SUGGESTIONS_PER_DAY) {
    return res.status(403).json({ error: 'MM_DAILY_LIMIT' });
  }

  const ahora = new Date().toISOString();
  const ins = db
    .prepare(
      `INSERT INTO suggestions (matchmaker_id, user1_id, user2_id, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(yo, u1, u2, ahora);

  // Avisar a cada uno por su cuenta (push + la verán en #/celestino).
  const miNombre = nombreDe(yo);
  sendPush(a, 'suggestion_received', {
    matchmaker: miNombre,
    other: ub.display_name,
    url: '/#/celestino',
  });
  sendPush(b, 'suggestion_received', {
    matchmaker: miNombre,
    other: ua.display_name,
    url: '/#/celestino',
  });

  return res.status(201).json({ ok: true, suggestionId: ins.lastInsertRowid });
});

// GET /api/matchmaker/received — Propuestas pendientes donde soy sugerido.
router.get('/received', auth, (req, res) => {
  const yo = req.userId;
  const filas = db
    .prepare(
      `SELECT s.id, s.matchmaker_id, s.user1_id, s.user2_id, s.created_at,
              m.display_name AS mm_name
       FROM suggestions s
       JOIN users m ON m.id = s.matchmaker_id
       WHERE (s.user1_id = ? OR s.user2_id = ?) AND s.status = 'pending'
       ORDER BY s.created_at DESC`
    )
    .all(yo, yo);
  const resultado = filas.map((s) => {
    const otroId = s.user1_id === yo ? s.user2_id : s.user1_id;
    const ficha = fichaPublica(otroId) || {};
    return {
      id: s.id,
      matchmakerName: s.mm_name,
      otherId: otroId,
      otherName: ficha.displayName || '',
      otherAge: ficha.age || '',
      otherPhoto: ficha.photo,
      createdAt: s.created_at,
    };
  });
  return res.json({ suggestions: resultado });
});

// GET /api/matchmaker/sent — Mis sugerencias enviadas y su estado.
router.get('/sent', auth, (req, res) => {
  const yo = req.userId;
  const filas = db
    .prepare(
      `SELECT s.id, s.status, s.created_at,
              a.display_name AS n1, b.display_name AS n2
       FROM suggestions s
       JOIN users a ON a.id = s.user1_id
       JOIN users b ON b.id = s.user2_id
       WHERE s.matchmaker_id = ?
       ORDER BY s.created_at DESC
       LIMIT 50`
    )
    .all(yo);
  return res.json({
    suggestions: filas.map((s) => ({
      id: s.id,
      nameA: s.n1,
      nameB: s.n2,
      status: s.status,
      createdAt: s.created_at,
    })),
  });
});

// POST /api/matchmaker/respond — Aceptar o rechazar: {suggestionId, accept}.
// Solo si AMBOS aceptan se crea la introducción (match + Karma al celestino).
// Si alguien rechaza, no se avisa a nadie más: queda en silencio.
router.post('/respond', auth, (req, res) => {
  const yo = req.userId;
  const suggestionId = Number(req.body && req.body.suggestionId);
  const accept = !!(req.body && req.body.accept);
  const s = db.prepare('SELECT * FROM suggestions WHERE id = ?').get(suggestionId);
  if (!s) {
    return res.status(404).json({ error: 'MM_NOT_FOUND' });
  }
  if (yo !== s.user1_id && yo !== s.user2_id) {
    return res.status(403).json({ error: 'MM_NOT_YOURS' });
  }
  if (s.status !== 'pending') {
    return res.status(400).json({ error: 'MM_ALREADY_DECIDED' });
  }

  if (!accept) {
    // Rechazo discreto: no se revela nada a nadie más.
    db.prepare("UPDATE suggestions SET status = 'rejected' WHERE id = ?").run(suggestionId);
    return res.json({ ok: true, introduced: false });
  }

  const col = yo === s.user1_id ? 'u1_accepted' : 'u2_accepted';
  db.prepare(`UPDATE suggestions SET ${col} = 1 WHERE id = ?`).run(suggestionId);
  const act = db
    .prepare('SELECT u1_accepted, u2_accepted FROM suggestions WHERE id = ?')
    .get(suggestionId);

  if (!(act.u1_accepted && act.u2_accepted)) {
    return res.json({ ok: true, introduced: false, waiting: true });
  }

  // ¡Ambos aceptaron! Crear (o reutilizar) el match entre ellos.
  const x = s.user1_id;
  const y = s.user2_id;
  let match = db
    .prepare('SELECT id FROM matches WHERE user1_id = ? AND user2_id = ?')
    .get(x, y);
  if (!match) {
    const nuevo = db
      .prepare('INSERT INTO matches (user1_id, user2_id, created_at) VALUES (?, ?, ?)')
      .run(x, y, new Date().toISOString());
    match = { id: nuevo.lastInsertRowid };
    insertarMensajePresentacion(match.id, nombreDe(s.matchmaker_id));
  }
  db.prepare("UPDATE suggestions SET status = 'introduced', match_id = ? WHERE id = ?").run(
    match.id,
    suggestionId
  );

  // Karma al celestino por la pareja lograda.
  const total = otorgarKarma(s.matchmaker_id, KARMA_INTRO, 'intro', suggestionId);
  sendPush(s.matchmaker_id, 'karma_earned', {
    n: KARMA_INTRO,
    total,
    url: '/#/celestino',
  });

  // Avisar a la pareja: tienen un match nuevo.
  sendPush(x, 'match', { url: '/#/chat/' + match.id });
  sendPush(y, 'match', { url: '/#/chat/' + match.id });

  return res.json({ ok: true, introduced: true, matchId: match.id });
});

// POST /api/matchmaker/redeem — Canjear Karma: {reward: 'credits'|'superlikes'|'premium_week'}.
router.post('/redeem', auth, (req, res) => {
  const yo = req.userId;
  const rewardId = req.body && req.body.reward;
  const r = REWARDS.find((x) => x.id === rewardId);
  if (!r) {
    return res.status(400).json({ error: 'MM_BAD_REWARD' });
  }
  const karma = saldoKarma(yo);
  if (karma < r.cost) {
    return res.status(403).json({ error: 'MM_NOT_ENOUGH_KARMA' });
  }

  if (r.id === 'credits') {
    // 10 créditos extra (pueden pasar del tope: es un bono).
    db.prepare('UPDATE users SET credits = credits + 10 WHERE id = ?').run(yo);
    otorgarKarma(yo, -r.cost, 'redeem_credits', null);
  } else if (r.id === 'superlikes') {
    // 5 super likes extra (usan el mismo bono de referidos).
    db.prepare('UPDATE users SET bonus_superlikes = bonus_superlikes + 5 WHERE id = ?').run(yo);
    otorgarKarma(yo, -r.cost, 'redeem_superlikes', null);
  } else if (r.id === 'premium_week') {
    // 1 semana de Premium (se suma al período vigente si lo hay).
    const ahora = new Date();
    const fila = db.prepare('SELECT premium_until FROM users WHERE id = ?').get(yo);
    const base =
      fila && fila.premium_until && fila.premium_until > ahora.toISOString()
        ? new Date(fila.premium_until)
        : ahora;
    const fin = new Date(base.getTime() + 7 * 24 * 3600 * 1000).toISOString();
    db.prepare('UPDATE users SET is_premium = 1, premium_until = ? WHERE id = ?').run(fin, yo);
    otorgarKarma(yo, -r.cost, 'redeem_premium', null);
  }

  return res.json({ ok: true, karma: saldoKarma(yo) });
});

module.exports = router;
