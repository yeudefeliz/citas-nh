// utils/presence.js — Estado "en línea" / última conexión.
// Un usuario se considera en línea si su last_seen tiene menos de 3 min.
// El modo invisible oculta el estado por completo (aparece desconectado).

const ONLINE_MS = 3 * 60 * 1000; // 3 minutos

// presencia(lastSeen, invisibleMode) → {online, lastSeen}
// lastSeen: ISO string o null. Si es invisible, lastSeen sale null.
function presencia(lastSeen, invisibleMode) {
  if (invisibleMode) {
    return { online: false, lastSeen: null };
  }
  const online =
    !!lastSeen && Date.now() - new Date(lastSeen).getTime() < ONLINE_MS;
  return { online, lastSeen: lastSeen || null };
}

module.exports = { presencia, ONLINE_MS };
