# Citas NH 💘📍

App web de citas para hispanohablantes en **New Hampshire**. Español por defecto, con cambio a inglés. Sin apps de tienda: funciona en el navegador del teléfono y se puede instalar como PWA en Android.

## Cómo correrla en tu computadora

Necesitas [Node.js](https://nodejs.org) 18 o más nuevo.

```bash
cd citas-nh
npm install
npm start
```

Abre http://localhost:3000 en el navegador.

Variables opcionales (en tu computadora no hacen falta):

| Variable     | Para qué sirve                        | Valor por defecto        |
|--------------|---------------------------------------|--------------------------|
| `PORT`       | Puerto donde escucha el servidor      | `3000`                   |
| `JWT_SECRET` | Secreto para firmar las sesiones      | uno de desarrollo (avisa en consola) |

En producción **siempre** define tu propio `JWT_SECRET` largo y aleatorio.

## Cómo subirla gratis (Render, plan gratuito)

1. Sube esta carpeta a un repositorio en GitHub.
2. En [render.com](https://render.com) crea un **New → Web Service** conectado a ese repo.
3. Build Command: `npm install` · Start Command: `npm start`.
4. En *Environment* agrega `JWT_SECRET` con un valor largo y aleatorio.
5. Deploy. Te dará una URL pública gratis.

> ⚠️ **Nota honesta:** el plan gratis de Render usa disco efímero: cada vez que el servicio se reinicia o haces un redeploy, **la base de datos SQLite (`data/citasnh.db`) y las fotos subidas se pierden**. Para una app de verdad necesitas el upgrade: cambiar `better-sqlite3` por `pg` (Postgres, Render tiene plan gratis con persistencia) y guardar las fotos en un servicio de archivos (ej. Cloudinary o un bucket S3). El código está organizado para que ese cambio sea localizado en `db.js` y la subida de fotos.

## Qué incluye el MVP

- Registro con email + contraseña (cifrada con bcrypt), fecha de nacimiento (**bloquea menores de 18**) y ZIP validado como New Hampshire (**030xx–038xx, verificado en el servidor**).
- Perfil: bio, género, qué busca, idiomas, intereses, pueblo de NH y hasta 3 fotos (máx. 5 MB, solo imágenes).
- Descubrir: tarjetas de otros usuarios de NH (sin repetir a quien ya votaste ni a bloqueados), botones Me gusta / Pasar.
- Match mutuo → lista de Matches + chat 1-a-1 (se actualiza cada 5 segundos).
- Idioma ES/EN con un botón (todo el texto sale de `public/js/i18n/`).
- Seguridad: reportar, bloquear, borrar cuenta (borra todo), páginas de Términos y Privacidad.
- PWA: `manifest.json`, service worker con caché básico e ícono propio.

## Estructura

```
citas-nh/
├── server.js            # Entrada: Express, estáticos, rutas, errores
├── db.js                # SQLite: crea ./data/citasnh.db y las tablas
├── middleware/auth.js   # Revisa el JWT (Authorization: Bearer ...)
├── routes/              # auth, profile, discover, matches, chat, social
├── utils/validacion.js  # Edad 18+ y ZIP de NH
├── public/              # Frontend (HTML/CSS/JS vanilla, sin build)
│   ├── js/i18n/         # Diccionarios es.js / en.js
│   ├── manifest.json, sw.js, icons/
│   ├── terminos.html, privacidad.html
├── uploads/             # Fotos de usuarios (no se sube a git)
└── data/                # Base de datos SQLite (no se sube a git)
```

## Para el desarrollador (tú, futuro programador 👑)

Todo el código tiene comentarios en español explicando qué hace cada parte. Empieza por `server.js`, sigue con `db.js` y luego `routes/auth.js`. El frontend vive en `public/js/app.js`.
