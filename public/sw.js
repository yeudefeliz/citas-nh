/* ============================================================
   Citas NH — Service Worker (PWA)
   ------------------------------------------------------------
   Estrategia simple:
   - Al instalarse, guarda el "app shell" en caché (versión citasnh-v1).
   - Las llamadas a /api/* SIEMPRE van a la red (datos en vivo).
   - Lo demás: primero caché, si no está va a la red y lo guarda.
   - Al activarse una versión nueva, borra cachés viejos.
   ============================================================ */
const CACHE = "citasnh-v1";

// Archivos que forman la app (se guardan para usar sin conexión).
const SHELL = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/app.js",
  "/js/i18n/es.js",
  "/js/i18n/en.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  // Nota: /terminos y /privacidad los sirve el backend (rutas sin extensión);
  // el service worker los guarda en caché automáticamente en la primera visita
  // gracias al manejador "fetch" de abajo, así que no van en esta lista inicial.
];

// Instalación: guarda todo el SHELL en caché.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()) // activa el nuevo SW de inmediato
  );
});

// Activación: borra cachés de versiones viejas.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Cada petición que hace la app pasa por aquí.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // La API siempre va a la red: los matches y mensajes deben estar al día.
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.match(event.request).then((hit) => {
      if (hit) return hit; // estaba en caché → servirlo
      // No estaba → ir a la red, guardar copia y servirla.
      return fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match("/index.html")); // sin red → la app igual abre
    })
  );
});
