#!/bin/bash
# start.sh — Arranque de Citas NH en Render.
# Si las variables LITESTREAM_* están configuradas, restaura la base de datos
# desde la réplica (R2) y la mantiene replicada con Litestream. Si no,
# arranca el servidor normalmente (modo desarrollo / sin réplica).

set -e
cd "$(dirname "$0")"

BIN="./bin/litestream"

if [ -n "$LITESTREAM_S3_ENDPOINT" ] && [ -n "$LITESTREAM_BUCKET" ] && [ -x "$BIN" ]; then
  echo "[arranque] Litestream activado: restaurando DB desde la réplica..."

  cat > /tmp/litestream.yml <<EOF
dbs:
  - path: ./data/citasnh.db
    replicas:
      - url: s3://${LITESTREAM_BUCKET}/citasnh.db
        endpoint: ${LITESTREAM_S3_ENDPOINT}
        region: auto
        sync-interval: 10s
EOF

  export AWS_ACCESS_KEY_ID="$LITESTREAM_KEY_ID"
  export AWS_SECRET_ACCESS_KEY="$LITESTREAM_KEY_SECRET"

  # Restaura solo si la réplica existe; si es la primera vez, sigue con DB vacía.
  "$BIN" restore -if-replica-exists -config /tmp/litestream.yml ./data/citasnh.db || true

  echo "[arranque] Replicando con Litestream y arrancando el servidor..."
  exec "$BIN" replicate -config /tmp/litestream.yml -exec "node server.js"
else
  echo "[arranque] Litestream no configurado; arranque normal."
  exec node server.js
fi
