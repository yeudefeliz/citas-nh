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
     POST /api/profile/photos  DELETE /api/profile/photos/:id
     GET  /api/discover        POST /api/votes
     GET  /api/matches
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
}

// route(): lee location.hash y dibuja la vista que toca.
function route() {
  stopChatPolling(); // al cambiar de vista se apaga el polling del chat

  const hash = location.hash || "#/descubrir";
  const logged = !!getToken();
  bottomnav.hidden = !logged; // la barra inferior solo con sesión

  // REGLA: sin token, siempre al login.
  if (!logged && hash !== "#/login" && hash !== "#/registro") {
    location.hash = "#/login";
    return;
  }
  // Con token no tiene sentido ver login/registro.
  if (logged && (hash === "#/login" || hash === "#/registro")) {
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
  app.innerHTML = `
    <section class="auth">
      <div class="auth-card">
        <div class="auth-heart" aria-hidden="true">❤</div>
        <h2>${t("register_title")}</h2>
        <p class="muted center">${t("register_adultsOnly")}</p>
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
      // POST /api/auth/register {email,password,displayName,dob,zip} → 201 {token,user}
      const data = await api("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(fd.get("email")).trim(),
          password: fd.get("password"),
          displayName: String(fd.get("displayName")).trim(),
          dob: fd.get("dob"),
          zip: String(fd.get("zip")).trim(),
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
async function renderDiscover() {
  app.innerHTML = `<section class="discover"><h2>${t("discover_title")}</h2><p class="muted">${t("common_loading")}</p></section>`;

  let card = null;
  try {
    // GET /api/discover → {card:{userId,displayName,age,town,bio,gender,lookingFor,languages,interests,photos[]} | null}
    const data = await api("/api/discover");
    card = data.card;
  } catch (err) {
    app.innerHTML = errorHtml(err);
    return;
  }

  // Sin más tarjetas: mensaje amable.
  if (!card) {
    app.innerHTML = `<section class="discover"><h2>${t("discover_title")}</h2><div class="empty">${t("discover_empty")}</div></section>`;
    return;
  }

  const photo = card.photos && card.photos[0];
  const langs = (card.languages || []).map(esc).join(" · ");
  const interests = (card.interests || [])
    .map((i) => `<span class="tag">${esc(i)}</span>`)
    .join("");

  // Banner premium solo si Stripe está configurado y no soy premium.
  const billing = await billingStatus();
  const upsell = !billing.isPremium && billing.stripeConfigured
    ? `<a class="premium-banner" href="#/premium">👑 ${t("premium_banner")}</a>`
    : "";

  app.innerHTML = `
    <section class="discover">
      ${upsell}
      <article class="card">
        ${photo
          ? `<img class="card-photo" src="${esc(photo)}" alt="">`
          : `<div class="card-photo placeholder" aria-hidden="true">❤</div>`}
        <div class="card-body">
          <h3>${esc(card.displayName)}, ${esc(card.age)}</h3>
          <p class="muted">${esc(card.town || "")}</p>
          ${card.bio ? `<p class="bio">${esc(card.bio)}</p>` : ""}
          ${langs ? `<p class="muted">🗣 ${langs}</p>` : ""}
          ${interests ? `<p class="interests-label">${t("discover_interests")}</p><div class="tags">${interests}</div>` : ""}
        </div>
      </article>
      <div class="vote-row">
        <button id="btn-pass" class="btn btn-pass">✕<span>${t("discover_pass")}</span></button>
        <button id="btn-like" class="btn btn-like">❤<span>${t("discover_like")}</span></button>
      </div>
    </section>`;

  const vote = async (v) => {
    try {
      // POST /api/votes {targetUserId, vote:"like"|"pass"} → {ok, match, matchId?}
      const res = await api("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: card.userId, vote: v }),
      });
      if (res.match) {
        showMatchModal(card.displayName, res.matchId); // ¡match! aviso celebratorio
      } else {
        renderDiscover(); // siguiente tarjeta
      }
    } catch (err) {
      // Límite diario de likes → invitar al premium en vez de un toast seco.
      if (err && err.code === "LIKE_LIMIT_REACHED") {
        showPremiumModal();
        return;
      }
      toast(apiErrorMessage(err));
    }
  };
  document.getElementById("btn-pass").addEventListener("click", () => vote("pass"));
  document.getElementById("btn-like").addEventListener("click", () => vote("like"));
}

// Modal celebratorio cuando hay match.
function showMatchModal(name, matchId) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-heart" aria-hidden="true">💘</div>
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

/* ----- #/matches ----- */
async function renderMatches() {
  app.innerHTML = `<section><h2>${t("matches_title")}</h2><p class="muted">${t("common_loading")}</p></section>`;

  let admirers = { locked: true, count: 0 };
  try {
    // GET /api/matches → {matches:[{matchId, user:{...}, createdAt, lastMessage}]}
    const data = await api("/api/matches");
    cache.matches = data.matches || [];
    // GET /api/admirers → {locked:true,count} o {locked:false,admirers:[...]}
    admirers = await api("/api/admirers");
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
            ${photo
              ? `<img src="${esc(photo)}" alt="">`
              : `<span class="avatar-fallback" aria-hidden="true">❤</span>`}
            <span class="match-info">
              <strong>${esc(a.displayName)}, ${esc(a.age)}</strong>
              <small class="muted">${esc(a.town || "")}</small>
            </span>
            <button class="btn btn-sm btn-primary" data-like-back="${esc(a.userId)}">❤</button>
          </div></li>`;
        })
        .join("") +
      `</ul>`;
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
              <strong>${esc(u.displayName)}, ${esc(u.age)}</strong>
              <small class="muted">${esc(m.lastMessage || u.town || "")}</small>
            </span>
            <span class="chev" aria-hidden="true">›</span>
          </a></li>`;
        })
        .join("") +
      `</ul>`
    : `<div class="empty">${t("matches_empty")}</div>`;

  app.innerHTML = `<section><h2>${t("matches_title")}</h2>${admirersHtml}${listHtml}</section>`;

  // Botones "devolver like" en la lista de admiradores.
  app.querySelectorAll("[data-like-back]").forEach((btn) => {
    btn.addEventListener("click", async () => {
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
        <strong class="chat-name">${esc(other.displayName || "")}</strong>
        <button class="btn btn-ghost btn-sm" id="chat-report">🚩 ${t("chat_report")}</button>
        <button class="btn btn-ghost btn-sm danger" id="chat-block">⛔ ${t("chat_block")}</button>
      </div>
      <div class="messages" id="messages"><p class="muted center">${t("common_loading")}</p></div>
      <form class="chat-input" id="chat-form">
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

  // Dibuja mensajes. Usa textContent (no innerHTML) para que nadie
  // pueda inyectar HTML malicioso en el chat.
  const appendMsgs = (msgs) => {
    msgs.forEach((m) => {
      const div = document.createElement("div");
      div.className = "msg" + (myId && String(m.senderId) === String(myId) ? " mine" : "");
      div.textContent = m.text;
      box.appendChild(div);
    });
    box.scrollTop = box.scrollHeight; // baja hasta el último mensaje
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
      box.innerHTML = `<p class="muted center">${t("chat_empty")}</p>`;
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

/* ----- #/perfil ----- */
const LANG_OPTIONS = ["es", "en", "pt", "fr", "other"]; // códigos de idioma
const GENDERS = ["man", "woman", "nonbinary", "unspecified"];
const LOOKINGS = ["friendship", "dating", "casual", "unsure"];

async function renderProfile() {
  app.innerHTML = `<section><h2>${t("profile_title")}</h2><p class="muted">${t("common_loading")}</p></section>`;

  let profile = {};
  try {
    // GET /api/profile → {profile:{bio,gender,lookingFor,languages[],interests[],town,photos:[{id,url,position}]}}
    profile = (await api("/api/profile")).profile || {};
  } catch (err) {
    app.innerHTML = errorHtml(err);
    return;
  }

  const langs = profile.languages || [];
  const interests = (profile.interests || []).join(", ");
  const photos = profile.photos || [];

  app.innerHTML = `
    <section class="profile">
      <h2>${t("profile_title")}</h2>

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
