# Cambio MTP — Resumen (12-oct-2026)

## Qué se hizo (SOLO local — sin deploy, sin push, sin tocar Render ni el dominio)

### 1. Nombre nuevo: **MTP — Mi Tipo de Persona**
Branding visible cambiado de «Citas NH» a «MTP» en:
- `public/index.html` — title, meta description, OG/Twitter, JSON-LD (name = «MTP — Mi Tipo de Persona», **«Citas NH» queda como alternateName** por SEO), h1, textos PWA, apple-title.
- `public/manifest.json` — name «MTP — Mi Tipo de Persona», short_name «MTP», description nueva.
- `public/js/i18n/es.js` y `en.js` — appName, seo, premium, welcome, referral, mapa, versión (MTP · v1.1), error de edad. Paridad ES/EN verificada: **475 claves en ambos**.
- `package.json` — description (el nombre interno del paquete sigue `citas-nh`).
- `public/admin.html` / `public/admin.js` — «MTP · Admin».
- `public/privacidad.html` / `public/terminos.html` — título, h1, textos y nota «MTP es el nuevo nombre de Citas NH» (actualizado oct-2026).

**Se conserva intacto:** dominio y URLs `citas-nh.onrender.com` (canonical, og:url, sitemap, robots), slug interno, carpetas y la base de datos (nombre `citasnh.db`).

### 2. Posicionamiento nuevo: salud mental, solo Manchester NH
- Tagline oficial en meta/OG/manifest/SEO: *«MTP — Mi Tipo de Persona · Citas en Manchester, NH para personas con condiciones de salud mental: un espacio seguro, sin juzgar, a tu ritmo.»*
- **Sección nueva en la portada** (`#mh-intro` en index.html, textos vía i18n ES/EN): aquí se vale ir despacio, ser honesto/a, poner límites y nadie te juzga por tu condición; **no es terapia ni sustituye ayuda profesional**; en crisis, **988** en USA (gratis, confidencial, 24/7).
- Lenguaje siempre respetuoso: «condiciones de salud mental / salud mental», sin estigma ni burla.
- El copy principal (hero/meta/sección/perfil del dueño) habla de **Manchester solamente**.
- ⚠️ **Pendiente técnico (decisión aparte):** el registro del backend **sigue aceptando ZIP de todo NH** — no se tocó la validación ni se borraron pueblos. Bloquear el registro fuera de Manchester queda pendiente si el dueño lo quiere después.

### 3. Gustos con chips (más completo y amigable)
- El editor de perfil ya **no** usa texto libre con comas: **chips tocables** (25 categorías): Anime, Videojuegos, Deportes, Béisbol, Baloncesto, Fútbol, Música, Baile, Cine y series, Comida dominicana, Cocina, Viajes, Playa, Naturaleza, Gym, Arte, Lectura, Mascotas, Tecnología, Autos, Familia, Fe, Negocios, Fotografía, Moda.
- Se guarda el mismo array `interests` de siempre (valor canónico en español; etiqueta localizada ES/EN). Gustos viejos no listados **aparecen como chips propios marcados** — no se pierde data. Backend intacto: máx. 10, ≤20 caracteres (todas las categorías caben).

### 4. «Mi tipo de persona 😏» — PERSISTENTE DE VERDAD
- Migración segura en `db.js` (patrón ALTER solo-si-falta): columna **`partner_interests`** (TEXT JSON) en `profiles`.
- `routes/profile.js`: GET lo devuelve como `partnerInterests`; PUT lo valida igual que interests (array, máx. 10, ≤20 c/u, error `INVALID_PARTNER_INTERESTS`).
- `routes/discover.js` lo incluye en la tarjeta; `app.js` lo muestra en Descubrir y en el visor de perfil como «Busca a alguien que le guste: …».

### 5. Condiciones de salud mental — OPCIONALES y con privacidad — PERSISTENTE DE VERDAD
- Migración segura en `db.js`: columnas **`mh_conditions`** (JSON), **`support_needs`** (JSON) y **`mh_visibility`** (defecto `after_match`) en `profiles`.
- Chips de condición: Ansiedad, Depresión, TDAH, Trastorno bipolar, TEPT, TOC, Autismo, Otra, **Prefiero contarlo en privado**, **Sin condición — soy aliado/a**.
- Chips de «Lo que necesito / me hace sentir bien»: Paciencia, Comunicación clara, Ir despacio, Apoyo sin juzgar, Rutinas, Espacio cuando lo pido, Humor, Salidas tranquilas.
- **Visibilidad elegible en el editor:** Compartir en mi perfil / **Solo tras hacer match** (defecto) / No mostrar.
- Privacidad aplicada en serio (verificado por API):
  - Perfil de otro (`GET /api/profile/:id`): condiciones solo si visibilidad = pública, o si hay match y visibilidad = tras match; si no, llegan vacías.
  - Descubrir: condiciones solo si la persona eligió compartirlas en público (antes del match no se filtra nada privado). Las necesidades de apoyo sí se muestran (son preferencias de trato, con respeto).
  - Nadie está obligado a llenar esta sección; es 100% opcional.
- Validación PUT: condiciones máx. 10 (≤40 c/u), necesidades máx. 10 (≤30 c/u), visibilidad en lista cerrada. Errores i18n ES/EN agregados.

### 6. Dueño 👑
- `utils/owner.js` **no se tocó**: la primera cuenta ya queda dueña/fundadora verificada automáticamente.
- Perfil listo para pegar en **`PERFIL-DUENO-MTP.md`**: Chris / Yeudefeliz Cepeda, Buscando relación, de Manchester NH, bio bacana, gustos (Anime, Videojuegos, Deportes, Béisbol, Música, Tecnología, Negocios, Cine y series), su tipo (que le guste anime, videojuegos y deportes + comprensiva con la salud mental, paciente, que no juzgue), y su renglón de condición = **«Prefiero contarlo en privado»** (ningún diagnóstico asignado).
- ⚠️ **NO quedó aplicado en producción**: aplicarlo requiere que el dueño entre a su cuenta (la primera/dueña) y guarde el perfil, o una sesión admin.

## Verificación (local, puerto 3477 — servidor ya apagado)
- ✅ `node --check` en **todo** el JS del proyecto (public, routes, utils, db.js, server.js): sin errores.
- ✅ Servidor local respondió **200** en `/`; la página contiene «MTP», «Mi Tipo de Persona», el posicionamiento de salud mental, la sección `#mh-intro` y el **988**. Manifest servido con el nombre nuevo. El JS servido contiene los 4 grupos de chips y `conditionVisibility`.
- ✅ i18n: paridad total ES/EN (475 claves; incluye 25 interest_, 10 cond_, 8 need_).
- ✅ Prueba de API de punta a punta (cuentas de prueba locales, **borradas al terminar**, 0 residuos; la DB local quedó con sus 3 usuarios de antes):
  - PUT/GET de perfil guarda y devuelve interests + partnerInterests + conditions + supportNeeds + conditionVisibility.
  - Privacidad: con visibilidad pública otro usuario ve las condiciones; con «solo tras match» y sin match **no las ve** (las necesidades de apoyo sí).
  - Validaciones: 11 condiciones → 400 `INVALID_CONDITIONS`; visibilidad inválida → 400 `INVALID_CONDITION_VISIBILITY`.
  - Descubrir responde 200 con `conditions` y `supportNeeds` en la tarjeta.
- ✅ Migraciones aplicadas sobre la DB local existente sin romperla (columnas nuevas presentes, datos intactos).

## Qué FALTA para producción (lo decide/hace el dueño)
1. **Push a GitHub + deploy en Render** (con su aprobación) — nada de esto está en vivo todavía.
2. **Renombrar las superficies sociales**: página de Facebook, TikTok y canal de YouTube de «Citas NH» a MTP — eso lo hace él en cada plataforma.
3. El **dominio sigue siendo citas-nh.onrender.com** (sin cambiar, por decisión del brief).
4. **Aplicar el perfil del dueño** entrando a su cuenta y pegando `PERFIL-DUENO-MTP.md`.
5. Decisión pendiente: ¿bloquear técnicamente el registro fuera de Manchester, o dejar NH abierto y solo posicionar Manchester en el copy? (hoy: solo copy).
6. Fuera del alcance de este cambio (siguen diciendo «Citas NH» por dentro): textos del blog (`routes/blog.js`), notificaciones push (`utils/push.js`), nombres de productos de Stripe/regalos y el flyer con QR — se pueden actualizar en una segunda pasada si él lo pide.
