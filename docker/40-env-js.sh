#!/bin/sh
# Writes runtime config for the SPA. Accepts NAME or VITE_NAME, so one .env serves dev + Docker.
set -e
OUT=/usr/share/nginx/html/env.js
{
  echo "window.__ENV__ = {"
  for key in SUPABASE_URL SUPABASE_ANON_KEY VAPID_PUBLIC_KEY GIPHY_KEY HOST_ORIGINS; do
    val="$(printenv "$key" || printenv "VITE_$key" || true)"
    esc="$(printf '%s' "$val" | sed 's/\\/\\\\/g; s/"/\\"/g')"
    echo "  \"$key\": \"$esc\","
  done
  echo "};"
} > "$OUT"
echo "iemanchat: wrote $OUT"
