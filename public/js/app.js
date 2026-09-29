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

// vBadge(): badge ✅ de perfil verificado.
function vBadge(isV) {
  return isV ? '<span class="verif-badge" title="✅">✅</span>' : "";
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

/* ---------- 4. Router ---------- */
const app = document.getElementById("app");
const bottomnav = document.getElementById("bottomnav");
let chatTimer = null; // temporizador del polling del chat
const cache = { matches: [] }; // guarda matches para el chat (reportar/bloquear)

function stopChatPolling() {
  if (chatTimer) {
    clearInterval(chatTimer);
    chatTimer = null;
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
      location.hash = "#/descubrir";
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
  app.innerHTML = `<section class="discover"><h2>${t("discover_title")}</h2><p class="muted">${t("common_loading")}</p></section>`;

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

  app.innerHTML = `
    <section class="discover">
      ${upsell}
      <h2>${t("discover_title")}</h2>
      ${storiesBarHtml}
      ${filtrosHtml}
      ${toppicksHtml}
      <article class="card">
        ${photo
          ? `<img class="card-photo" id="card-photo" src="${esc(photo)}" alt="">`
          : `<div class="card-photo placeholder" aria-hidden="true">❤</div>`}
        <div class="card-body">
          <h3>${esc(card.displayName)}, ${esc(card.age)} ${vBadge(card.isVerified)} ${boostTxt}</h3>
          <p class="muted">${esc(card.town || "")}</p>
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
  // Tocar la foto abre el perfil completo (y registra la visita).
  const cardPhoto = document.getElementById("card-photo");
  if (cardPhoto) {
    cardPhoto.addEventListener("click", () => openProfileViewer(card.userId));
  }

  const vote = async (v, isSuper) => {
    try {
      // POST /api/votes {targetUserId, vote:"like"|"pass", super?} → {ok, match, matchId?, super?}
      const res = await api("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: card.userId, vote: v, super: !!isSuper }),
      });
      if (res.match) {
        showMatchModal(card.displayName, res.matchId, !!res.super); // ¡match! aviso celebratorio
      } else {
        renderDiscover(); // siguiente tarjeta
      }
    } catch (err) {
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
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-heart" aria-hidden="true">💘</div>
      ${wasSuper ? `<p class="super-badge">${t("superlike_badge")}</p>` : ""}
      <h2>${t("match_title")}</h2>
      <p>${t("match_subtitle", { name: esc(name) })}</p>
      <button class="btn btn-primary" id="m-chat">${t("match_chat")}</button>
      <button class="btn btn-ghost" id="m-keep">${t("match_keep")}</button>
    </div>`;
  document.body.appendChild(overlay);
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
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal profile-viewer" role="dialog" aria-modal="true">
      <div class="viewer-photos">${photosHtml || `<div class="card-photo placeholder" aria-hidden="true">❤</div>`}</div>
      <h2>${esc(p.displayName)}, ${esc(p.age)} ${vBadge(p.isVerified)}</h2>
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
  app.innerHTML = `<section><h2>${t("matches_title")}</h2><p class="muted">${t("common_loading")}</p></section>`;

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
        <strong class="chat-name">${esc(other.displayName || "")} ${vBadge(other.isVerified)}</strong>
        <button class="btn btn-ghost btn-sm" id="chat-call" title="${esc(t("call_video"))}" aria-label="${esc(t("call_video"))}">📹</button>
        <button class="btn btn-ghost btn-sm" id="chat-gift" title="${esc(t("gift_title"))}" aria-label="${esc(t("gift_title"))}">🎁</button>
        <button class="btn btn-ghost btn-sm" id="chat-report">🚩 ${t("chat_report")}</button>
        <button class="btn btn-ghost btn-sm danger" id="chat-block">⛔ ${t("chat_block")}</button>
      </div>
      <div class="messages" id="messages"><p class="muted center">${t("common_loading")}</p></div>
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

  // Dibuja mensajes. El texto usa textContent (no innerHTML) para que nadie
  // pueda inyectar HTML malicioso en el chat.
  // Tipos: 'text' → burbuja normal; 'voice' → reproductor de audio;
  // 'gift' → tarjeta animada del regalo.
  // Cada mensaje lleva su fila de reacciones (❤️ 😂 🔥 😮 😢 👍).
  const appendMsgs = (msgs) => {
    msgs.forEach((m) => {
      const div = document.createElement("div");
      div.className = "msg" + (myId && String(m.senderId) === String(myId) ? " mine" : "");
      const tipo = m.type || "text";
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
      } else {
        div.textContent = m.text;
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
      const { message } = await api("/api/chat/" + encodeURIComponent(matchId) + "/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      appendMsgs([message]);
      lastId = message.id;
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
            const { message } = await api(
              "/api/chat/" + encodeURIComponent(matchId) + "/voice",
              { method: "POST", body: fd }
            );
            appendMsgs([message]);
            lastId = message.id;
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
  app.innerHTML = `<section><h2>${t("profile_title")}</h2><p class="muted">${t("common_loading")}</p></section>`;

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

      <p class="field-label">${t("profile_photos")}</p>
      <div class="photo-grid" id="photo-grid"></div>
      ${photos.length < MAX_PHOTOS
        ? `<label class="btn btn-ghost" for="photo-input">📷 ${t("profile_addPhoto")}
             <input type="file" id="photo-input" accept="image/*" hidden>
           </label>`
        : ""}

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

  // Verificación → POST /api/verification/request (multipart, campo "selfie")
  const verifyBtn = document.getElementById("btn-verify");
  if (verifyBtn) {
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
        await api("/api/verification/request", { method: "POST", body: fd });
        toast(t("verify_done"));
        renderProfile();
      } catch (err) {
        toast(apiErrorMessage(err)); // ej. SELFIE_SAME_AS_PHOTO
        verifyBtn.disabled = false;
      }
    });
  }
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
        await api("/api/events/" + encodeURIComponent(btn.getAttribute("data-rsvp")) + "/rsvp", {
          method: "POST",
        });
        renderEvents();
      } catch (err) {
        toast(apiErrorMessage(err));
        btn.disabled = false;
      }
    });
  });
}

/* ----- #/ajustes ----- */
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
