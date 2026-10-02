// scripts/install-litestream.js
// Descarga el binario de Litestream (solo en Linux) para replicar la
// base de datos SQLite a almacenamiento S3-compatible (Cloudflare R2).
// Se ejecuta vía "postinstall" en Render. En local (Mac/Windows) no hace nada.

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const VERSION = 'v0.3.13';
const BIN_DIR = path.join(__dirname, '..', 'bin');
const BIN_PATH = path.join(BIN_DIR, 'litestream');

if (process.platform !== 'linux' || process.arch !== 'x64') {
  console.log('[litestream] Plataforma no Linux x64, se omite la descarga.');
  process.exit(0);
}

if (fs.existsSync(BIN_PATH)) {
  try { fs.chmodSync(BIN_PATH, 0o755); } catch {}
  console.log('[litestream] Binario ya existe, se omite la descarga.');
  process.exit(0);
}

const URL = `https://github.com/benbjohnson/litestream/releases/download/${VERSION}/litestream-${VERSION}-linux-amd64.tar.gz`;
const TMP = path.join(BIN_DIR, 'litestream.tar.gz');

fs.mkdirSync(BIN_DIR, { recursive: true });
console.log(`[litestream] Descargando ${URL} ...`);

https
  .get(URL, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      // Seguir redirección (GitHub redirige a los assets).
      https
        .get(res.headers.location, (res2) => guardar(res2))
        .on('error', fallar);
      return;
    }
    guardar(res);
  })
  .on('error', fallar);

function guardar(res) {
  const archivo = fs.createWriteStream(TMP);
  res.pipe(archivo);
  archivo.on('finish', () => {
    archivo.close();
    try {
      execSync(`tar --no-same-owner -xzf ${TMP} -C ${BIN_DIR} litestream`, { stdio: 'inherit' });
      fs.chmodSync(BIN_PATH, 0o755);
      fs.unlinkSync(TMP);
      console.log('[litestream] Instalado en', BIN_PATH);
    } catch (e) {
      fallar(e);
    }
  });
}

function fallar(err) {
  // No romper el build si la descarga falla: la app arranca sin réplica.
  console.warn('[litestream] No se pudo descargar, la app arrancará sin réplica:', err.message);
  process.exit(0);
}
