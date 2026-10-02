/* ============================================================
   Citas NH — Admin: lógica de la página (100% independiente)
   ------------------------------------------------------------
   NO depende de public/js/app.js ni del i18n principal.
   Diccionario propio es/en con toggle en el header.
   ============================================================ */
"use strict";

/* ---------- 1. Idioma propio ---------- */
const ADMIN_STR = {
  es: {
    title: "Citas NH · Admin",
    loginTitle: "Acceso de administrador",
    keyLabel: "Clave de administrador",
    loginBtn: "Entrar",
    notConfigured: "El panel de administración no está configurado en este servidor.",
    invalidKey: "Clave incorrecta.",
    tooMany: "Demasiados intentos. Espera unos minutos.",
    network: "Sin conexión. Revisa tu internet.",
    generic: "Algo salió mal. Inténtalo de nuevo.",
    logout: "Cerrar sesión",
    dashboardTitle: "Panel de administración",
    loading: "Cargando…",
    kpiUsers: "Usuarios",
    kpiToday: "Nuevos hoy",
    kpiMatches: "Matches",
    kpiMessages: "Mensajes",
    kpiPremium: "Premium activos",
    kpiRevenue: "Ingresos estimados",
    chartSignups: "Registros por día (30 días)",
    chartActivity: "Actividad por día (30 días)",
    legendLikes: "Likes",
    legendMatches: "Matches",
    legendMessages: "Mensajes",
    revenueTitle: "Ingresos",
    revPremium: "Suscripciones Premium",
    revGifts: "Regalos virtuales",
    revBoosts: "Boosts",
    revTotal: "Total estimado",
    perMonth: "/mes",
    usersTitle: "Usuarios recientes",
    colName: "Nombre",
    colEmail: "Correo",
    colTown: "Ciudad",
    colPlan: "Plan",
    planPremium: "Premium",
    planFree: "Gratis",
    townTitle: "Usuarios por pueblo",
    colZip: "ZIP",
    colCount: "Usuarios",
    colPct: "%",
    loadError: "No se pudo cargar el panel.",
    verifTitle: "Verificaciones pendientes",
    verifEmpty: "No hay selfies en revisión. 🎉",
    verifApprove: "Aprobar",
    verifReject: "Rechazar",
    verifReason: "Motivo",
    verifApproved: "Perfil verificado ✅",
    verifRejected: "Verificación rechazada.",
    verifAge: "años",
    reason_FACE_NOT_CLEAR: "Rostro no claro",
    reason_FACE_COVERED: "Rostro tapado",
    reason_PROVOCATIVE: "Provocativa",
    reason_NOT_REAL: "No parece real",
    reason_UNDERAGE_SUSPECT: "Parece menor de edad",
  },
  en: {
    title: "Citas NH · Admin",
    loginTitle: "Administrator access",
    keyLabel: "Admin key",
    loginBtn: "Sign in",
    notConfigured: "The admin panel is not configured on this server.",
    invalidKey: "Wrong key.",
    tooMany: "Too many attempts. Wait a few minutes.",
    network: "No connection. Check your internet.",
    generic: "Something went wrong. Try again.",
    logout: "Sign out",
    dashboardTitle: "Admin dashboard",
    loading: "Loading…",
    kpiUsers: "Users",
    kpiToday: "New today",
    kpiMatches: "Matches",
    kpiMessages: "Messages",
    kpiPremium: "Active Premium",
    kpiRevenue: "Estimated revenue",
    chartSignups: "Signups per day (30 days)",
    chartActivity: "Activity per day (30 days)",
    legendLikes: "Likes",
    legendMatches: "Matches",
    legendMessages: "Messages",
    revenueTitle: "Revenue",
    revPremium: "Premium subscriptions",
    revGifts: "Virtual gifts",
    revBoosts: "Boosts",
    revTotal: "Estimated total",
    perMonth: "/mo",
    usersTitle: "Recent users",
    colName: "Name",
    colEmail: "Email",
    colTown: "Town",
    colPlan: "Plan",
    planPremium: "Premium",
    planFree: "Free",
    townTitle: "Users by town",
    colZip: "ZIP",
    colCount: "Users",
    colPct: "%",
    loadError: "Couldn't load the dashboard.",
    verifTitle: "Pending verifications",
    verifEmpty: "No selfies under review. 🎉",
    verifApprove: "Approve",
    verifReject: "Reject",
    verifReason: "Reason",
    verifApproved: "Profile verified ✅",
    verifRejected: "Verification rejected.",
    verifAge: "y/o",
    reason_FACE_NOT_CLEAR: "Face not clear",
    reason_FACE_COVERED: "Face covered",
    reason_PROVOCATIVE: "Provocative",
    reason_NOT_REAL: "Doesn't look real",
    reason_UNDERAGE_SUSPECT: "Looks underage",
  },
};

let adminLang = localStorage.getItem("citasnh-admin-lang") || "es";
if (adminLang !== "es" && adminLang !== "en") adminLang = "es";

function at(key) {
  return (ADMIN_STR[adminLang] && ADMIN_STR[adminLang][key]) || ADMIN_STR.es[key] || key;
}

/* ---------- 2. API con token de admin ---------- */
const LS_ADMIN_TOKEN = "citasnh-admin-token";
const root = document.getElementById("admin-app");

function getAdminToken() {
  return localStorage.getItem(LS_ADMIN_TOKEN);
}

async function apiAdmin(path, options) {
  options = options || {};
  const headers = Object.assign({}, options.headers || {});
  const token = getAdminToken();
  if (token) headers["Authorization"] = "Bearer " + token;

  let res;
  try {
    res = await fetch(path, Object.assign({}, options, { headers }));
  } catch (e) {
    throw { code: "NETWORK" };
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

function apiAdminError(err) {
  if (err.status === 404) return at("notConfigured");
  if (err.code === "INVALID_KEY") return at("invalidKey");
  if (err.code === "TOO_MANY_ATTEMPTS") return at("tooMany");
  if (err.code === "NETWORK") return at("network");
  return at("generic");
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ---------- 3. Login ---------- */
function renderLogin() {
  document.getElementById("app-title").textContent = at("title");
  root.innerHTML = `
    <section class="auth">
      <div class="auth-card">
        <div class="auth-heart" aria-hidden="true">📊</div>
        <h2>${at("loginTitle")}</h2>
        <p class="form-error" id="admin-error" hidden></p>
        <form id="admin-form">
          <label>${at("keyLabel")}
            <input type="password" name="key" required autocomplete="off">
          </label>
          <button type="submit" class="btn btn-primary">${at("loginBtn")}</button>
        </form>
      </div>
    </section>`;

  const errBox = document.getElementById("admin-error");
  document.getElementById("admin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    errBox.hidden = true;
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    try {
      // POST /api/admin/login {key} → {token} (JWT role:'admin', 12h).
      // Sin ADMIN_KEY en el servidor responde 404: el panel no existe.
      const data = await apiAdmin("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: new FormData(e.target).get("key") }),
      });
      localStorage.setItem(LS_ADMIN_TOKEN, data.token);
      renderDashboard();
    } catch (err) {
      errBox.textContent = apiAdminError(err);
      errBox.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
}

/* ---------- 4. Dashboard ---------- */
async function renderDashboard() {
  document.getElementById("app-title").textContent = at("title");
  root.innerHTML = `<h2>📊 ${at("dashboardTitle")}</h2><p class="muted">${at("loading")}</p>`;

  let overview, usersSeries, activity, recent, revenue, byTown, verifPending;
  try {
    [overview, usersSeries, activity, recent, revenue, byTown, verifPending] = await Promise.all([
      apiAdmin("/api/admin/overview"),
      apiAdmin("/api/admin/users?days=30"),
      apiAdmin("/api/admin/activity?days=30"),
      apiAdmin("/api/admin/recent"),
      apiAdmin("/api/admin/revenue"),
      apiAdmin("/api/admin/users-by-town"),
      apiAdmin("/api/admin/verifications/pending"),
    ]);
  } catch (err) {
    // Token inválido o expirado → volver al login.
    if (err.status === 403 || err.status === 401) {
      localStorage.removeItem(LS_ADMIN_TOKEN);
      return renderLogin();
    }
    root.innerHTML = `<h2>📊 ${at("dashboardTitle")}</h2><p class="form-error">${at("loadError")}</p>`;
    return;
  }

  const r = overview.revenue;
  root.innerHTML = `
    <div class="admin-head">
      <h2>📊 ${at("dashboardTitle")}</h2>
      <button class="btn-ghost btn" id="admin-logout" type="button">${at("logout")}</button>
    </div>

    <div class="admin-kpis">
      <div class="kpi-card"><span class="kpi-num">${overview.users}</span><span class="kpi-label">👥 ${at("kpiUsers")}</span></div>
      <div class="kpi-card"><span class="kpi-num">+${overview.usersToday}</span><span class="kpi-label">🆕 ${at("kpiToday")}</span></div>
      <div class="kpi-card"><span class="kpi-num">${overview.matches}</span><span class="kpi-label">💘 ${at("kpiMatches")}</span></div>
      <div class="kpi-card"><span class="kpi-num">${overview.messages}</span><span class="kpi-label">💬 ${at("kpiMessages")}</span></div>
      <div class="kpi-card kpi-gold"><span class="kpi-num">${overview.premiumCount}</span><span class="kpi-label">👑 ${at("kpiPremium")}</span></div>
      <div class="kpi-card kpi-gold"><span class="kpi-num">$${r.totalUSD}</span><span class="kpi-label">💰 ${at("kpiRevenue")}</span></div>
    </div>

    <div class="chart-card" id="verif-card">
      <h3>🛡️ ${at("verifTitle")} (${(verifPending.pending || []).length})</h3>
      <div id="verif-list">
        ${(verifPending.pending || []).length === 0
          ? `<p class="muted">${at("verifEmpty")}</p>`
          : (verifPending.pending || []).map((v) => `
          <div class="verif-item" data-user="${v.userId}">
            <img class="verif-photo" data-user="${v.userId}" alt="">
            <div class="verif-info">
              <b>${esc(v.displayName)}</b>
              <span class="muted small">${v.age} ${at("verifAge")}${v.town ? " · " + esc(v.town) : ""}</span>
            </div>
            <div class="verif-actions">
              <button class="btn btn-primary btn-sm verif-approve" data-user="${v.userId}">${at("verifApprove")}</button>
              <select class="verif-reason" data-user="${v.userId}" aria-label="${at("verifReason")}">
                <option value="FACE_NOT_CLEAR">${at("reason_FACE_NOT_CLEAR")}</option>
                <option value="FACE_COVERED">${at("reason_FACE_COVERED")}</option>
                <option value="PROVOCATIVE">${at("reason_PROVOCATIVE")}</option>
                <option value="NOT_REAL">${at("reason_NOT_REAL")}</option>
                <option value="UNDERAGE_SUSPECT">${at("reason_UNDERAGE_SUSPECT")}</option>
              </select>
              <button class="btn-ghost btn btn-sm verif-reject" data-user="${v.userId}">${at("verifReject")}</button>
            </div>
          </div>`).join("")}
      </div>
    </div>

    <div class="chart-card">
      <h3>${at("chartSignups")}</h3>
      <canvas id="ch-signups" class="chart"></canvas>
    </div>

    <div class="chart-card">
      <h3>${at("chartActivity")}</h3>
      <div class="chart-legend">
        <span><i style="background:#ff2e63"></i>${at("legendLikes")}</span>
        <span><i style="background:#8b5cf6"></i>${at("legendMatches")}</span>
        <span><i style="background:#3b82f6"></i>${at("legendMessages")}</span>
      </div>
      <canvas id="ch-activity" class="chart"></canvas>
    </div>

    <div class="chart-card">
      <h3>💰 ${at("revenueTitle")}</h3>
      <ul class="admin-list">
        <li><span>👑 ${at("revPremium")} (${revenue.premium.activeSubs})</span><b>$${revenue.premium.estimatedMonthlyUSD}${at("perMonth")}</b></li>
        ${revenue.gifts.map((g) => `<li><span>${g.emoji} ${at("revGifts")} (${g.count})</span><b>$${(g.cents / 100).toFixed(2)}</b></li>`).join("")}
        <li><span>🚀 ${at("revBoosts")} (${revenue.boosts.sold})</span><b>$${revenue.boosts.totalUSD}</b></li>
        <li class="total"><span>${at("revTotal")}</span><b>$${revenue.grandTotalUSD}</b></li>
      </ul>
    </div>

    <div class="chart-card">
      <h3>👥 ${at("usersTitle")}</h3>
      <div class="table-wrap">
        <table class="admin-table">
          <thead><tr>
            <th>${at("colName")}</th><th>${at("colEmail")}</th>
            <th>${at("colTown")}</th><th>${at("colPlan")}</th><th></th>
          </tr></thead>
          <tbody>
            ${recent.users.map((u) => `
              <tr>
                <td>${esc(u.displayName)}</td>
                <td class="muted small">${esc(u.email)}</td>
                <td>${esc(u.town)}</td>
                <td>${u.isPremium ? '<span class="tag tag-gold">👑 ' + at("planPremium") + "</span>" : '<span class="tag">' + at("planFree") + "</span>"}</td>
                <td><button class="btn-mini-danger" data-del-user="${u.id}" title="Borrar usuario">🗑️</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <div class="chart-card">
      <h3>🗺️ ${at("townTitle")}</h3>
      <canvas id="ch-towns" class="chart"></canvas>
      <div class="table-wrap">
        <table class="admin-table">
          <thead><tr>
            <th>${at("colTown")}</th><th>${at("colZip")}</th>
            <th>${at("colCount")}</th><th>${at("colPct")}</th>
          </tr></thead>
          <tbody>
            ${(byTown.towns || []).map((x) => `
              <tr>
                <td>${esc(x.town)}</td>
                <td class="muted">${esc(x.zip)}</td>
                <td><b>${x.count}</b></td>
                <td>${x.pct}%</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;

  document.getElementById("admin-logout").addEventListener("click", () => {
    localStorage.removeItem(LS_ADMIN_TOKEN);
    renderLogin();
  });

  // Cola de verificación: carga las selfies (blob con token) y conecta botones.
  document.querySelectorAll(".verif-photo").forEach((img) => {
    const uid = img.dataset.user;
    fetch("/api/admin/verifications/photo/" + uid, {
      headers: { Authorization: "Bearer " + getAdminToken() },
    })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (b) img.src = URL.createObjectURL(b);
      })
      .catch(() => {});
  });
  document.querySelectorAll(".verif-approve").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await apiAdmin("/api/admin/verifications/" + btn.dataset.user + "/approve", { method: "POST" });
        alert(at("verifApproved"));
        renderDashboard();
      } catch (e) {
        alert(at("generic"));
        btn.disabled = false;
      }
    });
  });

  // Borrar usuario (limpieza/moderación): confirmación + DELETE + recarga.
  document.querySelectorAll("[data-del-user]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const uid = btn.dataset.delUser;
      if (!confirm("¿Borrar este usuario y todo lo suyo? / Delete this user and all their data?")) return;
      btn.disabled = true;
      try {
        await apiAdmin("/api/admin/users/" + uid, { method: "DELETE" });
        renderDashboard();
      } catch (e) {
        alert(at("generic"));
        btn.disabled = false;
      }
    });
  });
  document.querySelectorAll(".verif-reject").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const uid = btn.dataset.user;
      const sel = document.querySelector('.verif-reason[data-user="' + uid + '"]');
      btn.disabled = true;
      try {
        await apiAdmin("/api/admin/verifications/" + uid + "/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: sel ? sel.value : "FACE_NOT_CLEAR" }),
        });
        alert(at("verifRejected"));
        renderDashboard();
      } catch (e) {
        alert(at("generic"));
        btn.disabled = false;
      }
    });
  });

  // Las gráficas se dibujan cuando el canvas ya tiene tamaño.
  requestAnimationFrame(() => {
    drawBars(document.getElementById("ch-signups"), usersSeries.series, "#ff2e63");
    drawLines(document.getElementById("ch-activity"), [
      { series: activity.likes, color: "#ff2e63" },
      { series: activity.matches, color: "#8b5cf6" },
      { series: activity.messages, color: "#3b82f6" },
    ]);
    drawTownBars(document.getElementById("ch-towns"), byTown.towns || []);
  });
}

/* ---------- 5. Gráficas en canvas (sin dependencias) ---------- */
function setupCanvas(canvas) {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return null;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function drawAxes(ctx, w, h, max, n) {
  const padL = 30, padB = 22, padT = 8;
  ctx.font = "10px system-ui";
  ctx.textAlign = "right";
  ctx.fillStyle = "#a89fae";
  const py = (v) => h - padB - ((h - padB - padT) * v) / max;
  for (let i = 0; i <= 4; i++) {
    const v = Math.round((max * i) / 4);
    const y = py(v);
    ctx.fillText(String(v), padL - 6, y + 3);
    ctx.strokeStyle = "rgba(43,34,48,.07)";
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - 8, y);
    ctx.stroke();
  }
  return {
    padL, padB, padT,
    px: (i) => padL + ((w - padL - 8) * i) / Math.max(1, n - 1),
    py,
  };
}

function drawDateLabels(ctx, series, ax) {
  ctx.fillStyle = "#a89fae";
  ctx.textAlign = "center";
  ctx.font = "10px system-ui";
  series.forEach((s, i) => {
    if (i % 5 === 0) ctx.fillText(s.date.slice(5), ax.px(i), ax.h - 7);
  });
}

// Barras con degradado (registros por día).
function drawBars(canvas, series, color) {
  const c = setupCanvas(canvas);
  if (!c) return;
  const { ctx, w, h } = c;
  const max = Math.max(1, ...series.map((s) => s.count));
  const ax = drawAxes(ctx, w, h, max, series.length);
  ax.h = h;
  const cw = (w - ax.padL - 8) / series.length;
  series.forEach((s, i) => {
    const bh = ((h - ax.padB - ax.padT) * s.count) / max;
    const x = ax.padL + i * cw + cw * 0.22;
    const y = h - ax.padB - bh;
    const g = ctx.createLinearGradient(0, y, 0, h - ax.padB);
    g.addColorStop(0, color);
    g.addColorStop(1, color + "66");
    ctx.fillStyle = g;
    const bw = Math.max(2, cw * 0.56);
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, Math.max(y, ax.padT), bw, Math.max(bh, s.count > 0 ? 2 : 0), 3);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, bw, Math.max(bh, s.count > 0 ? 2 : 0));
    }
  });
  drawDateLabels(ctx, series, ax);
}

// Líneas múltiples (actividad por día).
function drawLines(canvas, list) {
  const c = setupCanvas(canvas);
  if (!c || !list.length) return;
  const { ctx, w, h } = c;
  const max = Math.max(1, ...list.flatMap((l) => l.series.map((s) => s.count)));
  const ax = drawAxes(ctx, w, h, max, list[0].series.length);
  ax.h = h;

  list.forEach((l) => {
    ctx.strokeStyle = l.color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    l.series.forEach((s, i) => {
      const x = ax.px(i), y = ax.py(s.count);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = l.color;
    l.series.forEach((s, i) => {
      ctx.beginPath();
      ctx.arc(ax.px(i), ax.py(s.count), 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  });
  drawDateLabels(ctx, list[0].series, ax);
}

// Barras horizontales para "usuarios por pueblo": nombre a la izquierda,
// barra con degradado y conteo + % a la derecha.
function drawTownBars(canvas, towns) {
  const c = setupCanvas(canvas);
  if (!c || !towns.length) return;
  const { ctx, w, h } = c;
  const top = towns.slice(0, 12);
  const max = Math.max(1, ...top.map((t) => t.count));
  const padL = 118, padR = 24, padT = 10, padB = 12;
  const rowH = (h - padT - padB) / top.length;
  ctx.font = "11px system-ui";
  top.forEach((t, i) => {
    const y = padT + i * rowH;
    ctx.fillStyle = "#5b4a58";
    ctx.textAlign = "right";
    ctx.fillText(String(t.town).slice(0, 17), padL - 8, y + rowH / 2 + 4);
    const bw = ((w - padL - padR - 70) * t.count) / max;
    const g = ctx.createLinearGradient(padL, 0, padL + Math.max(bw, 1), 0);
    g.addColorStop(0, "#ff2e63");
    g.addColorStop(1, "#ff2e6366");
    ctx.fillStyle = g;
    const bh = Math.min(rowH - 8, 18);
    const by = y + (rowH - bh) / 2;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(padL, by, Math.max(bw, 2), bh, 4);
      ctx.fill();
    } else {
      ctx.fillRect(padL, by, Math.max(bw, 2), bh);
    }
    ctx.fillStyle = "#5b4a58";
    ctx.textAlign = "left";
    ctx.fillText(t.count + " (" + t.pct + "%)", padL + bw + 6, y + rowH / 2 + 4);
  });
}

/* ---------- 6. Arranque ---------- */
document.getElementById("lang-toggle").textContent = adminLang === "es" ? "EN" : "ES";
document.getElementById("lang-toggle").addEventListener("click", () => {
  adminLang = adminLang === "es" ? "en" : "es";
  localStorage.setItem("citasnh-admin-lang", adminLang);
  document.getElementById("lang-toggle").textContent = adminLang === "es" ? "EN" : "ES";
  document.documentElement.lang = adminLang;
  if (getAdminToken()) renderDashboard();
  else renderLogin();
});
document.documentElement.lang = adminLang;

if (getAdminToken()) renderDashboard();
else renderLogin();
