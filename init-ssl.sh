#!/bin/bash
set -e

DOMAIN="pickme.mov"
EMAIL="${1:?Usage: ./init-ssl.sh your@email.com}"

echo "==> Starting nginx with HTTP-only config for ACME challenge..."
cp nginx/init.conf nginx/active.conf
docker compose up -d nginx

echo "==> Requesting certificate for $DOMAIN..."
docker compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  -d "$DOMAIN" \
  -d "www.$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email

echo "==> Switching to full config with SSL..."
cp nginx/default.conf nginx/active.conf
docker compose exec nginx nginx -s reload

echo "==> Starting all services..."
docker compose up -d

echo "==> Done! https://$DOMAIN should be live."
