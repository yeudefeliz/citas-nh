// utils/push.js — Notificaciones Web Push (gratis, vía librería web-push).
// Requiere las variables de entorno VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY
// (ver README). Si no están definidas, sendPush no hace nada (no rompe nada).

const db = require('../db');

let webpush = null;
let configurado = false;

function asegurarConfig() {
  if (configurado) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false; // sin claves: push desactivado en silencio
  try {
    webpush = require('web-push');
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@citas-nh.onrender.com',
      pub,
      priv
    );
    configurado = true;
    return true;
  } catch (e) {
    return false;
  }
}

// Textos de la notificación según el idioma guardado en la suscripción.
function texto(kind, lang, vars) {
  const es = lang !== 'en';
  const nombre = vars.name || '';
  switch (kind) {
    case 'like':
      return es
        ? { title: '❤️ ¡Le gustas a alguien!', body: 'Alguien te dio like en Citas NH. Entra a ver quién es 👀' }
        : { title: '❤️ Someone likes you!', body: 'Someone liked you on Citas NH. Come see who 👀' };
    case 'superlike':
      return es
        ? { title: '💖 ¡Super Like!', body: '¡Alguien te dio un Super Like! Le gustas mucho 😍' }
        : { title: '💖 Super Like!', body: 'Someone sent you a Super Like! They really like you 😍' };
    case 'match':
      return es
        ? { title: '💘 ¡Es un match!', body: 'Tienen un nuevo match en Citas NH. ¡Saluda! 🎉' }
        : { title: "💘 It's a match!", body: 'You have a new match on Citas NH. Say hi! 🎉' };
    case 'message':
      return es
        ? { title: '💬 ' + nombre, body: 'Te envió un mensaje en Citas NH' }
        : { title: '💬 ' + nombre, body: 'Sent you a message on Citas NH' };
    case 'dateplan_accepted':
      return es
        ? { title: '📅 ¡Cita aceptada!', body: (nombre ? nombre + ' aceptó tu cita' : 'Aceptaron tu cita') + ' ✅' }
        : { title: '📅 Date accepted!', body: (nombre ? nombre + ' accepted your date' : 'Your date was accepted') + ' ✅' };
    case 'gift':
      return es
        ? { title: '🎁 ¡Te enviaron un regalo!', body: (nombre ? nombre + ' te envió un regalo' : 'Te enviaron un regalo') + ' en Citas NH 💝' }
        : { title: '🎁 You got a gift!', body: (nombre ? nombre + ' sent you a gift' : 'Someone sent you a gift') + ' on Citas NH 💝' };
    default:
      return es
        ? { title: 'Citas NH', body: 'Tienes una novedad en Citas NH' }
        : { title: 'Citas NH', body: 'You have an update on Citas NH' };
  }
}

// sendPush(userId, kind, vars) — Envía a todos los dispositivos suscritos.
// kind: 'like' | 'superlike' | 'match' | 'message' | 'dateplan_accepted' | 'gift'.
// vars: {name, url}. Nunca lanza: los errores se tragan para no romper el flujo.
// Las suscripciones muertas (410/404) se borran solas.
function sendPush(userId, kind, vars) {
  if (!userId) return;
  if (!asegurarConfig()) return;
  let subs;
  try {
    subs = db
      .prepare('SELECT endpoint, p256dh, auth, lang FROM push_subscriptions WHERE user_id = ?')
      .all(userId);
  } catch (e) {
    return;
  }
  if (!subs.length) return;
  const v = vars || {};
  for (const s of subs) {
    const { title, body } = texto(kind, s.lang, v);
    const payload = JSON.stringify({ title, body, url: v.url || '/' });
    webpush
      .sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      )
      .catch((err) => {
        // Suscripción expirada o inválida → se borra para no reintentar.
        if (err && (err.statusCode === 410 || err.statusCode === 404)) {
          try {
            db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(s.endpoint);
          } catch (e) {
            /* nada */
          }
        }
      });
  }
}

module.exports = { sendPush };
