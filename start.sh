#!/bin/bash
# start.sh — Arranque de Citas NH en Render.
# Si las variables LITESTREAM_* están configuradas, restaura la base de datos
# desde la réplica (R2) y la mantiene replicada con Litestream. Si no,
# arranca el servidor normalmente (modo desarrollo / sin réplica).

set -e
cd "$(dirname "$0")"

# get_env: lee una variable de entorno tolerando espacios accidentales en el
# NOMBRE (p. ej. "LITESTREAM_S3_ENDPOINT " con un espacio al final, que pasa
# al copiar/pegar en el panel de Render) y limpiando espacios/saltos de línea
# del VALOR. Si hay duplicados, prefiere el que tenga valor no vacío.
# Nunca imprime secretos: solo se usan longitudes en el diagnóstico.
get_env() {
  local want="$1" line name rest clean_name clean_val fallback=""
  while IFS= read -r line; do
    case "$line" in *=*) ;; *) continue;; esac
    name="${line%%=*}"
    rest="${line#*=}"
    clean_name="$(printf '%s' "$name" | tr -d '[:space:]')"
    [ "$clean_name" = "$want" ] || continue
    clean_val="$(printf '%s' "$rest" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    if [ -n "$clean_val" ]; then
      printf '%s' "$clean_val"
      return 0
    fi
    fallback="$clean_val"
  done < <(env)
  printf '%s' "$fallback"
  return 0
}

# Normalizar las 4 variables antes de usarlas.
LITESTREAM_S3_ENDPOINT="$(get_env LITESTREAM_S3_ENDPOINT)"
LITESTREAM_BUCKET="$(get_env LITESTREAM_BUCKET)"
LITESTREAM_KEY_ID="$(get_env LITESTREAM_KEY_ID)"
LITESTREAM_KEY_SECRET="$(get_env LITESTREAM_KEY_SECRET)"
export LITESTREAM_S3_ENDPOINT LITESTREAM_BUCKET LITESTREAM_KEY_ID LITESTREAM_KEY_SECRET

BIN="./bin/litestream"

# Diagnóstico seguro (sin imprimir secretos): longitudes y estado del binario.
if [ -x "$BIN" ]; then BIN_OK="OK"; else BIN_OK="FALTA"; fi
echo "[arranque] chequeo litestream: endpoint_len=${#LITESTREAM_S3_ENDPOINT} bucket='${LITESTREAM_BUCKET}' binario=${BIN_OK} ($BIN)"

# Si el binario no quedó instalado en el build, intentar descargarlo en arranque.
if [ "$BIN_OK" = "FALTA" ]; then
  echo "[arranque] Binario litestream ausente; intentando descarga en arranque..."
  node scripts/install-litestream.js || true
fi

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
