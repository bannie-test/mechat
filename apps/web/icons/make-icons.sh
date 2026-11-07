#!/bin/sh
# Regenerates the PNG app icons from icons/app-icon.svg using headless Chrome in Docker.
#   sh apps/web/icons/make-icons.sh
set -e
cd "$(dirname "$0")"
WORK="$(mktemp -d)"; chmod 777 "$WORK"
SVG="$(cat app-icon.svg)"
# Full-bleed variant: square background, artwork scaled into the centre (maskable safe zone / iOS).
FULL="$(printf '%s' "$SVG" | sed 's|<rect width="512" height="512" rx="128" fill="url(#bg)"/>|<rect width="512" height="512" fill="url(#bg)"/><g transform="translate(256 256) scale(SCALE) translate(-256 -256)">|; s|</svg>|</g></svg>|')"
page() { printf '<html><body style="margin:0;background:transparent">%s</body></html>' "$(printf '%s' "$2" | sed "s|<svg |<svg width=\"$1\" height=\"$1\" style=\"display:block\" |")"; }
shot() { # size html out
  printf '%s' "$2" > "$WORK/p.html"
  docker run --rm -v "$WORK:/w:Z" zenika/alpine-chrome:124 --no-sandbox --hide-scrollbars \
    --default-background-color=00000000 --window-size="$1,$1" --screenshot=/w/out.png file:///w/p.html >/dev/null 2>&1
  cp "$WORK/out.png" "../public/$3"
  echo "wrote public/$3"
}
shot 192 "$(page 192 "$SVG")" pwa-192x192.png
shot 512 "$(page 512 "$SVG")" pwa-512x512.png
shot 512 "$(page 512 "$(printf '%s' "$FULL" | sed 's/SCALE/0.82/')")" maskable-icon-512x512.png
shot 180 "$(page 180 "$(printf '%s' "$FULL" | sed 's/SCALE/1/')")" apple-touch-icon-180x180.png
rm -rf "$WORK"
