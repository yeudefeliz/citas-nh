/* ============================================================
   Citas NH — Lógica de la SPA (JavaScript vanilla, sin frameworks)
   ------------------------------------------------------------
   Cómo está organizado:
     1. Idioma (i18n): función t() y setLang()
     2. API: función api() que manda el JWT en cada llamada
     3. Router: lee el hash (#/login, #/descubrir…) y dibuja la vista
     4. Vistas: login, registro, descubrir, matches, chat, perfil, ajustes
     5. Arranque

   Contrato del backend (NO inventar otros endpoints):
     GET  /api/health
     POST /api/auth/register  POST /api/auth/login
     GET  /api/auth/me         DELETE /api/auth/account
     GET  /api/profile         PUT /api/profile
     GET  /api/profile/:userId
     POST /api/profile/photos  DELETE /api/profile/photos/:id
     GET  /api/discover?minAge=&maxAge=&maxDistance=   POST /api/votes {targetUserId, vote, super?}
     POST /api/like {targetUserId, super?}
     GET  /api/matches         GET /api/admirers  GET /api/visitors
     GET  /api/billing/status  POST /api/billing/checkout  POST /api/billing/boost
     POST /api/calls/signal    GET /api/calls/signals
     GET  /api/chat/:matchId/messages        POST /api/chat/:matchId/messages
     POST /api/blocks  GET /api/blocks  DELETE /api/blocks/:targetUserId
     POST /api/reports
   ============================================================ */
"use strict";

/* ---------- 1. Constantes ---------- */
const LS_TOKEN = "citasnh-token"; // clave del JWT en localStorage
const LS_LANG = "citasnh-lang";   // idioma guardado: "es" o "en"
const MAX_PHOTOS = 3;             // máximo de fotos de perfil
const CHAT_POLL_MS = 5000;        // el chat pregunta por mensajes nuevos cada 5 s
const REACT_EMOJIS = ["❤️", "😂", "🔥", "😮", "😢", "👍"]; // reacciones permitidas

/* ---------- 2. Idioma (i18n) ---------- */
// Lee el idioma guardado; español por defecto.
let lang = localStorage.getItem(LS_LANG) || "es";
if (lang !== "es" && lang !== "en") lang = "es";

// Los diccionarios vienen de js/i18n/es.js (window.I18N)
// y js/i18n/en.js (window.I18N_EN).
const STR = { es: window.I18N, en: window.I18N_EN };

// t(clave): devuelve el texto en el idioma actual.
// Acepta {nombre} para interpolar valores: t("match_subtitle", {name:"Ana"})
function t(key, vars) {
  let s = (STR[lang] && STR[lang][key]) || STR.es[key] || key;
  if (vars) {
    for (const k in vars) s = s.split("{" + k + "}").join(vars[k]);
  }
  return s;
}

// Cambia el idioma, lo guarda y redibuja todo.
function setLang(next) {
  lang = next === "en" ? "en" : "es";
  localStorage.setItem(LS_LANG, lang);
  document.documentElement.lang = lang;
  applyI18n(); // retraduce el HTML estático (atributos data-i18n)
  route();     // redibuja la vista actual en el nuevo idioma
}

// Traduce los elementos del index.html que usan data-i18n / data-i18n-ph.
function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    el.placeholder = t(el.getAttribute("data-i18n-ph"));
  });
}

/* ---------- 3. API ---------- */
function getToken() {
  return localStorage.getItem(LS_TOKEN);
}

// api(): hace fetch a la MISMA origin (sin base URL hardcodeada).
// Manda "Authorization: Bearer <JWT>" en cada llamada a /api/*.
// Si el backend responde error, lanza {code} con el código del backend
// (ej. {code:"EMAIL_TAKEN"}) para mostrarlo traducido.
async function api(path, options) {
  options = options || {};
  const headers = Object.assign({}, options.headers || {});
  const token = getToken();
  if (token) headers["Authorization"] = "Bearer " + token;

  let res;
  try {
    res = await fetch(path, Object.assign({}, options, { headers }));
  } catch (e) {
    throw { code: "NETWORK" }; // sin internet o el servidor no responde
  }

  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    /* respuesta vacía o no-JSON */
  }

  if (!res.ok) throw { code: data.error || "GENERIC", status: res.status };
  return data;
}

// Convierte el código de error del backend a texto traducido.
function apiErrorMessage(err) {
  const code = err && err.code ? err.code : "GENERIC";
  return t("err_" + code);
}

// esc(): escapa texto de usuarios para que no rompa el HTML (seguridad).
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// vBadge(): badge ✅ de perfil verificado, o aviso visible si no está verificado.
function vBadge(isV) {
  return isV
    ? '<span class="verif-badge" title="✅">✅</span>'
    : `<span class="unverif-badge">⚠️ ${esc(t("unverified_badge"))}</span>`;
}

// achEmoji(): emoji de cada logro para las medallas del perfil.
function achEmoji(code) {
  return {
    first_like: "❤️",
    first_match: "💞",
    chatterbox: "💬",
    popular: "⭐",
    verified: "✅",
    social: "🎉",
    sharer: "🎁",
  }[code] || "🏅";
}

/* ----- Presencia: "En línea" y última conexión ----- */
// timeAgo(iso): texto relativo — "hace 5 min", "hace 2 h", "ayer".
function timeAgo(iso) {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return t("presence_now");
  if (mins < 60) return t("presence_min").replace("{n}", mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("presence_hour").replace("{n}", hours);
  const days = Math.floor(hours / 24);
  if (days === 1) return t("presence_yesterday");
  return t("presence_days").replace("{n}", days);
}

// presenceHtml(user): puntito 🟢 + texto de presencia. El backend ya oculta
// el estado si el otro está en modo invisible (online=false, lastSeen=null).
function presenceHtml(user) {
  if (!user) return "";
  if (user.online) {
    return `<span class="presence"><span class="presence-dot online" aria-hidden="true"></span>${t("presence_online")}</span>`;
  }
  if (user.lastSeen) {
    return `<span class="presence"><span class="presence-dot offline" aria-hidden="true"></span>${esc(timeAgo(user.lastSeen))}</span>`;
  }
  return "";
}

/* ----- Logros: toast de celebración ----- */
// Celebra los logros nuevos que el backend devolvió en newAchievements[].
function celebrateAchievements(codes) {
  for (const code of codes || []) {
    const name = t("ach_" + code);
    if (name) toast("🏆 " + t("achievement_unlocked").replace("{name}", name));
  }
}

// Algunos logros los gana OTRA persona por ti (ej. "popular" cuando te dan
// like, "sharer" cuando un amigo se registra): el backend los otorga pero el
// toast no te llegaría. Al navegar, comparamos con lo último visto y
// celebramos lo nuevo. La primera vez solo marca, sin tormenta de toasts.
let achSeenAt = null;
try { achSeenAt = localStorage.getItem("citasnh-ach-seen"); } catch (e) { /* nada */ }
async function checkNewAchievements() {
  try {
    const data = await api("/api/achievements");
    const ahora = new Date().toISOString();
    const primeraVez = !achSeenAt;
    const nuevos = primeraVez
      ? []
      : (data.achievements || []).filter(
          (a) => a.earned && a.earnedAt && a.earnedAt > achSeenAt
        );
    try { localStorage.setItem("citasnh-ach-seen", ahora); } catch (e) { /* nada */ }
    achSeenAt = ahora;
    if (nuevos.length) celebrateAchievements(nuevos.map((a) => a.code));
  } catch (e) {
    /* silencioso: no molesta la navegación */
  }
}

// Catálogo de regalos (GET /api/gifts/catalog), cacheado en memoria.
let giftCatalog = null;
async function loadGiftCatalog() {
  if (giftCatalog) return giftCatalog;
  try {
    const data = await api("/api/gifts/catalog");
    giftCatalog = (data && data.gifts) || [];
  } catch (e) {
    giftCatalog = [];
  }
  return giftCatalog;
}
function giftEmoji(id) {
  const g = (giftCatalog || []).find((x) => x.id === id);
  return g ? g.emoji : "🎁";
}
function giftName(id) {
  return t("gift_" + id) || id;
}
function giftPrice(id) {
  const g = (giftCatalog || []).find((x) => x.id === id);
  return g ? "$" + (g.priceCents / 100).toFixed(2) : "";
}

// toast(): aviso flotante pequeño (mejor que alert() en móvil).
function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2600);
}

// ---------- Efectos visuales (confeti, corazones) — sin dependencias ----------
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Capa fija para partículas (se crea sola la primera vez).
function fxLayer() {
  let el = document.getElementById("fx-layer");
  if (!el) {
    el = document.createElement("div");
    el.id = "fx-layer";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
  }
  return el;
}

// Burst de corazones flotantes (al dar like). x,y en píxeles; si no se dan,
// salen desde el centro-inferior de la pantalla.
function heartBurst(x, y, n) {
  const layer = fxLayer();
  const count = n || 9;
  const cx = x == null ? window.innerWidth / 2 : x;
  const cy = y == null ? window.innerHeight - 190 : y;
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = "heart-particle";
    s.textContent = ["❤️", "💖", "💕", "❤️"][i % 4];
    const dx = (Math.random() * 160 - 80).toFixed(0) + "px";
    s.style.left = (cx + Math.random() * 40 - 20) + "px";
    s.style.top = cy + "px";
    s.style.setProperty("--dx", dx);
    s.style.animationDelay = (Math.random() * 0.15).toFixed(2) + "s";
    layer.appendChild(s);
    setTimeout(() => s.remove(), 1400);
  }
}

// Confeti en canvas inline (al hacer match). Sin CDN, sin dependencias.
function confettiBurst() {
  const layer = fxLayer();
  const canvas = document.createElement("canvas");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  layer.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const colors = ["#ff2e63", "#ff6b6b", "#ffd166", "#f59e0b", "#ffffff", "#ff9ec7"];
  const parts = [];
  for (let i = 0; i < 130; i++) {
    parts.push({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.3,
      w: 6 + Math.random() * 7,
      h: 8 + Math.random() * 8,
      c: colors[(Math.random() * colors.length) | 0],
      vy: 2.4 + Math.random() * 3.4,
      vx: -1.6 + Math.random() * 3.2,
      rot: Math.random() * Math.PI,
      vr: -0.12 + Math.random() * 0.24,
    });
  }
  const t0 = Date.now();
  (function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (Date.now() - t0 < 2600) requestAnimationFrame(tick);
    else canvas.remove();
  })();
}

function errorHtml(err) {
  return `<section><div class="empty">😕<br>${esc(apiErrorMessage(err))}</div></section>`;
}

function showFormError(id, err) {
  const box = document.getElementById(id);
  if (box) {
    box.textContent = apiErrorMessage(err);
    box.hidden = false;
  }
}

// Estado del premium (se cachea para no pedirlo en cada vista).
async function billingStatus(force) {
  if (!force && cache.billing) return cache.billing;
  try {
    // GET /api/billing/status → {isPremium, premiumUntil, stripeConfigured}
    cache.billing = await api("/api/billing/status");
  } catch (err) {
    cache.billing = { isPremium: false, stripeConfigured: false };
  }
  return cache.billing;
}

// Modal que invita al premium (límite de likes, ver admiradores, etc.).
function showPremiumModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-heart" aria-hidden="true">👑</div>
      <h2>${t("premium_modalTitle")}</h2>
      <p>${t("premium_modalText")}</p>
      <button class="btn btn-primary" id="pm-go">${t("premium_cta")}</button>
      <button class="btn btn-ghost" id="pm-no">${t("premium_notNow")}</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#pm-go").addEventListener("click", () => {
    overlay.remove();
    location.hash = "#/premium";
  });
  overlay.querySelector("#pm-no").addEventListener("click", () => overlay.remove());
}

/* ----- Bono de bienvenida 🎁 ----- */
// Modal que se muestra una sola vez tras registrarse: 3 Super Likes gratis.
function showWelcomeBonusModal(cantidad) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-heart" aria-hidden="true">🎁</div>
      <h2>${t("welcome_title")}</h2>
      <p>${t("welcome_text").replace("{n}", cantidad)}</p>
      <button class="btn btn-primary" id="wb-ok">${t("welcome_cta")}</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#wb-ok").addEventListener("click", () => overlay.remove());
}

/* ---------- 4. Router ---------- */
const app = document.getElementById("app");
const bottomnav = document.getElementById("bottomnav");
let chatTimer = null; // temporizador del polling del chat
let presenceTimer = null; // temporizador de la presencia en el chat
const cache = { matches: [] }; // guarda matches para el chat (reportar/bloquear)

function stopChatPolling() {
  if (chatTimer) {
    clearInterval(chatTimer);
    chatTimer = null;
  }
  if (presenceTimer) {
    clearInterval(presenceTimer);
    presenceTimer = null;
  }
  stopCallPolling(); // deja de buscar llamadas entrantes
  if (callState) endCall(true); // cuelga si hay una llamada activa
}

// route(): lee location.hash y dibuja la vista que toca.
function route() {
  stopChatPolling(); // al cambiar de vista se apaga el polling del chat

  const hash = location.hash || "#/descubrir";
  const logged = !!getToken();
  bottomnav.hidden = !logged; // la barra inferior solo con sesión

  // REGLA: sin token, siempre al login.
  // (La ruta puede traer query, ej. #/registro?ref=CODIGO: se compara sin el query.)
  const rutaBase = hash.split("?")[0];
  if (!logged && rutaBase !== "#/login" && rutaBase !== "#/registro") {
    location.hash = "#/login";
    return;
  }

  // Con sesión: avisa de logros ganados por acciones de otros (popular, sharer…).
  if (logged) checkNewAchievements();
  // Con token no tiene sentido ver login/registro.
  if (logged && (rutaBase === "#/login" || rutaBase === "#/registro")) {
    location.hash = "#/descubrir";
    return;
  }

  // Resalta el botón activo de la barra inferior.
  const section = hash.split("/")[1] || "";
  bottomnav.querySelectorAll("a").forEach((a) => {
    a.classList.toggle("active", a.dataset.route === section);
  });

  if (hash.startsWith("#/chat/")) {
    renderChat(decodeURIComponent(hash.slice("#/chat/".length)));
    return;
  }
  // La ruta puede traer query (?estado=exito): separamos para el switch.
  const ruta = hash.split("?")[0];
  switch (ruta) {
    case "#/login": return renderLogin();
    case "#/registro": return renderRegister();
    case "#/descubrir": return renderDiscover();
    case "#/matches": return renderMatches();
    case "#/perfil": return renderProfile();
    case "#/ajustes": return renderSettings();
    case "#/premium": return renderPremium();
    case "#/eventos": return renderEvents();
    case "#/mapa": return renderMap();
    default: location.hash = "#/descubrir";
  }
}
window.addEventListener("hashchange", route);

/* ---------- 5. Vistas ---------- */

/* ----- #/login ----- */
function renderLogin() {
  app.innerHTML = `
    <section class="auth">
      <div class="auth-card">
        <div class="auth-heart" aria-hidden="true">❤</div>
        <h2>${t("login_title")}</h2>
        <p class="form-error" id="login-error" hidden></p>
        <form id="login-form">
          <label>${t("login_email")}
            <input type="email" name="email" required autocomplete="email">
          </label>
          <label>${t("login_password")}
            <input type="password" name="password" required autocomplete="current-password">
          </label>
          <button type="submit" class="btn btn-primary">${t("login_submit")}</button>
        </form>
        <p class="auth-switch">${t("login_noAccount")} <a href="#/registro">${t("login_goRegister")}</a></p>
      </div>
    </section>`;

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    try {
      // POST /api/auth/login {email,password} → {token,user}
      const data = await api("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(fd.get("email")).trim(),
          password: fd.get("password"),
        }),
      });
      localStorage.setItem(LS_TOKEN, data.token); // guarda el JWT
      location.hash = "#/descubrir";
    } catch (err) {
      // El código del backend (INVALID_CREDENTIALS…) se muestra traducido.
      showFormError("login-error", err);
    } finally {
      btn.disabled = false;
    }
  });
}

/* ----- #/registro ----- */
function renderRegister() {
  // ¿Vino con código de referido? (#/registro?ref=CODIGO)
  const refMatch = (location.hash.split("?")[1] || "").match(/(?:^|&)ref=([^&]+)/);
  const refCode = refMatch ? decodeURIComponent(refMatch[1]).trim().toUpperCase() : "";

  app.innerHTML = `
    <section class="auth">
      <div class="auth-card">
        <div class="auth-heart" aria-hidden="true">❤</div>
        <h2>${t("register_title")}</h2>
        <p class="muted center">${t("register_adultsOnly")}</p>
        ${refCode ? `<p class="ref-note center">${t("register_invited")}: <code>${esc(refCode)}</code></p>` : ""}
        <p class="form-error" id="register-error" hidden></p>
        <form id="register-form">
          <label>${t("register_email")}
            <input type="email" name="email" required autocomplete="email">
          </label>
          <label>${t("register_password")}
            <input type="password" name="password" required autocomplete="new-password" minlength="8">
          </label>
          <label>${t("register_name")}
            <input type="text" name="displayName" required maxlength="40" autocomplete="nickname">
          </label>
          <label>${t("register_dob")}
            <input type="date" name="dob" required>
          </label>
          <label>${t("register_zip")}
            <input type="text" name="zip" required inputmode="numeric" maxlength="10" autocomplete="postal-code">
          </label>
          <button type="submit" class="btn btn-primary">${t("register_submit")}</button>
        </form>
        <p class="auth-switch">${t("register_haveAccount")} <a href="#/login">${t("register_goLogin")}</a></p>
      </div>
    </section>`;

  document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    try {
      // POST /api/auth/register {email,password,displayName,dob,zip,referralCode?} → 201 {token,user}
      const data = await api("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(fd.get("email")).trim(),
          password: fd.get("password"),
          displayName: String(fd.get("displayName")).trim(),
          dob: fd.get("dob"),
          zip: String(fd.get("zip")).trim(),
          referralCode: refCode || undefined,
        }),
      });
      localStorage.setItem(LS_TOKEN, data.token); // guarda el JWT
      const bono = data.welcomeBonus || 0;
      location.hash = "#/descubrir";
      // Bono de bienvenida: modal con los Super Likes de regalo (una sola vez).
      if (bono > 0) {
        setTimeout(() => showWelcomeBonusModal(bono), 500);
      }
    } catch (err) {
      // Cada código (INVALID_EMAIL, WEAK_PASSWORD, UNDERAGE…) tiene su traducción.
      showFormError("register-error", err);
    } finally {
      btn.disabled = false;
    }
  });
}

/* ----- #/descubrir ----- */
// Filtros de Descubrir guardados en el teléfono (persisten entre visitas).
function getDiscoverFilters() {
  try {
    return JSON.parse(localStorage.getItem("citasnh-filters") || "{}");
  } catch (e) {
    return {};
  }
}
function setDiscoverFilters(f) {
  try {
    localStorage.setItem("citasnh-filters", JSON.stringify(f));
  } catch (e) {}
}

async function renderDiscover() {
  app.innerHTML = `<section class="discover"><h2>${t("discover_title")}</h2><div class="skel skel-card" aria-hidden="true"></div><div class="skel-row" aria-hidden="true"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div></section>`;

  // REGLA: sin verificación por selfie no hay descubrimiento.
  try {
    const vs = await api("/api/verification/status");
    if (!vs.isVerified) {
      await renderVerifyGate();
      return;
    }
  } catch (err) {
    app.innerHTML = errorHtml(err);
    return;
  }

  const filtros = getDiscoverFilters();
  const qs = new URLSearchParams();
  if (filtros.minAge) qs.set("minAge", filtros.minAge);
  if (filtros.maxAge) qs.set("maxAge", filtros.maxAge);
  if (filtros.maxDistance) qs.set("maxDistance", filtros.maxDistance);
  const qstr = qs.toString() ? "?" + qs.toString() : "";

  let card = null;
  try {
    // GET /api/discover (+ filtros) → {card:{...} | null}
    const data = await api("/api/discover" + qstr);
    card = data.card;
  } catch (err) {
    app.innerHTML = errorHtml(err);
    return;
  }

  // Banner premium solo si Stripe está configurado y no soy premium.
  const billing = await billingStatus();
  const upsell = !billing.isPremium && billing.stripeConfigured
    ? `<a class="premium-banner" href="#/premium">👑 ${t("premium_banner")}</a>`
    : "";

  const ageOpts = (sel) => {
    let s = `<option value="">—</option>`;
    for (let a = 18; a <= 60; a += 1) {
      s += `<option value="${a}"${String(a) === String(sel) ? " selected" : ""}>${a}</option>`;
    }
    return s;
  };
  const distOpts = (sel) => {
    const opciones = [["", t("filters_any")], ["10", t("filters_miles").replace("{n}", "10")],
      ["25", t("filters_miles").replace("{n}", "25")], ["50", t("filters_miles").replace("{n}", "50")],
      ["100", t("filters_miles").replace("{n}", "100")]];
    return opciones.map(([v, l]) =>
      `<option value="${v}"${String(v) === String(sel || "") ? " selected" : ""}>${l}</option>`).join("");
  };
  const filtrosHtml = `
    <details class="filters">
      <summary>🎛 ${t("filters_title")}</summary>
      <div class="filter-grid">
        <label>${t("filters_minAge")}<select id="f-minAge">${ageOpts(filtros.minAge)}</select></label>
        <label>${t("filters_maxAge")}<select id="f-maxAge">${ageOpts(filtros.maxAge)}</select></label>
        <label>${t("filters_maxDistance")}<select id="f-maxDist">${distOpts(filtros.maxDistance)}</select></label>
      </div>
      <div class="filter-actions">
        <button id="f-apply" class="btn btn-like">${t("filters_apply")}</button>
        <button id="f-clear" class="btn btn-pass">${t("filters_clear")}</button>
      </div>
    </details>`;

  // Barra de stories (se llena con loadStoriesBar) y Top Picks del día.
  const storiesBarHtml = `<div class="stories-bar" id="stories-bar"><p class="muted">${t("common_loading")}</p></div>`;
  const toppicksHtml = `<div class="toppicks" id="toppicks"></div>`;

  // Sin más tarjetas: mensaje amable (con filtros visibles para ajustarlos).
  if (!card) {
    app.innerHTML = `<section class="discover"><h2>${t("discover_title")}</h2>${upsell}${storiesBarHtml}${filtrosHtml}${toppicksHtml}<div class="empty">${t("discover_empty")}</div></section>`;
    wireFilters();
    loadStoriesBar();
    loadTopPicks();
    return;
  }

  const photo = card.photos && card.photos[0];
  const langs = (card.languages || []).map(esc).join(" · ");
  const interests = (card.interests || [])
    .map((i) => `<span class="tag">${esc(i)}</span>`)
    .join("");
  const distTxt = card.distanceMi !== null && card.distanceMi !== undefined
    ? `<p class="muted">📍 ${esc(t("discover_distance").replace("{n}", card.distanceMi))}</p>` : "";
  const boostTxt = card.boosted ? `<span class="boost-tag">${t("discover_boosted")}</span>` : "";
  const presenceTxt = presenceHtml(card);

  // El video de presentación va PRIMERO (autoplay, sin sonido, en bucle).
  const mediaHtml = card.videoUrl
    ? `<video class="card-video" src="${esc(card.videoUrl)}" autoplay muted loop playsinline></video>`
    : photo
      ? `<img class="card-photo" id="card-photo" src="${esc(photo)}" alt="">`
      : `<div class="card-photo placeholder" aria-hidden="true">❤</div>`;

  app.innerHTML = `
    <section class="discover">
      ${upsell}
      <h2>${t("discover_title")}</h2>
      ${storiesBarHtml}
      ${filtrosHtml}
      ${toppicksHtml}
      <article class="card">
        ${mediaHtml}
        <div class="card-body">
          <h3>${esc(card.displayName)}, ${esc(card.age)} ${vBadge(card.isVerified)} ${boostTxt}</h3>
          <p class="muted">${esc(card.town || "")}</p>
          ${presenceTxt ? `<p>${presenceTxt}</p>` : ""}
          ${distTxt}
          ${card.bio ? `<p class="bio">${esc(card.bio)}</p>` : ""}
          ${langs ? `<p class="muted">🗣 ${langs}</p>` : ""}
          ${interests ? `<p class="interests-label">${t("discover_interests")}</p><div class="tags">${interests}</div>` : ""}
        </div>
      </article>
      <div class="vote-row">
        <button id="btn-pass" class="btn btn-pass">✕<span>${t("discover_pass")}</span></button>
        <button id="btn-super" class="btn btn-super" title="${esc(t("superlike"))}">⭐<span>${t("superlike")}</span></button>
        <button id="btn-like" class="btn btn-like">❤<span>${t("discover_like")}</span></button>
      </div>
      <p class="muted hint">👆 ${t("view_profile_hint") || ""}</p>
    </section>`;

  wireFilters();
  loadStoriesBar(); // llena la barra de stories de 24 h
  loadTopPicks();   // llena los 3 Top Picks del día
  // Tocar la foto o el video abre el perfil completo (y registra la visita).
  const cardPhoto = document.getElementById("card-photo");
  if (cardPhoto) {
    cardPhoto.addEventListener("click", () => openProfileViewer(card.userId));
  }
  const cardVideo = document.querySelector(".discover .card-video");
  if (cardVideo) {
    cardVideo.addEventListener("click", () => openProfileViewer(card.userId));
  }

  const vote = async (v, isSuper) => {
    // Micro-animación inmediata: pop del botón + la tarjeta sale volando.
    const btnIds = { pass: "btn-pass", like: "btn-like" };
    const btn = document.getElementById(isSuper ? "btn-super" : btnIds[v]);
    if (btn) {
      btn.classList.remove("vote-pop");
      void btn.offsetWidth; // reinicia la animación
      btn.classList.add("vote-pop");
    }
    const cardEl = document.querySelector(".discover .card");
    if (cardEl) {
      cardEl.classList.add(v === "pass" ? "swipe-left" : isSuper ? "swipe-up" : "swipe-right");
    }
    if (v === "like" && btn) {
      const r = btn.getBoundingClientRect();
      heartBurst(r.left + r.width / 2, r.top); // burst de corazones al dar like
    }
    try {
      // POST /api/votes {targetUserId, vote:"like"|"pass", super?} → {ok, match, matchId?, super?}
      const res = await api("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: card.userId, vote: v, super: !!isSuper }),
      });
      await sleep(cardEl ? 300 : 0); // deja que la animación de salida se aprecie
      celebrateAchievements(res.newAchievements); // 🏆 logros (primer like, match, popular...)
      if (res.match) {
        showMatchModal(card.displayName, res.matchId, !!res.super); // ¡match! aviso celebratorio
      } else {
        renderDiscover(); // siguiente tarjeta
      }
    } catch (err) {
      // Si falló el voto, la tarjeta vuelve a su lugar.
      if (cardEl) cardEl.classList.remove("swipe-left", "swipe-right", "swipe-up");
      // Límites diarios → invitar al premium en vez de un toast seco.
      if (err && (err.code === "LIKE_LIMIT_REACHED" || err.code === "SUPERLIKE_LIMIT_REACHED")) {
        showPremiumModal();
        return;
      }
      toast(apiErrorMessage(err));
    }
  };
  document.getElementById("btn-pass").addEventListener("click", () => vote("pass", false));
  document.getElementById("btn-super").addEventListener("click", () => vote("like", true));
  document.getElementById("btn-like").addEventListener("click", () => vote("like", false));

  function wireFilters() {
    const apply = document.getElementById("f-apply");
    if (!apply) return;
    apply.addEventListener("click", () => {
      setDiscoverFilters({
        minAge: document.getElementById("f-minAge").value || "",
        maxAge: document.getElementById("f-maxAge").value || "",
        maxDistance: document.getElementById("f-maxDist").value || "",
      });
      renderDiscover();
    });
    document.getElementById("f-clear").addEventListener("click", () => {
      setDiscoverFilters({});
      renderDiscover();
    });
  }
}

/* ----- Stories 24 h ----- */
// Llena la barra de stories: botón + para la mía, círculos de los demás.
async function loadStoriesBar() {
  const bar = document.getElementById("stories-bar");
  if (!bar) return;
  let data;
  try {
    // GET /api/stories/feed → {feed:[{userId,displayName,age,photo,isMatch,stories[]}], mine:[]}
    data = await api("/api/stories/feed");
  } catch (e) {
    bar.innerHTML = "";
    return;
  }
  const token = encodeURIComponent(getToken() || "");
  const items = [];

  // Botón + : subir mi story (foto o video).
  const myThumb = (data.mine && data.mine[0] && data.mine[0].mediaType === "photo")
    ? data.mine[0].mediaUrl + "?token=" + token
    : "";
  items.push(`
    <div class="story-wrap">
      <button class="story-item" id="story-add" aria-label="${esc(t("story_add"))}">
        <span class="story-circle story-add-circle">${myThumb ? `<img src="${esc(myThumb)}" alt="">` : "+"}</span>
        <span class="story-name">${t("story_add")}</span>
      </button>
      <input type="file" id="story-input" accept="image/*,video/*" hidden>
    </div>`);

  for (const g of data.feed || []) {
    const first = g.stories[0];
    const thumb = first.mediaType === "photo"
      ? first.mediaUrl + "?token=" + token
      : (g.photo || "");
    items.push(`
      <button class="story-item" data-story-user="${esc(g.userId)}">
        <span class="story-circle${g.isMatch ? " is-match" : ""}">${thumb ? `<img src="${esc(thumb)}" alt="">` : "📸"}</span>
        <span class="story-name">${esc(g.displayName)}</span>
      </button>`);
  }

  bar.innerHTML = `<div class="stories-row">${items.join("")}</div>`;

  // Abrir el visor de cada grupo.
  const grupos = {};
  for (const g of data.feed || []) grupos[g.userId] = g;
  bar.querySelectorAll("[data-story-user]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const g = grupos[btn.getAttribute("data-story-user")];
      if (g) openStoryViewer(g.displayName, g.stories, null);
    });
  });

  // Subir mi story → POST /api/stories (multipart, campo "media").
  const addBtn = document.getElementById("story-add");
  const fileInput = document.getElementById("story-input");
  if (addBtn && fileInput) {
    // Si tengo stories, tocar mi círculo las muestra (con opción de borrar).
    if (data.mine && data.mine.length && myThumb) {
      addBtn.addEventListener("click", () => openStoryViewer(t("story_add"), data.mine, true));
    } else {
      addBtn.addEventListener("click", () => fileInput.click());
    }
    fileInput.addEventListener("change", async () => {
      if (!fileInput.files.length) return;
      const fd = new FormData();
      fd.append("media", fileInput.files[0]);
      toast(t("story_uploading"));
      try {
        await api("/api/stories", { method: "POST", body: fd });
        toast(t("story_uploaded"));
        loadStoriesBar();
      } catch (err) {
        toast(apiErrorMessage(err));
      }
      fileInput.value = "";
    });
  }
}

// Visor fullscreen de stories: avanza solo (5 s foto, al terminar video).
function openStoryViewer(name, stories, mine) {
  if (!stories || !stories.length) return;
  const old = document.getElementById("story-viewer");
  if (old) old.remove();
  const token = encodeURIComponent(getToken() || "");
  let idx = 0;
  let timer = null;

  const overlay = document.createElement("div");
  overlay.className = "story-viewer";
  overlay.id = "story-viewer";

  const close = () => {
    if (timer) clearTimeout(timer);
    overlay.remove();
  };

  const next = () => {
    if (idx < stories.length - 1) {
      idx += 1;
      render();
    } else {
      close();
    }
  };

  const render = () => {
    if (timer) clearTimeout(timer);
    const s = stories[idx];
    const url = s.mediaUrl + "?token=" + token;
    overlay.innerHTML = `
      <div class="sv-top">
        <div class="sv-progress">${stories.map((_, i) => `<span class="sv-bar${i <= idx ? " on" : ""}"></span>`).join("")}</div>
        <div class="sv-user">
          <strong>${esc(name || "")}</strong>
          <span>
            ${mine ? `<button class="btn btn-ghost btn-sm" id="sv-del">🗑 ${t("story_delete")}</button>` : ""}
            <button class="btn btn-ghost btn-sm" id="sv-close" aria-label="${esc(t("common_close"))}">✕</button>
          </span>
        </div>
      </div>
      ${s.mediaType === "video"
        ? `<video class="sv-media" id="sv-media" src="${esc(url)}" autoplay playsinline></video>`
        : `<img class="sv-media" src="${esc(url)}" alt="">`}
      <button class="sv-nav sv-prev" id="sv-prev" aria-label="‹">‹</button>
      <button class="sv-nav sv-next" id="sv-next" aria-label="›">›</button>`;
    overlay.querySelector("#sv-close").addEventListener("click", close);
    overlay.querySelector("#sv-prev").addEventListener("click", (e) => {
      e.stopPropagation();
      if (idx > 0) { idx -= 1; render(); }
    });
    overlay.querySelector("#sv-next").addEventListener("click", (e) => {
      e.stopPropagation();
      next();
    });
    const del = overlay.querySelector("#sv-del");
    if (del) {
      del.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm(t("story_deleteConfirm"))) return;
        try {
          // DELETE /api/stories/:id → {ok}
          await api("/api/stories/" + encodeURIComponent(s.id), { method: "DELETE" });
          toast(t("story_deleted"));
          close();
          loadStoriesBar();
        } catch (err) {
          toast(apiErrorMessage(err));
        }
      });
    }
    const media = overlay.querySelector("#sv-media");
    if (s.mediaType === "video" && media) {
      media.addEventListener("ended", next); // al terminar el video, siguiente
      timer = setTimeout(next, 30000); // seguridad: máx. 30 s por video
    } else {
      timer = setTimeout(next, 5000); // las fotos avanzan a los 5 s
    }
  };

  document.body.appendChild(overlay);
  render();
}

/* ----- Top Picks 💎 ----- */
// 3 perfiles elegidos para ti hoy (borde dorado, mismas acciones like/pass/super).
async function loadTopPicks() {
  const box = document.getElementById("toppicks");
  if (!box) return;
  let data;
  try {
    // GET /api/top-picks → {picks:[{userId,displayName,age,town,photos,isVerified}], premium}
    data = await api("/api/top-picks");
  } catch (e) {
    box.innerHTML = "";
    return;
  }
  const picks = data.picks || [];
  if (!picks.length) {
    box.innerHTML = "";
    return;
  }

  box.innerHTML = `
    <div class="toppicks-head">
      <h3>${t("toppicks_title")}</h3>
      <p class="muted">${t("toppicks_sub")}</p>
    </div>
    <div class="toppicks-row">
      ${picks.map((p) => {
        const photo = p.photos && p.photos[0];
        return `
        <article class="pick-card" data-pick="${esc(p.userId)}">
          ${photo
            ? `<img class="pick-photo" src="${esc(photo)}" alt="">`
            : `<div class="pick-photo placeholder" aria-hidden="true">❤</div>`}
          <div class="pick-body">
            <strong>${esc(p.displayName)}, ${esc(p.age)} ${vBadge(p.isVerified)}</strong>
            ${data.premium ? `<span class="pick-premium">${t("toppicks_premium")}</span>` : ""}
            <p class="muted">${esc(p.town || "")}</p>
          </div>
          <div class="pick-actions">
            <button class="btn btn-pass btn-sm" data-vote="pass" data-u="${esc(p.userId)}" aria-label="${esc(t("discover_pass"))}">✕</button>
            <button class="btn btn-super btn-sm" data-vote="super" data-u="${esc(p.userId)}" aria-label="${esc(t("superlike"))}">⭐</button>
            <button class="btn btn-like btn-sm" data-vote="like" data-u="${esc(p.userId)}" aria-label="${esc(t("discover_like"))}">❤</button>
          </div>
        </article>`;
      }).join("")}
    </div>`;

  box.querySelectorAll("[data-vote]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const u = Number(btn.getAttribute("data-u"));
      const kind = btn.getAttribute("data-vote");
      const card = btn.closest(".pick-card");
      const name = card ? card.querySelector("strong").textContent : "";
      btn.disabled = true;
      try {
        // POST /api/votes {targetUserId, vote, super?}
        const res = await api("/api/votes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetUserId: u,
            vote: kind === "pass" ? "pass" : "like",
            super: kind === "super",
          }),
        });
        if (res.match) {
          showMatchModal(name, res.matchId, !!res.super);
        } else {
          loadTopPicks(); // recarga los picks (el votado ya no sale)
        }
      } catch (err) {
        if (err && (err.code === "LIKE_LIMIT_REACHED" || err.code === "SUPERLIKE_LIMIT_REACHED")) {
          showPremiumModal();
        } else {
          toast(apiErrorMessage(err));
        }
        btn.disabled = false;
      }
    });
  });
}

// Modal celebratorio cuando hay match.
function showMatchModal(name, matchId, wasSuper) {  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal match-celebrate" role="dialog" aria-modal="true">
      <div class="modal-heart" aria-hidden="true">💘</div>
      ${wasSuper ? `<p class="super-badge">${t("superlike_badge")}</p>` : ""}
      <h2>${t("match_title")}</h2>
      <p>${t("match_subtitle", { name: esc(name) })}</p>
      <button class="btn btn-primary" id="m-chat">${t("match_chat")}</button>
      <button class="btn btn-ghost" id="m-keep">${t("match_keep")}</button>
    </div>`;
  document.body.appendChild(overlay);
  // Corazones flotantes dentro del modal + confeti en pantalla.
  const modal = overlay.querySelector(".modal");
  for (let i = 0; i < 8; i++) {
    const h = document.createElement("span");
    h.className = "float-heart";
    h.textContent = ["💖", "💕", "❤️", "💘"][i % 4];
    h.style.left = (8 + Math.random() * 84) + "%";
    h.style.animationDelay = (Math.random() * 0.9).toFixed(2) + "s";
    modal.appendChild(h);
  }
  confettiBurst();
  overlay.querySelector("#m-chat").addEventListener("click", () => {
    overlay.remove();
    location.hash = "#/chat/" + encodeURIComponent(matchId);
  });
  overlay.querySelector("#m-keep").addEventListener("click", () => {
    overlay.remove();
    renderDiscover();
  });
}

// Overlay con el perfil público de otro usuario.
// GET /api/profile/:userId (esta llamada registra la visita en el backend).
async function openProfileViewer(userId) {
  if (!Number.isInteger(userId)) return;
  toast(t("common_loading"));
  let p = null;
  try {
    const data = await api("/api/profile/" + encodeURIComponent(userId));
    p = data.profile;
  } catch (err) {
    toast(apiErrorMessage(err));
    return;
  }
  const langs = (p.languages || []).map(esc).join(" · ");
  const interests = (p.interests || [])
    .map((i) => `<span class="tag">${esc(i)}</span>`)
    .join("");
  const photosHtml = (p.photos || [])
    .map((f) => `<img src="${esc(f.url)}" alt="">`)
    .join("");
  const videoHtml = p.videoUrl
    ? `<video class="viewer-video" src="${esc(p.videoUrl)}" controls autoplay muted loop playsinline></video>`
    : "";
  const presenceTxt = presenceHtml(p);
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal profile-viewer" role="dialog" aria-modal="true">
      ${videoHtml}
      <div class="viewer-photos">${photosHtml || (videoHtml ? "" : `<div class="card-photo placeholder" aria-hidden="true">❤</div>`)}</div>
      <h2>${esc(p.displayName)}, ${esc(p.age)} ${vBadge(p.isVerified)}</h2>
      ${presenceTxt ? `<p>${presenceTxt}</p>` : ""}
      <p class="muted">${esc(p.town || "")}</p>
      ${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ""}
      ${langs ? `<p class="muted">🗣 ${langs}</p>` : ""}
      ${interests ? `<p class="interests-label">${t("discover_interests")}</p><div class="tags">${interests}</div>` : ""}
      <button class="btn btn-primary" id="pv-close">${t("common_close")}</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#pv-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) overlay.remove();
  });
}

/* ----- #/matches ----- */
async function renderMatches() {
  app.innerHTML = `<section><h2>${t("matches_title")}</h2><div class="skel-row" aria-hidden="true"><div class="skel"></div></div><div class="skel-row" aria-hidden="true"><div class="skel"></div></div><div class="skel-row" aria-hidden="true"><div class="skel"></div></div></section>`;

  // REGLA: sin verificación por selfie no se ven los matches.
  try {
    const vs = await api("/api/verification/status");
    if (!vs.isVerified) {
      await renderVerifyGate();
      return;
    }
  } catch (err) {
    app.innerHTML = errorHtml(err);
    return;
  }

  let admirers = { locked: true, count: 0 };
  let visitors = { locked: true, count: 0 };
  try {
    // GET /api/matches → {matches:[{matchId, user:{...}, createdAt, lastMessage}]}
    const data = await api("/api/matches");
    cache.matches = data.matches || [];
    // GET /api/admirers → {locked:true,count} o {locked:false,admirers:[...]}
    admirers = await api("/api/admirers");
    // GET /api/visitors → {locked:true,count} o {locked:false,visitors:[...]}
    visitors = await api("/api/visitors");
  } catch (err) {
    app.innerHTML = errorHtml(err);
    return;
  }

  // "Les gustas": gratis ve el conteo bloqueado, premium ve las tarjetas.
  let admirersHtml = "";
  if (admirers.locked) {
    if (admirers.count > 0) {
      admirersHtml = `<a class="admirers-locked" href="#/premium">
        <span class="admirers-count">💛 ${esc(String(admirers.count))}</span>
        <span>${t("admirers_locked")}</span>
        <span class="chev" aria-hidden="true">›</span>
      </a>`;
    }
  } else if ((admirers.admirers || []).length) {
    admirersHtml =
      `<h3 class="section-sub">💛 ${t("admirers_title")}</h3><ul class="match-list">` +
      admirers.admirers
        .map((a) => {
          const photo = a.photos && a.photos[0];
          return `<li><div class="match-item">
            <span class="match-photo" data-view-profile="${esc(a.userId)}">
            ${photo
              ? `<img src="${esc(photo)}" alt="">`
              : `<span class="avatar-fallback" aria-hidden="true">❤</span>`}
            </span>
            <span class="match-info">
              <strong>${esc(a.displayName)}, ${esc(a.age)} ${vBadge(a.isVerified)}</strong>
              <small class="muted">${esc(a.town || "")}</small>
              ${a.isSuper ? `<small class="super-badge">${t("superlike_badge")}</small>` : ""}
            </span>
            <button class="btn btn-sm btn-primary" data-like-back="${esc(a.userId)}">❤</button>
          </div></li>`;
        })
        .join("") +
      `</ul>`;
  }

  // "Quién vio tu perfil 👀": gratis ve el conteo bloqueado, premium ve la lista.
  let visitorsHtml = "";
  if (visitors.locked) {
    if (visitors.count > 0) {
      visitorsHtml = `<a class="admirers-locked" href="#/premium">
        <span class="admirers-count">👀 ${esc(String(visitors.count))}</span>
        <span>${t("visitors_locked")}</span>
        <span class="chev" aria-hidden="true">›</span>
      </a>`;
    }
  } else if ((visitors.visitors || []).length) {
    visitorsHtml =
      `<h3 class="section-sub">👀 ${t("visitors_title")}</h3><ul class="match-list">` +
      visitors.visitors
        .map((v) => {
          const photo = v.photos && v.photos[0];
          return `<li><div class="match-item" data-view-profile="${esc(v.userId)}">
            ${photo
              ? `<img src="${esc(photo)}" alt="">`
              : `<span class="avatar-fallback" aria-hidden="true">❤</span>`}
            <span class="match-info">
              <strong>${esc(v.displayName)}, ${esc(v.age)} ${vBadge(v.isVerified)}</strong>
              <small class="muted">${esc(v.town || "")}</small>
            </span>
            <span class="chev" aria-hidden="true">›</span>
          </div></li>`;
        })
        .join("") +
      `</ul>`;
  } else {
    visitorsHtml = `<p class="muted">${t("visitors_empty")}</p>`;
  }

  const listHtml = cache.matches.length
    ? `<ul class="match-list">` +
      cache.matches
        .map((m) => {
          const u = m.user || {};
          const photo = u.photos && u.photos[0];
          return `<li><a class="match-item" href="#/chat/${encodeURIComponent(m.matchId)}">
            ${photo
              ? `<img src="${esc(photo)}" alt="">`
              : `<span class="avatar-fallback" aria-hidden="true">❤</span>`}
            <span class="match-info">
              <strong>${esc(u.displayName)}, ${esc(u.age)} ${vBadge(u.isVerified)}</strong>
              <small class="muted">${esc((m.lastMessage && m.lastMessage.text) || u.town || "")}</small>
              ${presenceHtml(u) ? `<small>${presenceHtml(u)}</small>` : ""}
            </span>
            <span class="chev" aria-hidden="true">›</span>
          </a></li>`;
        })
        .join("") +
      `</ul>`
    : `<div class="empty">${t("matches_empty")}</div>`;

  app.innerHTML = `<section><h2>${t("matches_title")}</h2>${admirersHtml}${visitorsHtml}${listHtml}</section>`;

  // Escuchar llamadas entrantes mientras estoy en Matches.
  startIncomingCallPolling();

  // Tocar una tarjeta de admirador/visitante abre su perfil (registra la visita).
  app.querySelectorAll("[data-view-profile]").forEach((el) => {
    el.addEventListener("click", (ev) => {
      ev.preventDefault();
      openProfileViewer(Number(el.getAttribute("data-view-profile")));
    });
  });

  // Botones "devolver like" en la lista de admiradores.
  app.querySelectorAll("[data-like-back]").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      btn.disabled = true;
      try {
        // POST /api/votes {targetUserId, vote:"like"} → posible match
        await api("/api/votes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetUserId: Number(btn.getAttribute("data-like-back")),
            vote: "like",
          }),
        });
        renderMatches();
      } catch (err) {
        toast(apiErrorMessage(err));
        btn.disabled = false;
      }
    });
  });
}

/* ----- #/premium ----- */
async function renderPremium() {
  // Regreso de Stripe: ?estado=exito o ?estado=cancelado.
  const estado = (location.hash.split("?")[1] || "").includes("estado=exito")
    ? "exito"
    : (location.hash.split("?")[1] || "").includes("estado=cancelado")
      ? "cancelado"
      : null;

  app.innerHTML = `<section class="premium"><h2>👑 ${t("premium_title")}</h2><p class="muted">${t("common_loading")}</p></section>`;

  const billing = await billingStatus(true); // forzar: pudo cambiar en Stripe

  if (estado === "exito") {
    toast(t("premium_success"));
    history.replaceState(null, "", "#/premium"); // limpia el query
  } else if (estado === "cancelado") {
    toast(t("premium_cancelled"));
    history.replaceState(null, "", "#/premium");
  }

  // Stripe sin configurar → aviso amable (el dueño lo activa luego).
  if (!billing.stripeConfigured) {
    app.innerHTML = `<section class="premium"><h2>👑 ${t("premium_title")}</h2>
      <div class="empty">${t("premium_soon")}</div>
      <p class="center"><a class="btn btn-ghost" href="#/descubrir">${t("common_back")}</a></p>
    </section>`;
    return;
  }

  // Ya es premium → mostrar estado y portal.
  if (billing.isPremium) {
    app.innerHTML = `<section class="premium"><h2>👑 ${t("premium_title")}</h2>
      <div class="premium-card active">
        <div class="premium-check" aria-hidden="true">✅</div>
        <p><strong>${t("premium_active")}</strong></p>
        ${billing.premiumUntil ? `<p class="muted">${t("premium_until", { date: esc(billing.premiumUntil.slice(0, 10)) })}</p>` : ""}
        <button class="btn btn-ghost" id="btn-portal">${t("premium_manage")}</button>
      </div>
      <p class="center"><a class="btn btn-ghost" href="#/descubrir">${t("common_back")}</a></p>
    </section>`;
    document.getElementById("btn-portal").addEventListener("click", async () => {
      try {
        // POST /api/billing/portal → {url} (portal de Stripe)
        const data = await api("/api/billing/portal", { method: "POST" });
        location.href = data.url;
      } catch (err) {
        toast(apiErrorMessage(err));
      }
    });
    return;
  }

  // No es premium → oferta.
  app.innerHTML = `<section class="premium"><h2>👑 ${t("premium_title")}</h2>
    <div class="premium-card">
      <ul class="premium-list">
        <li>💛 ${t("premium_f1")}</li>
        <li>❤️‍🔥 ${t("premium_f2")}</li>
        <li>🚀 ${t("premium_f3")}</li>
      </ul>
      <p class="premium-price">${t("premium_price")}</p>
      <button class="btn btn-primary" id="btn-checkout">👑 ${t("premium_cta")}</button>
      <p class="muted small center">${t("premium_note")}</p>
    </div>
    <p class="center"><a class="btn btn-ghost" href="#/descubrir">${t("common_back")}</a></p>
  </section>`;

  document.getElementById("btn-checkout").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      // POST /api/billing/checkout → {url} (Stripe Checkout)
      const data = await api("/api/billing/checkout", { method: "POST" });
      location.href = data.url; // Stripe se encarga del pago
    } catch (err) {
      toast(apiErrorMessage(err));
      btn.disabled = false;
    }
  });
}

/* ----- #/chat/:matchId ----- */
async function renderChat(matchId) {
  // Si se abrió el chat directo (sin pasar por matches), carga los matches
  // para saber quién es el otro usuario (lo necesitamos para reportar/bloquear).
  let match = cache.matches.find((m) => String(m.matchId) === String(matchId));
  if (!match) {
    try {
      cache.matches = (await api("/api/matches")).matches || [];
      match = cache.matches.find((m) => String(m.matchId) === String(matchId));
    } catch (e) {
      /* seguimos sin el nombre; el chat igual funciona */
    }
  }
  const other = (match && match.user) || {};
  const otherId = other.userId;

  app.innerHTML = `
    <section class="chat">
      <div class="chat-header">
        <a class="btn btn-ghost btn-sm" href="#/matches" aria-label="${t("common_back")}">‹</a>
        <span class="chat-peer">
          <strong class="chat-name">${esc(other.displayName || "")} ${vBadge(other.isVerified)}</strong>
          <span class="chat-presence" id="chat-presence">${presenceHtml(other)}</span>
        </span>
        <button class="btn btn-ghost btn-sm" id="chat-call" title="${esc(t("call_video"))}" aria-label="${esc(t("call_video"))}">📹</button>
        <button class="btn btn-ghost btn-sm" id="chat-dateplan" title="${esc(t("dateplan_btn"))}" aria-label="${esc(t("dateplan_btn"))}">📅</button>
        <button class="btn btn-ghost btn-sm" id="chat-gift" title="${esc(t("gift_title"))}" aria-label="${esc(t("gift_title"))}">🎁</button>
        <button class="btn btn-ghost btn-sm" id="chat-report">🚩 ${t("chat_report")}</button>
        <button class="btn btn-ghost btn-sm danger" id="chat-block">⛔ ${t("chat_block")}</button>
      </div>
      <div class="messages" id="messages"><div class="skel" style="min-height:52px;max-width:70%" aria-hidden="true"></div><div class="skel" style="min-height:52px;max-width:60%;align-self:flex-end" aria-hidden="true"></div><div class="skel" style="min-height:52px;max-width:66%" aria-hidden="true"></div></div>
      <form class="chat-input" id="chat-form">
        <button type="button" class="btn btn-ghost" id="chat-ice" title="${esc(t("icebreaker_btn"))}" aria-label="${esc(t("icebreaker_btn"))}">🧊</button>
        <button type="button" class="btn btn-ghost" id="chat-voice" title="${esc(t("chat_voice"))}" aria-label="${esc(t("chat_voice"))}">🎤</button>
        <input name="text" autocomplete="off" maxlength="1000" placeholder="${esc(t("chat_placeholder"))}">
        <button type="submit" class="btn btn-primary">${t("common_send")}</button>
      </form>
    </section>`;

  const box = document.getElementById("messages");

  // Averigua mi id para saber qué burbujas van a la derecha.
  // GET /api/auth/me → {user}
  let myId = null;
  try {
    const me = (await api("/api/auth/me")).user || {};
    myId = me.id || me.userId || me._id || null;
  } catch (e) {
    /* si falla, todos los mensajes se ven a la izquierda; no es grave */
  }

  let lastId = 0; // id del último mensaje visto (para ?after=)

  // Idioma principal del otro (para la traducción ES↔EN) y el mío.
  // Solo ofrecemos traducir entre español e inglés (lo que cubre MyMemory gratis).
  const otherLang = String((other.languages && other.languages[0]) || "").toLowerCase();
  let myLang = lang; // idioma de la app como respaldo
  try {
    const meProf = await api("/api/profile/");
    const mls = (meProf.profile && meProf.profile.languages) || [];
    if (mls.length) myLang = String(mls[0]).toLowerCase();
  } catch (e) { /* seguimos con el idioma de la app */ }
  // ¿Este mensaje recibido merece botón 🌐? Solo texto, del otro, y ES↔EN.
  const needsTranslation = (m) =>
    (m.type || "text") === "text" &&
    m.text &&
    !(myId && String(m.senderId) === String(myId)) &&
    ["es", "en"].includes(otherLang) &&
    ["es", "en"].includes(myLang) &&
    otherLang !== myLang;

  // Traduce con MyMemory (gratis, sin clave). Cachea por mensaje.
  const traducciones = {}; // msgId → {original, translated, showing}
  const traducirMensaje = async (m, btn) => {
    const id = m.id;
    if (traducciones[id] && traducciones[id].showing === "translated") {
      // Toggle: vuelve al original.
      traducciones[id].showing = "original";
      btn.textContent = "🌐";
      const el = document.querySelector(`[data-traduccion="${id}"]`);
      if (el) el.remove();
      return;
    }
    if (traducciones[id] && traducciones[id].showing === "original") {
      traducciones[id].showing = "translated";
      btn.textContent = "🌐✓";
      mostrarTraduccion(id, traducciones[id].translated);
      return;
    }
    btn.disabled = true;
    btn.textContent = "⏳";
    try {
      const url =
        "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(m.text) +
        "&langpair=" + encodeURIComponent(otherLang + "|" + myLang);
      const res = await fetch(url);
      const data = await res.json();
      const txt = data && data.responseData && data.responseData.translatedText;
      if (!txt) throw new Error("empty");
      traducciones[id] = { original: m.text, translated: txt, showing: "translated" };
      btn.textContent = "🌐✓";
      mostrarTraduccion(id, txt);
    } catch (e) {
      toast(t("translate_fail"));
      btn.textContent = "🌐";
    }
    btn.disabled = false;
  };
  const mostrarTraduccion = (id, txt) => {
    const burbuja = document.querySelector(`.msg[data-mid="${id}"] .msg-text`);
    if (!burbuja || document.querySelector(`[data-traduccion="${id}"]`)) return;
    const p = document.createElement("p");
    p.className = "msg-translation";
    p.setAttribute("data-traduccion", id);
    p.textContent = txt;
    burbuja.appendChild(p);
  };

  // Tarjeta de plan de cita: borde degradado; estado propuesto/aceptado/rechazado.
  const pintarPlan = (plan) => {
    if (!plan) return `<p class="muted">${t("dateplan_missing")}</p>`;
    const fecha = new Date(plan.dateTime);
    const fechaTxt = isNaN(fecha.getTime())
      ? plan.dateTime
      : fecha.toLocaleString(lang === "es" ? "es-DO" : "en-US", {
          weekday: "short", day: "numeric", month: "short",
          hour: "numeric", minute: "2-digit",
        });
    let estadoHtml = "";
    if (plan.status === "accepted") {
      estadoHtml = `<p class="plan-status ok">✅ ${esc(
        t("dateplan_confirmed").replace("{place}", plan.place).replace("{date}", fechaTxt)
      )}</p>`;
    } else if (plan.status === "declined") {
      estadoHtml = `<p class="plan-status no">❌ ${t("dateplan_declined")}</p>`;
    } else if (!plan.mine) {
      // Propuesta del otro: puedo aceptarla o rechazarla.
      estadoHtml = `<div class="plan-actions">
          <button class="btn btn-sm btn-like" data-plan-accept="${plan.id}">✅ ${t("dateplan_accept")}</button>
          <button class="btn btn-sm btn-pass" data-plan-decline="${plan.id}">✕ ${t("dateplan_decline")}</button>
        </div>`;
    } else {
      estadoHtml = `<p class="plan-status wait">⏳ ${t("dateplan_waiting")}</p>`;
    }
    return `<div class="dateplan-card" data-planid="${plan.id}">
      <p class="plan-title">📅 ${esc(plan.place)}</p>
      <p class="plan-date">🕐 ${esc(fechaTxt)}</p>
      ${plan.note ? `<p class="plan-note">${esc(plan.note)}</p>` : ""}
      ${estadoHtml}
    </div>`;
  };

  // Responde a una propuesta de cita (aceptar/rechazar) y refresca las tarjetas.
  const responderPlan = async (planId, accept) => {
    try {
      const res = await api(
        "/api/chat/" + encodeURIComponent(matchId) + "/dateplan/" + encodeURIComponent(planId) + "/respond",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accept }) }
      );
      // Refresca TODAS las tarjetas de este plan (la propuesta vieja también cambia).
      document.querySelectorAll(`.dateplan-card[data-planid="${planId}"]`).forEach((el) => {
        el.outerHTML = pintarPlan(res.plan);
      });
      if (res.message) {
        appendMsgs([res.message]);
        lastId = res.message.id;
      }
      wirePlanButtons();
      if (accept) confettiBurst();
    } catch (err) {
      toast(apiErrorMessage(err));
    }
  };

  // Conecta los botones Aceptar/Rechazar de las tarjetas de cita.
  const wirePlanButtons = () => {
    box.querySelectorAll("[data-plan-accept]").forEach((b) => {
      b.onclick = () => responderPlan(Number(b.getAttribute("data-plan-accept")), true);
    });
    box.querySelectorAll("[data-plan-decline]").forEach((b) => {
      b.onclick = () => responderPlan(Number(b.getAttribute("data-plan-decline")), false);
    });
  };

  // Dibuja mensajes. El texto usa textContent (no innerHTML) para que nadie
  // pueda inyectar HTML malicioso en el chat.
  // Tipos: 'text' → burbuja normal (+ botón 🌐 si el idioma difiere);
  // 'voice' → reproductor de audio; 'gift' → tarjeta animada del regalo;
  // 'dateplan' → tarjeta de cita propuesta/aceptada/rechazada.
  // Cada mensaje lleva su fila de reacciones (❤️ 😂 🔥 😮 😢 👍).
  const appendMsgs = (msgs) => {
    msgs.forEach((m) => {
      const tipo = m.type || "text";
      // Mensaje del sistema (ej. bienvenida de match): burbuja centrada,
      // sin reacciones ni picker. El texto es una clave i18n.
      if (tipo === "system") {
        const sdiv = document.createElement("div");
        sdiv.className = "msg msg-system";
        sdiv.setAttribute("data-mid", m.id);
        const sp = document.createElement("p");
        sp.textContent = t(m.text === "match_welcome" ? "match_welcome" : m.text);
        sdiv.appendChild(sp);
        box.appendChild(sdiv);
        return;
      }
      const div = document.createElement("div");
      div.className = "msg" + (myId && String(m.senderId) === String(myId) ? " mine" : "");
      div.setAttribute("data-mid", m.id);
      if (tipo === "voice" && m.audioUrl) {
        div.classList.add("msg-voice");
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.preload = "none";
        audio.src = m.audioUrl + "?token=" + encodeURIComponent(getToken() || "");
        div.appendChild(audio);
      } else if (tipo === "gift") {
        div.classList.add("msg-gift");
        div.innerHTML = `<div class="gift-card">
          <span class="gift-emoji" aria-hidden="true">${esc(giftEmoji(m.text))}</span>
          <span class="gift-name">${esc(giftName(m.text))}</span>
        </div>`;
      } else if (tipo === "dateplan") {
        div.classList.add("msg-plan");
        div.innerHTML = pintarPlan(m.dateplan);
      } else {
        const p = document.createElement("p");
        p.className = "msg-text";
        p.textContent = m.text;
        div.appendChild(p);
        // Botón 🌐 si el otro escribe en otro idioma (ES↔EN).
        if (needsTranslation(m)) {
          const tbtn = document.createElement("button");
          tbtn.className = "translate-btn";
          tbtn.type = "button";
          tbtn.textContent = "🌐";
          tbtn.title = t("translate_btn");
          tbtn.setAttribute("aria-label", t("translate_btn"));
          tbtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            traducirMensaje(m, tbtn);
          });
          div.appendChild(tbtn);
        }
      }
      // Fila de reacciones debajo de la burbuja.
      const rrow = document.createElement("div");
      rrow.className = "reactions";
      rrow.setAttribute("data-msgid", m.id);
      paintReactions(rrow, m.reactions || []);
      div.appendChild(rrow);
      box.appendChild(div);
      // Doble tap (PC) o mantener presionado (móvil) → picker de reacciones.
      wireReactPicker(div, m.id);
    });
    wirePlanButtons();
    box.scrollTop = box.scrollHeight; // baja hasta el último mensaje
  };

  // Pinta las reacciones de un mensaje: [{emoji, count, mine}].
  const paintReactions = (row, reactions) => {
    row.innerHTML = (reactions || [])
      .map((r) => `<span class="react-chip${r.mine ? " mine" : ""}">${esc(r.emoji)}${r.count > 1 ? `<b>${r.count}</b>` : ""}</span>`)
      .join("");
    row.style.display = reactions && reactions.length ? "" : "none";
  };

  // Picker de reacciones: 6 emojis, tocar uno reacciona (o quita si ya estaba).
  const openReactPicker = (msgId) => {
    const old = document.getElementById("react-picker");
    if (old) old.remove();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "react-picker";
    overlay.innerHTML = `
      <div class="modal react-modal" role="dialog" aria-modal="true">
        <h3>${t("react_title")}</h3>
        <div class="react-emojis">
          ${REACT_EMOJIS.map((e) => `<button class="react-emoji" data-e="${esc(e)}">${esc(e)}</button>`).join("")}
        </div>
        <button class="btn btn-ghost" id="react-close">${t("common_close")}</button>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector("#react-close").addEventListener("click", close);
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) close();
    });
    overlay.querySelectorAll(".react-emoji").forEach((b) => {
      b.addEventListener("click", async () => {
        const emoji = b.getAttribute("data-e");
        close();
        try {
          // POST /api/chat/:matchId/messages/:msgId/react {emoji} → {reactions}
          const res = await api(
            "/api/chat/" + encodeURIComponent(matchId) + "/messages/" + encodeURIComponent(msgId) + "/react",
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emoji }) }
          );
          const row = box.querySelector(`.reactions[data-msgid="${msgId}"]`);
          if (row) paintReactions(row, res.reactions || []);
        } catch (err) {
          toast(apiErrorMessage(err));
        }
      });
    });
  };

  const wireReactPicker = (div, msgId) => {
    let pressTimer = null;
    div.addEventListener("dblclick", (e) => {
      e.preventDefault();
      openReactPicker(msgId);
    });
    div.addEventListener("touchstart", () => {
      pressTimer = setTimeout(() => openReactPicker(msgId), 500);
    }, { passive: true });
    const cancelPress = () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    };
    div.addEventListener("touchend", cancelPress);
    div.addEventListener("touchmove", cancelPress);
  };

  const load = async (after) => {
    const q = after ? "?after=" + encodeURIComponent(after) : "";
    // GET /api/chat/:matchId/messages?after=<id> → {messages:[{id,senderId,text,createdAt}]}
    const data = await api("/api/chat/" + encodeURIComponent(matchId) + "/messages" + q);
    return data.messages || [];
  };

  try {
    const initial = await load(0);
    box.innerHTML = "";
    if (!initial.length) {
      // Chat nuevo: sugerencia de rompehielo 🧊.
      box.innerHTML = `<p class="muted center">${t("chat_empty")}</p>
        <p class="center"><button class="btn btn-ghost btn-sm" id="empty-ice">🧊 ${t("icebreaker_btn")}</button></p>
        <p class="muted center small">${t("icebreaker_hint")}</p>`;
      const emptyIce = document.getElementById("empty-ice");
      if (emptyIce) emptyIce.addEventListener("click", pedirRompehielo);
    } else {
      appendMsgs(initial);
      lastId = initial[initial.length - 1].id;
    }
    // Polling cada 5 s: pide solo los mensajes nuevos (?after=últimoId).
    chatTimer = setInterval(async () => {
      try {
        const fresh = await load(lastId);
        if (fresh.length) {
          appendMsgs(fresh);
          lastId = fresh[fresh.length - 1].id;
        }
      } catch (e) {
        /* si una vuelta falla, la próxima lo intenta; no molestamos al usuario */
      }
    }, CHAT_POLL_MS);
  } catch (err) {
    box.innerHTML = `<p class="muted center">${esc(apiErrorMessage(err))}</p>`;
  }

  // Enviar mensaje → POST /api/chat/:matchId/messages {text}
  document.getElementById("chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = e.target.text;
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    try {
      const res = await api("/api/chat/" + encodeURIComponent(matchId) + "/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      appendMsgs([res.message]);
      lastId = res.message.id;
      celebrateAchievements(res.newAchievements); // 🏆 ej. "Conversador" a los 50 mensajes
    } catch (err) {
      toast(apiErrorMessage(err)); // ej. BLOCKED → "No puedes enviar mensajes…"
      input.value = text; // devuelve el texto para no perderlo
    }
  });

  // Rompehielo 🧊 → trae una pregunta aleatoria y la pone en el input lista para enviar.
  const pedirRompehielo = async () => {
    const input = document.querySelector("#chat-form input[name=text]");
    if (!input) return;
    try {
      // GET /api/icebreakers/random?lang=es|en → {question}
      const data = await api("/api/icebreakers/random?lang=" + encodeURIComponent(lang));
      input.value = data.question || "";
      input.focus();
    } catch (err) {
      toast(t("icebreaker_fail"));
    }
  };
  document.getElementById("chat-ice").addEventListener("click", pedirRompehielo);

  // Regreso de Stripe tras enviar un regalo: ?regalo=exito o ?regalo=cancelado.
  const regaloEstado = (location.hash.split("?")[1] || "").includes("regalo=exito")
    ? "exito"
    : (location.hash.split("?")[1] || "").includes("regalo=cancelado")
      ? "cancelado"
      : null;
  if (regaloEstado === "exito") {
    toast(t("gift_sent"));
    history.replaceState(null, "", "#/chat/" + encodeURIComponent(matchId)); // limpia el query
  } else if (regaloEstado === "cancelado") {
    toast(t("gift_cancelled"));
    history.replaceState(null, "", "#/chat/" + encodeURIComponent(matchId));
  }

  // Nota de voz 🎤 → MediaRecorder, máx. 60 s, se sube como audio.
  let recorder = null;
  let audioChunks = [];
  let recTimer = null;
  const voiceBtn = document.getElementById("chat-voice");

  const detenerGrabacion = async (enviar) => {
    if (recTimer) { clearTimeout(recTimer); recTimer = null; }
    if (recorder && recorder.state !== "inactive") {
      recorder._enviar = enviar; // lo lee el onstop
      recorder.stop();
    }
  };

  if (voiceBtn) {
    voiceBtn.addEventListener("click", async () => {
      // Si ya está grabando, toca ⏹ para enviar.
      if (recorder && recorder.state === "recording") {
        detenerGrabacion(true);
        return;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast(t("voice_noMic"));
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size) audioChunks.push(e.data);
        };
        recorder.onstop = async () => {
          voiceBtn.textContent = "🎤";
          stream.getTracks().forEach((tr) => tr.stop());
          if (!recorder._enviar) { recorder = null; return; }
          const blob = new Blob(audioChunks, { type: recorder.mimeType || "audio/webm" });
          recorder = null;
          if (!blob.size) return;
          const fd = new FormData();
          fd.append("audio", blob, "nota.webm");
          toast(t("voice_sending"));
          try {
            // POST /api/chat/:matchId/voice (multipart, campo "audio")
            const res = await api(
              "/api/chat/" + encodeURIComponent(matchId) + "/voice",
              { method: "POST", body: fd }
            );
            appendMsgs([res.message]);
            lastId = res.message.id;
            celebrateAchievements(res.newAchievements);
          } catch (err) {
            toast(apiErrorMessage(err));
          }
        };
        recorder.start();
        voiceBtn.textContent = "⏹";
        toast(t("voice_recording"));
        // Para solo a los 60 segundos.
        recTimer = setTimeout(() => detenerGrabacion(true), 60000);
      } catch (e) {
        toast(t("voice_noMic"));
      }
    });
  }

  // Planear cita 📅 → modal con lugar, fecha/hora y nota opcional.
  // POST /api/chat/:matchId/dateplan → crea el plan + el mensaje.
  document.getElementById("chat-dateplan").addEventListener("click", () => {
    const old = document.getElementById("dateplan-modal");
    if (old) old.remove();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "dateplan-modal";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>📅 ${t("dateplan_title")}</h3>
        <form id="dateplan-form">
          <label class="field">${t("dateplan_place")}
            <input name="place" required maxlength="120" placeholder="${esc(t("dateplan_place_ph"))}" autocomplete="off">
          </label>
          <label class="field">${t("dateplan_when")}
            <input name="when" type="datetime-local" required>
          </label>
          <label class="field">${t("dateplan_note")}
            <input name="note" maxlength="300" placeholder="${esc(t("dateplan_note_ph"))}" autocomplete="off">
          </label>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" id="dp-cancel">${t("common_cancel")}</button>
            <button type="submit" class="btn btn-primary">📅 ${t("dateplan_send")}</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector("#dp-cancel").addEventListener("click", close);
    overlay.addEventListener("click", (ev) => { if (ev.target === overlay) close(); });
    overlay.querySelector("#dateplan-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const place = String(fd.get("place") || "").trim();
      const when = String(fd.get("when") || "");
      const note = String(fd.get("note") || "").trim();
      if (!place || !when) return;
      try {
        const res = await api("/api/chat/" + encodeURIComponent(matchId) + "/dateplan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ place, dateTime: new Date(when).toISOString(), note }),
        });
        close();
        if (res.message) {
          appendMsgs([res.message]);
          lastId = res.message.id;
        }
      } catch (err) {
        toast(apiErrorMessage(err));
      }
    });
  });

  // Presencia en el header: se refresca cada 30 s (el backend la oculta
  // si el otro activó el modo invisible).
  const refreshPresence = async () => {
    if (!otherId) return;
    try {
      const data = await api("/api/profile/" + encodeURIComponent(otherId));
      const el = document.getElementById("chat-presence");
      if (el && data.profile) el.innerHTML = presenceHtml(data.profile);
    } catch (e) { /* no molestamos si falla */ }
  };
  presenceTimer = setInterval(refreshPresence, 30000);

  // Tienda de regalos 🎁 → modal con el catálogo; al elegir uno se abre
  // el pago de Stripe (el regalo aparece en el chat cuando se complete).
  document.getElementById("chat-gift").addEventListener("click", async () => {
    const catalogo = await loadGiftCatalog();
    if (!catalogo.length) {
      toast(t("gift_empty"));
      return;
    }
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal gift-shop" role="dialog" aria-modal="true">
        <h2>🎁 ${t("gift_title")}</h2>
        <p class="muted">${t("gift_desc")}</p>
        <div class="gift-grid">
          ${catalogo.map((g) => `
            <button class="gift-item" data-gift="${esc(g.id)}">
              <span class="gift-emoji">${esc(g.emoji)}</span>
              <span class="gift-name">${esc(t("gift_" + g.id))}</span>
              <span class="gift-price">$${(g.priceCents / 100).toFixed(2)}</span>
            </button>`).join("")}
        </div>
        <button class="btn btn-ghost" id="gift-close">${t("common_close")}</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("#gift-close").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) overlay.remove();
    });
    overlay.querySelectorAll(".gift-item").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          // POST /api/gifts/send {matchId, giftId} → {url} (Stripe)
          const res = await api("/api/gifts/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matchId: Number(matchId), giftId: btn.getAttribute("data-gift") }),
          });
          if (res.url) {
            overlay.remove();
            location.href = res.url; // salgo a Stripe; vuelvo con ?regalo=exito
          }
        } catch (err) {
          toast(apiErrorMessage(err));
          btn.disabled = false;
        }
      });
    });
  });

  // Si salgo del chat grabando, suelto el micrófono.
  const stopOnLeave = () => {
    if (recorder && recorder.state === "recording") detenerGrabacion(false);
    window.removeEventListener("hashchange", stopOnLeave);
  };
  window.addEventListener("hashchange", stopOnLeave);

  // Videollamada → botón 📹 inicia la llamada WebRTC con el otro usuario.
  document.getElementById("chat-call").addEventListener("click", () => {
    if (!otherId) {
      toast(apiErrorMessage({ code: "NO_MATCH" }));
      return;
    }
    startCall(otherId, other.displayName || "");
  });

  // Escuchar llamadas entrantes mientras estoy en el chat.
  startIncomingCallPolling();

  // Reportar (con confirmación) → POST /api/reports {targetUserId, reason}
  document.getElementById("chat-report").addEventListener("click", async () => {
    if (!otherId) return;
    if (!confirm(t("chat_reportConfirm"))) return;
    const reason = prompt(t("chat_reportReason"), "");
    if (reason === null) return; // canceló
    try {
      await api("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: otherId, reason: reason.trim() }),
      });
      toast(t("chat_reportSent"));
    } catch (err) {
      toast(apiErrorMessage(err));
    }
  });

  // Bloquear (con confirmación) → POST /api/blocks {targetUserId}
  document.getElementById("chat-block").addEventListener("click", async () => {
    if (!otherId) return;
    if (!confirm(t("chat_blockConfirm"))) return;
    try {
      await api("/api/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: otherId }),
      });
      toast(t("chat_blockDone"));
      location.hash = "#/matches";
    } catch (err) {
      toast(apiErrorMessage(err));
    }
  });
}

/* ----- Videollamadas WebRTC (P2P) ----- */
// La señalización viaja por REST (/api/calls/signal); el audio/video va
// directo entre los dos teléfonos (STUN de Google para atravesar el NAT).

const CALL_POLL_MS = 2500; // la llamada activa pregunta por señales cada 2.5 s
const INCOMING_POLL_MS = 5000; // buscar llamadas entrantes cada 5 s
let callState = null; // llamada activa: {pc, otherId, otherName, localStream, pollTimer, lastSignalId}
let incomingCallTimer = null; // polling de llamadas entrantes
const seenRings = new Set(); // rings ya mostrados (para no repetir el modal)

const RTC_CONFIG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

function stopCallPolling() {
  if (incomingCallTimer) {
    clearInterval(incomingCallTimer);
    incomingCallTimer = null;
  }
  const modal = document.getElementById("incoming-modal");
  if (modal) modal.remove();
}

// Envía una señal WebRTC al otro usuario (el backend exige que haya match).
async function sendCallSignal(toUserId, type, payload) {
  return api("/api/calls/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toUserId, type, payload: payload || "" }),
  });
}

function showCallOverlay(name, outgoing) {
  const old = document.getElementById("call-overlay");
  if (old) old.remove();
  const overlay = document.createElement("div");
  overlay.className = "call-overlay";
  overlay.id = "call-overlay";
  overlay.innerHTML = `
    <video id="call-remote" autoplay playsinline></video>
    <p class="call-status" id="call-status">${outgoing ? t("call_calling") : t("call_connecting")} ${esc(name || "")}</p>
    <video id="call-local" autoplay playsinline muted></video>
    <button class="btn btn-danger" id="call-hangup">${t("call_hangup")}</button>`;
  document.body.appendChild(overlay);
  document.getElementById("call-hangup").addEventListener("click", () => endCall(true));
}

function setCallStatus(msg) {
  const el = document.getElementById("call-status");
  if (el) el.textContent = msg;
}

// Prepara el PeerConnection común (cámara local + manejo de ICE/remoto).
async function setupCallPeer(otherId, otherName) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  const pc = new RTCPeerConnection(RTC_CONFIG);
  stream.getTracks().forEach((tr) => pc.addTrack(tr, stream));
  callState = {
    pc,
    otherId,
    otherName,
    localStream: stream,
    pollTimer: null,
    lastSignalId: 0,
  };
  pc.onicecandidate = (ev) => {
    if (ev.candidate && callState) {
      // POST /api/calls/signal {toUserId, type:"ice", payload}
      sendCallSignal(otherId, "ice", JSON.stringify(ev.candidate)).catch(() => {});
    }
  };
  pc.ontrack = (ev) => {
    const remote = document.getElementById("call-remote");
    if (remote && ev.streams[0]) {
      remote.srcObject = ev.streams[0];
      setCallStatus(otherName || "");
    }
  };
  return { pc, stream };
}

// Llamar: creo la oferta SDP y la mando como señal "ring".
async function startCall(otherId, otherName) {
  if (callState || !otherId) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast(t("call_noCamera"));
    return;
  }
  showCallOverlay(otherName, true);
  try {
    const { pc } = await setupCallPeer(otherId, otherName);
    document.getElementById("call-local").srcObject = callState.localStream;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendCallSignal(otherId, "ring", JSON.stringify(offer));
  } catch (e) {
    endCall(false);
    toast(t("call_failed"));
    return;
  }
  callState.pollTimer = setInterval(pollCallSignals, CALL_POLL_MS);
  pollCallSignals();
}

// Aceptar una llamada entrante: respondo a la oferta con mi respuesta SDP.
async function acceptCall(signal) {
  if (callState) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast(t("call_noCamera"));
    return;
  }
  showCallOverlay(signal.fromName, false);
  try {
    const { pc } = await setupCallPeer(signal.fromId, signal.fromName);
    document.getElementById("call-local").srcObject = callState.localStream;
    await pc.setRemoteDescription(JSON.parse(signal.payload));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    // POST /api/calls/signal {toUserId, type:"answer", payload}
    await sendCallSignal(signal.fromId, "answer", JSON.stringify(answer));
    callState.lastSignalId = signal.id;
  } catch (e) {
    endCall(false);
    toast(t("call_failed"));
    return;
  }
  callState.pollTimer = setInterval(pollCallSignals, CALL_POLL_MS);
  pollCallSignals();
}

function rejectCall(signal) {
  sendCallSignal(signal.fromId, "reject", "").catch(() => {});
}

// Escucha las señales del interlocutor durante la llamada.
async function pollCallSignals() {
  if (!callState) return;
  const st = callState;
  try {
    // GET /api/calls/signals?after=<id> → solo las señales nuevas
    const data = await api("/api/calls/signals?after=" + encodeURIComponent(st.lastSignalId));
    for (const s of data.signals || []) {
      if (s.fromId !== st.otherId) continue;
      st.lastSignalId = Math.max(st.lastSignalId, s.id);
      if (s.type === "answer" && s.payload) {
        await st.pc.setRemoteDescription(JSON.parse(s.payload)).catch(() => {});
      } else if (s.type === "ice" && s.payload) {
        await st.pc.addIceCandidate(JSON.parse(s.payload)).catch(() => {});
      } else if (s.type === "reject") {
        endCall(false);
        toast(t("call_rejected"));
        break;
      } else if (s.type === "hangup" || s.type === "cancel") {
        endCall(false);
        toast(t("call_ended"));
        break;
      }
    }
  } catch (e) {
    /* si una vuelta falla, la próxima lo intenta */
  }
}

// Termina la llamada: cierra el peer, apaga la cámara y quita el overlay.
function endCall(notify) {
  const st = callState;
  callState = null;
  if (st) {
    if (st.pollTimer) clearInterval(st.pollTimer);
    if (notify) sendCallSignal(st.otherId, "hangup", "").catch(() => {});
    try {
      st.pc.close();
    } catch (e) {}
    if (st.localStream) st.localStream.getTracks().forEach((tr) => tr.stop());
  }
  const overlay = document.getElementById("call-overlay");
  if (overlay) overlay.remove();
}

// Polling de llamadas entrantes (se usa en Matches y en el Chat).
function startIncomingCallPolling() {
  stopCallPolling();
  incomingCallTimer = setInterval(checkIncomingCalls, INCOMING_POLL_MS);
  checkIncomingCalls();
}

async function checkIncomingCalls() {
  if (callState) return;
  let data;
  try {
    // GET /api/calls/signals → señales recientes dirigidas a mí
    data = await api("/api/calls/signals");
  } catch (e) {
    return;
  }
  const signals = data.signals || [];

  // Si el que llamaba canceló/colgó, cierra el modal entrante.
  const modal = document.getElementById("incoming-modal");
  if (modal) {
    const fid = Number(modal.dataset.fromId);
    const gone = signals.some(
      (s) => s.fromId === fid && (s.type === "cancel" || s.type === "hangup" || s.type === "reject")
    );
    if (gone) modal.remove();
    return;
  }

  const ring = signals.find((s) => s.type === "ring" && s.payload && !seenRings.has(s.id));
  if (ring) {
    seenRings.add(ring.id);
    showIncomingModal(ring);
  }
}

function showIncomingModal(signal) {
  if (document.getElementById("incoming-modal") || callState) return;
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "incoming-modal";
  overlay.dataset.fromId = String(signal.fromId);
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-heart" aria-hidden="true">📹</div>
      <h2>${esc(t("call_incoming").replace("{name}", signal.fromName || ""))}</h2>
      <button class="btn btn-primary" id="inc-accept">${t("call_accept")}</button>
      <button class="btn btn-ghost" id="inc-reject">${t("call_reject")}</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#inc-accept").addEventListener("click", () => {
    overlay.remove();
    acceptCall(signal);
  });
  overlay.querySelector("#inc-reject").addEventListener("click", () => {
    overlay.remove();
    rejectCall(signal);
  });
}

/* ----- #/perfil ----- */
const LANG_OPTIONS = ["es", "en", "pt", "fr", "other"]; // códigos de idioma
const GENDERS = ["man", "woman", "nonbinary", "unspecified"];
const LOOKINGS = ["friendship", "dating", "casual", "unsure"];

async function renderProfile() {
  app.innerHTML = `<section><h2>${t("profile_title")}</h2><div class="skel skel-card" style="height:280px" aria-hidden="true"></div></section>`;

  // Regreso de Stripe tras el Boost: ?boost=exito o ?boost=cancelado.
  const boostEstado = (location.hash.split("?")[1] || "").includes("boost=exito")
    ? "exito"
    : (location.hash.split("?")[1] || "").includes("boost=cancelado")
      ? "cancelado"
      : null;

  let profile = {};
  try {
    // GET /api/profile → {profile:{bio,gender,lookingFor,languages[],interests[],town,photos:[{id,url,position}]}}
    profile = (await api("/api/profile")).profile || {};
  } catch (err) {
    app.innerHTML = errorHtml(err);
    return;
  }

  // Forzar el estado de facturación si vengo de Stripe (el boost pudo activarse).
  const billing = await billingStatus(boostEstado === "exito");

  if (boostEstado === "exito") {
    toast(t("boost_success"));
    history.replaceState(null, "", "#/perfil"); // limpia el query
  } else if (boostEstado === "cancelado") {
    toast(t("boost_cancelled"));
    history.replaceState(null, "", "#/perfil");
  }

  const boostHtml = billing.stripeConfigured
    ? `<div class="boost-card">
        <p class="muted">${t("boost_desc")}</p>
        ${billing.boostActive && billing.boostUntil
          ? `<p><strong>${esc(t("boost_active").replace("{time}", new Date(billing.boostUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })))}</strong></p>`
          : `<button class="btn btn-primary" id="btn-boost">${t("boost_button")}</button>`}
      </div>`
    : "";

  // Tarjeta de verificación: badge si ya está verificado, o subir selfie.
  const verifyHtml = `
    <div class="card verify-card">
      <h3>✅ ${t("verify_title")}</h3>
      ${profile.isVerified
        ? `<p class="verify-ok">✅ ${t("verify_done")}</p>`
        : `<p class="muted">${t("verify_desc")}</p>
           <div class="verify-row">
             <input type="file" id="selfie-input" accept="image/*">
             <button class="btn btn-primary" id="btn-verify">${t("verify_cta")}</button>
           </div>`}
    </div>`;

  // Modo invisible (solo Premium): no deja rastro en los perfiles que visitas.
  const invisibleHtml = billing.isPremium
    ? `<div class="card invisible-card">
        <h3>🥷 ${t("invisible_title")}</h3>
        <p class="muted">${t("invisible_desc")}</p>
        <label class="switch-row">
          <input type="checkbox" id="invisible-toggle"${profile.invisibleMode ? " checked" : ""}>
          <span>${t("invisible_toggle")}</span>
        </label>
      </div>`
    : `<a class="admirers-locked" href="#/premium">
        <span class="admirers-count">🥷</span>
        <span>${t("invisible_locked")}</span>
        <span class="chev" aria-hidden="true">›</span>
      </a>`;

  const langs = profile.languages || [];
  const interests = (profile.interests || []).join(", ");
  const photos = profile.photos || [];

  app.innerHTML = `
    <section class="profile">
      <h2>${t("profile_title")}</h2>
      ${boostHtml}
      ${verifyHtml}
      ${invisibleHtml}
      <div class="card referral-card" id="referral-card">
        <h3>${t("referral_title")}</h3>
        <p class="muted">${t("common_loading")}</p>
      </div>

      <div class="card install-card" id="install-card" hidden>
        <h3>${t("pwa_install_title")}</h3>
        <p class="muted">${t("pwa_install_desc")}</p>
        <button class="btn btn-primary" id="install-app-btn">${t("pwa_install_btn")}</button>
        <p class="muted small install-help" id="install-help" hidden></p>
      </div>

      <div class="card" id="achievements-card">
        <h3>🏆 ${t("achievements_title")}</h3>
        <p class="muted">${t("common_loading")}</p>
      </div>

      <p class="field-label">${t("profile_photos")}</p>
      <div class="photo-grid" id="photo-grid"></div>
      ${photos.length < MAX_PHOTOS
        ? `<label class="btn btn-ghost" for="photo-input">📷 ${t("profile_addPhoto")}
             <input type="file" id="photo-input" accept="image/*" hidden>
           </label>`
        : ""}

      <p class="field-label">🎥 ${t("profile_video")}</p>
      <div id="video-wrap">
        ${profile.videoUrl
          ? `<video class="profile-video" src="${esc(profile.videoUrl)}" controls playsinline></video>
             <div class="video-actions">
               <label class="btn btn-ghost btn-sm" for="video-input">🔄 ${t("profile_videoReplace")}
                 <input type="file" id="video-input" accept="video/*" hidden>
               </label>
               <button class="btn btn-ghost btn-sm danger" id="video-delete">🗑 ${t("profile_videoDelete")}</button>
             </div>`
          : `<label class="btn btn-ghost" for="video-input">🎥 ${t("profile_videoAdd")}
               <input type="file" id="video-input" accept="video/*" hidden>
             </label>
             <p class="muted small">${t("profile_videoHint")}</p>`}
      </div>

      <form id="profile-form">
        <label>${t("profile_bio")}
          <textarea name="bio" rows="4" placeholder="${esc(t("profile_bioPh"))}">${esc(profile.bio || "")}</textarea>
        </label>
        <label>${t("profile_gender")}
          <select name="gender">
            ${GENDERS.map((g) => `<option value="${g}"${profile.gender === g ? " selected" : ""}>${t("gender_" + g)}</option>`).join("")}
          </select>
        </label>
        <label>${t("profile_lookingFor")}
          <select name="lookingFor">
            ${LOOKINGS.map((l) => `<option value="${l}"${profile.lookingFor === l ? " selected" : ""}>${t("looking_" + l)}</option>`).join("")}
          </select>
        </label>
        <fieldset>
          <legend>${t("profile_languages")}</legend>
          <div class="checks">
            ${LANG_OPTIONS.map((c) => `<label class="check"><input type="checkbox" name="lang" value="${c}"${langs.includes(c) ? " checked" : ""}> ${t("lang_" + c)}</label>`).join("")}
          </div>
        </fieldset>
        <label>${t("profile_interests")} <small class="muted">(${t("profile_interestsHint")})</small>
          <input name="interests" value="${esc(interests)}">
        </label>
        <label>${t("profile_town")}
          <input name="town" value="${esc(profile.town || "")}" placeholder="Manchester">
        </label>
        <p class="form-error" id="profile-error" hidden></p>
        <button type="submit" class="btn btn-primary">${t("common_save")}</button>
      </form>
    </section>`;

  paintPhotos(photos);

  // Referidos 🎁 → GET /api/referral {code, link, count, bonusSuperlikes}
  try {
    const ref = await api("/api/referral");
    const card = document.getElementById("referral-card");
    if (card && ref.code) {
      const waUrl = "https://wa.me/?text=" + encodeURIComponent(
        t("referral_shareText") + " " + ref.code + "\n" + ref.link
      );
      card.innerHTML = `
        <h3>${t("referral_title")}</h3>
        <p class="muted">${t("referral_desc")}</p>
        <div class="referral-code-row">
          <span class="muted">${t("referral_code")}:</span>
          <code class="referral-code">${esc(ref.code)}</code>
          <button class="btn btn-sm btn-ghost" id="ref-copy" aria-label="📋">📋</button>
        </div>
        <p class="muted">${esc(t("referral_joined").replace("{n}", ref.count))} · ${esc(t("referral_bonus").replace("{n}", ref.bonusSuperlikes))}</p>
        <a class="btn btn-primary" href="${esc(waUrl)}" target="_blank" rel="noopener">📲 ${t("referral_share")}</a>`;
      document.getElementById("ref-copy").addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(ref.link);
          toast(t("referral_copied"));
        } catch (e) {
          toast(ref.link); // si no hay portapapeles, muestra el enlace
        }
      });
    }
  } catch (e) {
    const card = document.getElementById("referral-card");
    if (card) card.style.display = "none";
  }

  // Logros 🏆 → GET /api/achievements {level, levelName, total, earnedCount, achievements}
  try {
    const ach = await api("/api/achievements");
    const card = document.getElementById("achievements-card");
    if (card) {
      const pct = ach.total ? Math.round((ach.earnedCount / ach.total) * 100) : 0;
      const medallas = (ach.achievements || [])
        .map((a) => `<span class="ach-medal${a.earned ? " earned" : ""}" title="${esc(t("ach_" + a.code))}">
            <span class="ach-emoji" aria-hidden="true">${esc(achEmoji(a.code))}</span>
            <small>${esc(t("ach_" + a.code))}</small>
          </span>`)
        .join("");
      card.innerHTML = `
        <h3>🏆 ${t("achievements_title")}</h3>
        <p><strong>${t(ach.levelName)}</strong> · ${t("achievements_level").replace("{n}", ach.level)}</p>
        <div class="level-bar" aria-hidden="true"><div class="level-fill" style="width:${pct}%"></div></div>
        <p class="muted small">${esc(t("achievements_progress").replace("{a}", ach.earnedCount).replace("{b}", ach.total))}</p>
        <div class="ach-grid">${medallas}</div>`;
    }
  } catch (e) {
    const card = document.getElementById("achievements-card");
    if (card) card.style.display = "none";
  }

  // Instalar app 📲 → tarjeta permanente en el perfil (no depende solo del banner)
  (function setupInstallCard() {
    const card = document.getElementById("install-card");
    const btn = document.getElementById("install-app-btn");
    const help = document.getElementById("install-help");
    if (!card || !btn) return;
    // Si ya está instalada como app, no mostrar la tarjeta
    const isStandalone =
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true;
    if (isStandalone) return; // se queda oculta
    card.hidden = false;
    btn.addEventListener("click", async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        try { await deferredInstallPrompt.userChoice; } catch (_) {}
        deferredInstallPrompt = null;
        if (typeof pwaBanner !== "undefined" && pwaBanner) pwaBanner.hidden = true;
        return;
      }
      // Sin prompt nativo: instrucciones según la plataforma
      const ua = navigator.userAgent || "";
      let key = "pwa_install_manual_desktop";
      if (/iphone|ipad|ipod/i.test(ua)) key = "pwa_install_manual_ios";
      else if (/android/i.test(ua)) key = "pwa_install_manual_android";
      if (help) { help.textContent = t(key); help.hidden = false; }
      else toast(t(key));
    });
  })();

  // Video de presentación 🎥 → POST /api/profile/video (multipart, campo "video", máx. 30 MB)
  const videoInput = document.getElementById("video-input");
  if (videoInput) {
    videoInput.addEventListener("change", async () => {
      if (!videoInput.files.length) return;
      const fd = new FormData();
      fd.append("video", videoInput.files[0]);
      toast(t("profile_videoUploading"));
      try {
        await api("/api/profile/video", { method: "POST", body: fd });
        toast(t("profile_videoDone"));
        renderProfile(); // recarga y muestra el preview
      } catch (err) {
        toast(apiErrorMessage(err));
        videoInput.value = "";
      }
    });
  }
  // DELETE /api/profile/video → borra el video de presentación.
  const videoDel = document.getElementById("video-delete");
  if (videoDel) {
    videoDel.addEventListener("click", async () => {
      videoDel.disabled = true;
      try {
        await api("/api/profile/video", { method: "DELETE" });
        toast(t("profile_videoDeleted"));
        renderProfile();
      } catch (err) {
        toast(apiErrorMessage(err));
        videoDel.disabled = false;
      }
    });
  }

  // Boost → POST /api/billing/boost → {url} (Stripe Checkout, $1.99 pago único)
  const btnBoost = document.getElementById("btn-boost");
  if (btnBoost) {
    btnBoost.addEventListener("click", async () => {
      btnBoost.disabled = true;
      try {
        const data = await api("/api/billing/boost", { method: "POST" });
        location.href = data.url; // Stripe se encarga del pago
      } catch (err) {
        toast(apiErrorMessage(err));
        btnBoost.disabled = false;
      }
    });
  }

  // Guardar → PUT /api/profile {bio,gender,lookingFor,languages[],interests[],town}
  document.getElementById("profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    try {
      await api("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bio: String(fd.get("bio")).trim(),
          gender: fd.get("gender"),
          lookingFor: fd.get("lookingFor"),
          languages: fd.getAll("lang"),
          interests: String(fd.get("interests")).split(",").map((s) => s.trim()).filter(Boolean),
          town: String(fd.get("town")).trim(),
        }),
      });
      toast(t("profile_saved"));
    } catch (err) {
      showFormError("profile-error", err);
    } finally {
      btn.disabled = false;
    }
  });

  // Subir foto → POST /api/profile/photos (multipart, campo "photo")
  const input = document.getElementById("photo-input");
  if (input) {
    input.addEventListener("change", async () => {
      if (!input.files.length) return;
      const fd = new FormData();
      fd.append("photo", input.files[0]); // el campo se llama "photo"
      toast(t("profile_uploading"));
      try {
        const data = await api("/api/profile/photos", { method: "POST", body: fd });
        // El backend devuelve {photos} actualizado; redibujamos.
        profile.photos = data.photos || [];
        renderProfile();
      } catch (err) {
        toast(apiErrorMessage(err)); // ej. TOO_MANY_PHOTOS
      }
    });
  }

  // Modo invisible → POST /api/profile/invisible {enabled} (solo Premium)
  const invToggle = document.getElementById("invisible-toggle");
  if (invToggle) {
    invToggle.addEventListener("change", async () => {
      try {
        await api("/api/profile/invisible", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: invToggle.checked }),
        });
        toast(t(invToggle.checked ? "invisible_on" : "invisible_off"));
      } catch (err) {
        toast(apiErrorMessage(err));
        invToggle.checked = !invToggle.checked; // revierte si falló
      }
    });
  }

// setupVerifyUpload(onVerified): conecta el input #selfie-input + botón
// #btn-verify con POST /api/verification/request (multipart, campo "selfie").
// onVerified() se llama cuando la verificación tiene éxito.
function setupVerifyUpload(onVerified) {
  const verifyBtn = document.getElementById("btn-verify");
  if (!verifyBtn) return;
  verifyBtn.addEventListener("click", async () => {
    const selfieInput = document.getElementById("selfie-input");
    if (!selfieInput.files.length) {
      toast(t("verify_pickPhoto"));
      return;
    }
    const fd = new FormData();
    fd.append("selfie", selfieInput.files[0]);
    verifyBtn.disabled = true;
    toast(t("verify_uploading"));
    try {
      const res = await api("/api/verification/request", { method: "POST", body: fd });
      toast(t("verify_done"));
      celebrateAchievements(res.newAchievements); // 🏆 "Perfil verificado"
      onVerified();
    } catch (err) {
      toast(apiErrorMessage(err)); // ej. SELFIE_SAME_AS_PHOTO
      verifyBtn.disabled = false;
    }
  });
}

// renderVerifyGate(): pantalla obligatoria para usuarios sin verificar.
// Bloquea Descubrir y Matches hasta completar la selfie de verificación.
async function renderVerifyGate() {
  app.innerHTML = `
    <section class="verify-gate">
      <div class="card verify-gate-card">
        <div class="verify-gate-emoji">🛡️</div>
        <h2>${t("verify_gate_title")}</h2>
        <p class="muted">${t("verify_gate_desc")}</p>
        <div class="verify-row">
          <input type="file" id="selfie-input" accept="image/*" capture="user">
          <button class="btn btn-primary" id="btn-verify">${t("verify_cta")}</button>
        </div>
        <p class="muted small">${t("verify_gate_note")}</p>
      </div>
    </section>`;
  // Al verificar, redibuja la vista actual (ya desbloqueada).
  setupVerifyUpload(() => route());
}

// Verificación → usa el flujo compartido (input #selfie-input + #btn-verify).
  setupVerifyUpload(() => renderProfile());
}

// Dibuja las fotos con su botón de borrar.
function paintPhotos(photos) {
  const grid = document.getElementById("photo-grid");
  if (!grid) return;
  grid.innerHTML = photos
    .map(
      (p) => `<figure class="photo-thumb">
        <img src="${esc(p.url)}" alt="">
        <button class="photo-del" data-id="${esc(p.id)}" aria-label="${t("common_delete")}">✕</button>
      </figure>`
    )
    .join("");
  grid.querySelectorAll(".photo-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm(t("profile_deletePhotoConfirm"))) return;
      try {
        // DELETE /api/profile/photos/:id → {ok:true}
        await api("/api/profile/photos/" + encodeURIComponent(btn.getAttribute("data-id")), {
          method: "DELETE",
        });
        renderProfile();
      } catch (err) {
        toast(apiErrorMessage(err));
      }
    });
  });
}

/* ----- #/eventos ----- */
async function renderEvents() {
  app.innerHTML = `<section class="events"><h2>🎉 ${t("events_title")}</h2><p class="muted">${t("common_loading")}</p></section>`;

  let eventos = [];
  try {
    // GET /api/events → {events:[{id,title,description,place,town,eventDate,attendeeCount,rsvp}]}
    eventos = ((await api("/api/events")).events) || [];
  } catch (err) {
    app.innerHTML = errorHtml(err);
    return;
  }

  const fmtFecha = (iso) => {
    try {
      return new Date(iso).toLocaleString(lang === "es" ? "es-DO" : "en-US", {
        weekday: "short", day: "numeric", month: "short",
        hour: "2-digit", minute: "2-digit",
      });
    } catch (e) {
      return iso;
    }
  };

  const tarjetas = eventos.length
    ? eventos.map((e) => `
      <article class="card event-card">
        <div class="card-body">
          <h3>${esc(e.title)}</h3>
          <p class="muted">📅 ${esc(fmtFecha(e.eventDate))}</p>
          ${(e.place || e.town) ? `<p class="muted">📍 ${esc([e.place, e.town].filter(Boolean).join(" · "))}</p>` : ""}
          ${e.description ? `<p class="bio">${esc(e.description)}</p>` : ""}
          <p class="muted">👥 ${esc(String(e.attendeeCount))} ${t("events_attendees")}</p>
          <button class="btn ${e.rsvp ? "btn-pass" : "btn-primary"} btn-sm" data-rsvp="${esc(e.id)}">
            ${e.rsvp ? "✓ " + t("events_rsvp_on") : t("events_rsvp")}
          </button>
        </div>
      </article>`).join("")
    : `<div class="empty">${t("events_empty")}</div>`;

  app.innerHTML = `
    <section class="events">
      <h2>🎉 ${t("events_title")}</h2>
      <button class="btn btn-primary" id="ev-toggle">＋ ${t("events_new")}</button>
      <form id="ev-form" class="card event-form" hidden>
        <label>${t("events_title_label")}
          <input name="title" maxlength="80" required>
        </label>
        <label>${t("events_desc_label")}
          <textarea name="description" rows="3" maxlength="500"></textarea>
        </label>
        <label>${t("events_place_label")}
          <input name="place" maxlength="120">
        </label>
        <label>${t("events_town_label")}
          <input name="town" maxlength="60" placeholder="Manchester">
        </label>
        <label>${t("events_date_label")}
          <input type="datetime-local" name="eventDate" required>
        </label>
        <button type="submit" class="btn btn-primary">${t("events_create")}</button>
      </form>
      <div id="ev-list">${tarjetas}</div>
    </section>`;

  // Mostrar/ocultar el formulario.
  document.getElementById("ev-toggle").addEventListener("click", () => {
    const f = document.getElementById("ev-form");
    f.hidden = !f.hidden;
  });

  // Crear evento → POST /api/events
  document.getElementById("ev-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      await api("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: String(fd.get("title") || ""),
          description: String(fd.get("description") || ""),
          place: String(fd.get("place") || ""),
          town: String(fd.get("town") || ""),
          eventDate: new Date(String(fd.get("eventDate") || "")).toISOString(),
        }),
      });
      toast(t("events_created"));
      renderEvents();
    } catch (err) {
      toast(apiErrorMessage(err));
      btn.disabled = false;
    }
  });

  // "Voy ✅" → POST /api/events/:id/rsvp (toggle)
  app.querySelectorAll("[data-rsvp]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const res = await api("/api/events/" + encodeURIComponent(btn.getAttribute("data-rsvp")) + "/rsvp", {
          method: "POST",
        });
        celebrateAchievements(res.newAchievements); // 🏆 "Vida social" al 3er RSVP
        renderEvents();
      } catch (err) {
        toast(apiErrorMessage(err));
        btn.disabled = false;
      }
    });
  });
}

/* ----- #/mapa ----- */
// Carga Leaflet desde el CDN solo cuando se abre el mapa (no pesa al inicio).
function cargarLeaflet() {
  if (window.L) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    js.onload = () => resolve();
    js.onerror = () => reject(new Error("LEAFLET_FAIL"));
    document.head.appendChild(js);
  });
}

// Mapa de solteros: solo CONTEOS por zona (nunca identidades).
// Respeta el modo invisible (el backend excluye a esos usuarios).
async function renderMap() {
  app.innerHTML = `
    <section class="mapview">
      <h2>🗺️ ${t("map_title")}</h2>
      <p class="muted">${t("map_desc")}</p>
      <div id="map" class="map-box"><div class="skel" style="height:100%;min-height:320px" aria-hidden="true"></div></div>
    </section>`;

  let singles = [];
  try {
    // GET /api/map/singles → [{zip, town, lat, lng, count}]
    singles = (await api("/api/map/singles")).singles || [];
  } catch (err) {
    app.innerHTML = errorHtml(err);
    return;
  }

  try {
    await cargarLeaflet();
  } catch (e) {
    document.getElementById("map").innerHTML =
      `<p class="muted center">${t("map_fail")}</p>`;
    return;
  }

  const box = document.getElementById("map");
  if (!box) return;
  box.innerHTML = ""; // quita el skeleton
  const mapa = window.L.map("map").setView([43.65, -71.55], 8); // centro de NH
  window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mapa);

  if (!singles.length) {
    window.L.popup()
      .setLatLng([43.65, -71.55])
      .setContent(t("map_empty"))
      .openOn(mapa);
    return;
  }
  for (const s of singles) {
    const icono = window.L.divIcon({
      className: "map-pin",
      html: `<span><b>${s.count}</b></span>`,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    });
    window.L.marker([s.lat, s.lng], { icon: icono })
      .addTo(mapa)
      .bindPopup(
        `<b>${t("map_popup").replace("{n}", s.count).replace("{town}", esc(s.town || s.zip))}</b>`
      );
  }
}

/* ----- #/ajustes ----- */
/* ----- Notificaciones push (Web Push) ----- */
// ¿El navegador soporta push? (iOS lo soporta solo si la app está instalada).
function pushSoportado() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function claveVapidABytes(base64) {
  const normal = base64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(normal);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Activa el push: pide permiso, se suscribe y guarda la suscripción en el backend.
async function activarPush() {
  // GET /api/push/vapid-public-key → {publicKey} (pública por diseño)
  const { publicKey } = await api("/api/push/vapid-public-key");
  if (!publicKey) {
    toast(t("push_notConfigured"));
    return false;
  }
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") {
    toast(t("push_denied"));
    return false;
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: claveVapidABytes(publicKey),
  });
  // POST /api/push/subscribe {subscription, lang}
  await api("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON(), lang }),
  });
  return true;
}

// Desactiva el push: borra la suscripción del backend y del navegador.
async function desactivarPush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      try {
        await api("/api/push/unsubscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      } catch (e) {
        /* seguimos: lo importante es desuscribir el navegador */
      }
      await sub.unsubscribe();
    }
  } catch (e) {
    /* nada */
  }
  return true;
}

// Pinta la fila de push en Ajustes con el estado real del navegador.
async function pintarFilaPush() {
  const row = document.getElementById("push-row");
  if (!row) return;
  if (!pushSoportado()) {
    row.innerHTML = `<span>🔔 ${t("push_title")}</span><span class="muted small">${t("push_unsupported")}</span>`;
    return;
  }
  let activa = false;
  try {
    const reg = await navigator.serviceWorker.ready;
    activa = !!(await reg.pushManager.getSubscription());
  } catch (e) {
    /* se muestra apagado */
  }
  row.innerHTML = `
    <span>🔔 ${t("push_title")}</span>
    <label class="switch-row">
      <input type="checkbox" id="push-toggle"${activa ? " checked" : ""}>
      <span>${t(activa ? "push_on" : "push_off")}</span>
    </label>`;
  const toggle = document.getElementById("push-toggle");
  toggle.addEventListener("change", async () => {
    toggle.disabled = true;
    try {
      const ok = toggle.checked ? await activarPush() : await desactivarPush();
      if (!ok && toggle.checked) toggle.checked = false;
      if (ok) toast(t(toggle.checked ? "push_enabled" : "push_disabled"));
    } catch (err) {
      toggle.checked = !toggle.checked;
      toast(apiErrorMessage(err));
    } finally {
      toggle.disabled = false;
    }
  });
}

async function renderSettings() {
  app.innerHTML = `
    <section class="settings">
      <h2>${t("settings_title")}</h2>

      <div class="setting-row">
        <span>🌐 ${t("settings_language")}</span>
        <div class="seg">
          <button class="btn btn-sm ${lang === "es" ? "btn-primary" : "btn-ghost"}" data-lang="es">ES</button>
          <button class="btn btn-sm ${lang === "en" ? "btn-primary" : "btn-ghost"}" data-lang="en">EN</button>
        </div>
      </div>

      <div class="setting-row" id="premium-row"><span>👑 Premium</span><span class="muted">${t("common_loading")}</span></div>

      <div class="setting-row" id="push-row"><span>🔔 ${t("push_title")}</span><span class="muted">${t("common_loading")}</span></div>

      <div class="setting-block">
        <h3>⛔ ${t("settings_blocked")}</h3>
        <ul class="block-list" id="block-list"><li class="muted">${t("common_loading")}</li></ul>
      </div>

      <div class="setting-block links">
        <a href="/terminos">📄 ${t("settings_terms")}</a>
        <a href="/privacidad">🔒 ${t("settings_privacy")}</a>
      </div>

      <button class="btn btn-ghost" id="btn-logout">🚪 ${t("settings_logout")}</button>

      <div class="danger-zone">
        <button class="btn btn-danger" id="btn-delete">⚠️ ${t("settings_delete")}</button>
      </div>

      <p class="muted center version">${t("settings_version")}</p>
    </section>`;

  // Toggle de idioma ES/EN (se guarda en localStorage "citasnh-lang").
  app.querySelectorAll("[data-lang]").forEach((b) => {
    b.addEventListener("click", () => setLang(b.getAttribute("data-lang")));
  });

  // Fila premium: estado y acceso rápido.
  try {
    const billing = await billingStatus();
    const row = document.getElementById("premium-row");
    if (row) {
      row.innerHTML = billing.isPremium
        ? `<span>👑 ${t("premium_activeShort")}</span><a class="btn btn-sm btn-ghost" href="#/premium">${t("premium_manage")}</a>`
        : `<span>👑 Premium</span><a class="btn btn-sm btn-primary" href="#/premium">${t("premium_ctaShort")}</a>`;
    }
  } catch (err) {
    /* sin premium no pasa nada */
  }

  // Fila de notificaciones push: toggle que pide permiso y suscribe el dispositivo.
  await pintarFilaPush();

  // Bloqueados → GET /api/blocks → {blocks:[{userId,displayName}]}
  try {
    const data = await api("/api/blocks");
    const list = document.getElementById("block-list");
    const blocks = data.blocks || [];
    list.innerHTML = blocks.length
      ? blocks
          .map(
            (b) => `<li><span>${esc(b.displayName)}</span>
              <button class="btn btn-sm btn-ghost" data-unblock="${esc(b.userId)}">${t("settings_unblock")}</button></li>`
          )
          .join("")
      : `<li class="muted">${t("settings_blockedEmpty")}</li>`;
    list.querySelectorAll("[data-unblock]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm(t("settings_unblockConfirm"))) return;
        try {
          // DELETE /api/blocks/:targetUserId → {ok}
          await api("/api/blocks/" + encodeURIComponent(btn.getAttribute("data-unblock")), {
            method: "DELETE",
          });
          renderSettings();
        } catch (err) {
          toast(apiErrorMessage(err));
        }
      });
    });
  } catch (err) {
    const list = document.getElementById("block-list");
    if (list) list.innerHTML = `<li class="muted">${esc(apiErrorMessage(err))}</li>`;
  }

  // Cerrar sesión: borra el JWT y vuelve al login.
  document.getElementById("btn-logout").addEventListener("click", () => {
    if (!confirm(t("settings_logoutConfirm"))) return;
    localStorage.removeItem(LS_TOKEN);
    location.hash = "#/login";
  });

  // Borrar cuenta: DOBLE confirmación → 1) diálogo, 2) escribir la palabra.
  document.getElementById("btn-delete").addEventListener("click", async () => {
    if (!confirm(t("settings_deleteWarning"))) return; // 1ª confirmación
    const word = prompt(t("settings_deletePrompt") + " " + t("settings_deleteWord"));
    if (word === null) return; // canceló el prompt
    // 2ª confirmación: la palabra escrita debe coincidir (sin importar mayúsculas).
    if (word.trim().toUpperCase() !== t("settings_deleteWord").toUpperCase()) {
      toast(t("settings_deleteWrong"));
      return;
    }
    try {
      // DELETE /api/auth/account → {ok:true}
      await api("/api/auth/account", { method: "DELETE" });
      localStorage.removeItem(LS_TOKEN);
      toast(t("settings_deleteDone"));
      location.hash = "#/login";
    } catch (err) {
      toast(apiErrorMessage(err));
    }
  });
}

/* ---------- 6. Arranque ---------- */
document.documentElement.lang = lang;
applyI18n(); // traduce el HTML estático al idioma guardado
route();     // dibuja la vista según el hash (o redirige a #/login)

// Registra el service worker (PWA) solo si el navegador lo soporta.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* si falla, la app sigue funcionando sin modo offline */
    });
  });
}

// Banner "Instalar app" (PWA): solo aparece si el navegador lo permite.
// El evento beforeinstallprompt solo existe en navegadores compatibles
// (Chrome/Edge en Android y escritorio); en iPhone el banner no sale y la
// instalación se hace manual desde Compartir > "Añadir a pantalla de inicio".
let deferredInstallPrompt = null;
const pwaBanner = document.getElementById("pwa-install-banner");
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); // no mostramos el mini-infobar del navegador
  deferredInstallPrompt = e;
  if (pwaBanner) pwaBanner.hidden = false;
});
document.getElementById("pwa-install-btn")?.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  try {
    await deferredInstallPrompt.userChoice;
  } catch (_) {
    /* el usuario cerró el diálogo */
  }
  deferredInstallPrompt = null;
  if (pwaBanner) pwaBanner.hidden = true;
});
document.getElementById("pwa-install-later")?.addEventListener("click", () => {
  if (pwaBanner) pwaBanner.hidden = true;
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  if (pwaBanner) pwaBanner.hidden = true;
});
