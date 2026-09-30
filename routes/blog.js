// routes/blog.js — Blog público de Citas NH.
// Sin login: GET /blog (lista) y GET /blog/:slug (artículo).
// Los artículos viven en content/blog/{es,en}/<slug>.md con frontmatter
// (title, description, date). Para agregar un artículo nuevo basta con
// crear los dos archivos .md; el sitemap hay que actualizarlo a mano.

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const BASE_URL = 'https://citas-nh.onrender.com';
const CONTENT_DIR = path.join(__dirname, '..', 'content', 'blog');
const LANGS = ['es', 'en'];
const SLUG_RE = /^[a-z0-9-]+$/;

// --- Mini conversor Markdown → HTML (solo lo que usan los artículos) ------
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(md) {
  // Primero escapamos todo el HTML crudo, luego aplicamos formato.
  let h = esc(md);
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  h = h.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
  return h;
}

function mdToHtml(md) {
  const lines = md.split('\n');
  let html = '';
  let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^-\s+/.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += '<li>' + inline(line.replace(/^-\s+/, '')) + '</li>';
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (/^#\s+/.test(line)) { html += '<h1>' + inline(line.slice(2)) + '</h1>'; continue; }
    if (/^##\s+/.test(line)) { html += '<h2>' + inline(line.slice(3)) + '</h2>'; continue; }
    if (line === '') continue;
    html += '<p>' + inline(line) + '</p>';
  }
  if (inList) html += '</ul>';
  return html;
}

// --- Lectura de artículos -------------------------------------------------
function parseArticle(slug, lang) {
  if (!SLUG_RE.test(slug) || !LANGS.includes(lang)) return null;
  const file = path.join(CONTENT_DIR, lang, slug + '.md');
  if (!file.startsWith(CONTENT_DIR)) return null; // anti path-traversal
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
  if (!meta.title || !meta.date) return null;
  return {
    slug,
    lang,
    title: meta.title,
    description: meta.description || '',
    date: meta.date,
    html: mdToHtml(m[2].trim()),
  };
}

function listArticles(lang) {
  const dir = path.join(CONTENT_DIR, lang);
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')); } catch { return []; }
  return files
    .map((f) => parseArticle(f.replace(/\.md$/, ''), lang))
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function fechaBonita(dateStr, lang) {
  const mesesEs = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const mesesEn = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return esc(dateStr);
  const meses = lang === 'en' ? mesesEn : mesesEs;
  const mes = meses[parseInt(m[2], 10) - 1] || '';
  return lang === 'en'
    ? `${mes} ${parseInt(m[3], 10)}, ${m[1]}`
    : `${parseInt(m[3], 10)} de ${mes} de ${m[1]}`;
}

// --- Plantilla ------------------------------------------------------------
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#fff8e1;color:#3a2b2b;line-height:1.65}
a{color:#ff2e63}
.wrap{max-width:720px;margin:0 auto;padding:24px 18px 60px}
.topbar{background:#ff2e63;color:#fff;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10}
.topbar a{color:#fff;text-decoration:none;font-weight:700}
.brand{font-size:20px}
.brand span{color:#ffd166}
.langs a{margin-left:12px;font-size:14px;opacity:.9}
.langs a.on{text-decoration:underline;opacity:1}
.hero{text-align:center;padding:36px 18px 10px}
.hero h1{font-size:30px;color:#b91c1c}
.hero p{color:#8a6a5a;margin-top:8px}
.card{background:#fff;border-radius:18px;padding:22px;margin:18px 0;box-shadow:0 4px 18px rgba(185,28,28,.10);border:1px solid #ffe3c2}
.card h2{font-size:22px;margin-bottom:6px}
.card h2 a{color:#b91c1c;text-decoration:none}
.card h2 a:hover{color:#ff2e63}
.meta{font-size:13px;color:#a08070;margin-bottom:10px}
.card p.desc{color:#5a4444}
.leer{display:inline-block;margin-top:12px;font-weight:700}
.article{background:#fff;border-radius:18px;padding:28px 24px;margin:24px 0;box-shadow:0 4px 18px rgba(185,28,28,.10);border:1px solid #ffe3c2}
.article h1{color:#b91c1c;font-size:28px;line-height:1.3;margin-bottom:6px}
.article h2{color:#b91c1c;font-size:21px;margin:26px 0 10px}
.article p{margin:12px 0;color:#4a3838}
.article ul{margin:12px 0 12px 22px;color:#4a3838}
.article li{margin:6px 0}
.back{display:inline-block;margin:6px 0 0;font-weight:700;text-decoration:none}
.cta{background:linear-gradient(135deg,#ff2e63,#ff6b6b);color:#fff;border-radius:18px;padding:26px;text-align:center;margin:26px 0}
.cta h3{font-size:22px;margin-bottom:8px}
.cta p{opacity:.95;margin-bottom:14px}
.btn{display:inline-block;background:#ffd166;color:#7a1f1f;font-weight:800;padding:12px 26px;border-radius:999px;text-decoration:none}
.footer{text-align:center;padding:26px 18px;color:#a08070;font-size:13px}
.footer a{color:#ff2e63;text-decoration:none;margin:0 8px}
`;

const T = {
  es: {
    blogTitle: 'Blog de Citas NH',
    blogDesc: 'Consejos de citas, guías y novedades de la app de citas en español para New Hampshire.',
    back: '← Volver al blog',
    readMore: 'Leer artículo →',
    ctaTitle: '¿Listo para tu próxima cita?',
    ctaText: 'Únete gratis a Citas NH y conoce gente real en Manchester, Nashua y todo New Hampshire.',
    ctaBtn: 'Crear mi cuenta gratis',
    home: 'Citas NH',
    app: 'Abrir la app',
  },
  en: {
    blogTitle: 'Citas NH Blog',
    blogDesc: 'Dating tips, guides, and news from the Spanish-first dating app for New Hampshire.',
    back: '← Back to the blog',
    readMore: 'Read article →',
    ctaTitle: 'Ready for your next date?',
    ctaText: 'Join Citas NH for free and meet real people in Manchester, Nashua, and all of New Hampshire.',
    ctaBtn: 'Create my free account',
    home: 'Citas NH',
    app: 'Open the app',
  },
};

function page({ lang, title, description, canonical, ogType, jsonLd, body }) {
  const t = T[lang];
  const qs = lang === 'en' ? '?lang=en' : '';
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${canonical}" />
<meta name="robots" content="index, follow" />
<meta property="og:type" content="${ogType}" />
<meta property="og:site_name" content="Citas NH" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${BASE_URL}/icons/icon-512.png" />
<meta property="og:locale" content="${lang === 'en' ? 'en_US' : 'es_ES'}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${BASE_URL}/icons/icon-512.png" />
<script type="application/ld+json">${jsonLd}</script>
<style>${CSS}</style>
</head>
<body>
<header class="topbar">
  <a class="brand" href="/blog${qs}">❤️ <span>Citas NH</span> · Blog</a>
  <nav class="langs">
    <a href="?lang=es" class="${lang === 'es' ? 'on' : ''}">ES</a>
    <a href="?lang=en" class="${lang === 'en' ? 'on' : ''}">EN</a>
    <a href="/${lang === 'en' ? '?lang=en' : ''}">${esc(t.app)}</a>
  </nav>
</header>
<div class="wrap">${body}</div>
<footer class="footer">
  <a href="/blog${qs}">${esc(t.blogTitle)}</a> ·
  <a href="/${lang === 'en' ? '?lang=en' : ''}">${esc(t.home)}</a> ·
  <a href="/terminos">Términos</a> · <a href="/privacidad">Privacidad</a>
  <p>© 2026 Citas NH — Hecho con ❤️ en New Hampshire</p>
</footer>
</body>
</html>`;
}

function getLang(req) {
  return req.query.lang === 'en' ? 'en' : 'es';
}

// --- Rutas ----------------------------------------------------------------
router.get('/', (req, res) => {
  const lang = getLang(req);
  const t = T[lang];
  const articles = listArticles(lang);
  const cards = articles.map((a) => `
    <article class="card">
      <div class="meta">${fechaBonita(a.date, lang)}</div>
      <h2><a href="/blog/${a.slug}${lang === 'en' ? '?lang=en' : ''}">${esc(a.title)}</a></h2>
      <p class="desc">${esc(a.description)}</p>
      <a class="leer" href="/blog/${a.slug}${lang === 'en' ? '?lang=en' : ''}">${esc(t.readMore)}</a>
    </article>`).join('\n');

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: t.blogTitle,
    description: t.blogDesc,
    url: `${BASE_URL}/blog`,
    inLanguage: lang,
    publisher: { '@type': 'Organization', name: 'Citas NH', url: BASE_URL },
  });

  res.send(page({
    lang,
    title: `${t.blogTitle} — ${t.blogDesc.slice(0, 60)}`,
    description: t.blogDesc,
    canonical: `${BASE_URL}/blog`,
    ogType: 'website',
    jsonLd,
    body: `
      <div class="hero"><h1>❤️ ${esc(t.blogTitle)}</h1><p>${esc(t.blogDesc)}</p></div>
      ${cards || '<p>No hay artículos todavía.</p>'}
      <div class="cta"><h3>${esc(t.ctaTitle)}</h3><p>${esc(t.ctaText)}</p>
      <a class="btn" href="/">${esc(t.ctaBtn)}</a></div>`,
  }));
});

router.get('/:slug', (req, res) => {
  const lang = getLang(req);
  const t = T[lang];
  const a = parseArticle(req.params.slug, lang);
  if (!a) return res.status(404).send('Artículo no encontrado / Article not found');

  const canonical = `${BASE_URL}/blog/${a.slug}`;
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    description: a.description,
    image: `${BASE_URL}/icons/icon-512.png`,
    datePublished: a.date,
    inLanguage: lang,
    author: { '@type': 'Organization', name: 'Citas NH', url: BASE_URL },
    publisher: { '@type': 'Organization', name: 'Citas NH', url: BASE_URL },
    mainEntityOfPage: canonical,
  });

  res.send(page({
    lang,
    title: `${a.title} — Blog Citas NH`,
    description: a.description,
    canonical,
    ogType: 'article',
    jsonLd,
    body: `
      <a class="back" href="/blog${lang === 'en' ? '?lang=en' : ''}">${esc(t.back)}</a>
      <article class="article">
        <h1>${esc(a.title)}</h1>
        <div class="meta">${fechaBonita(a.date, lang)}</div>
        ${a.html}
      </article>
      <div class="cta"><h3>${esc(t.ctaTitle)}</h3><p>${esc(t.ctaText)}</p>
      <a class="btn" href="/">${esc(t.ctaBtn)}</a></div>`,
  }));
});

module.exports = router;
