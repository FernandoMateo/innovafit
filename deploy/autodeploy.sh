#!/usr/bin/env bash
# Revisa GitHub y, si hay commits nuevos en main, actualiza y reinicia el sitio.
# Lo ejecuta innovafit-deploy.timer cada minuto.
set -euo pipefail
cd /opt/innovafit/app

exec 9>/tmp/innovafit-deploy.lock
flock -n 9 || exit 0

git fetch -q origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
[ "$LOCAL" = "$REMOTE" ] && exit 0

echo "Actualizando $LOCAL -> $REMOTE"
git reset -q --hard origin/main
npm ci --omit=dev --no-audit --no-fund
node setup.js            # aplica cambios de colecciones/reglas (no repite la carga inicial)
install -m 0644 deploy/innovafit.service /etc/systemd/system/innovafit.service
install -m 0644 deploy/nginx.conf /etc/nginx/conf.d/innovafit.conf
systemctl daemon-reload
nginx -t && systemctl reload nginx
systemctl restart innovafit
echo "Listo: $(git log -1 --format='%h %s')"
