#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/marketing"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

W=2480
H=3508
BG="$ROOT_DIR/kiosk/public/bg.jpg"
QR="$OUT_DIR/qr-apa-v1.png"
PNG="$OUT_DIR/apa-a4-poster-es-en.png"
PDF="$OUT_DIR/apa-a4-poster-es-en.pdf"

FONT_REGULAR="/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_BLACK="/System/Library/Fonts/Supplemental/Arial Black.ttf"

make_text() {
  local out="$1"
  local width="$2"
  local height="$3"
  local font="$4"
  local size="$5"
  local color="$6"
  local gravity="$7"
  local spacing="$8"
  local text="$9"

  magick \
    -background none \
    -fill "$color" \
    -font "$font" \
    -pointsize "$size" \
    -interline-spacing "$spacing" \
    -size "${width}x${height}" \
    -gravity "$gravity" \
    caption:"$text" \
    "$out"
}

magick "$BG" \
  -auto-orient \
  -resize "${W}x${H}^" \
  -gravity center \
  -extent "${W}x${H}" \
  -modulate 106,110,100 \
  "$TMP_DIR/base.png"

magick "$TMP_DIR/base.png" \
  \( -size "${W}x${H}" gradient:'rgba(4,10,20,0.15)'-'rgba(3,8,16,0.92)' \) \
  -compose over -composite \
  \( -size "${W}x${H}" xc:'rgba(4,12,24,0.18)' \) \
  -compose over -composite \
  "$TMP_DIR/poster.png"

magick "$TMP_DIR/poster.png" \
  -fill 'rgba(5,14,28,0.72)' -stroke 'rgba(255,255,255,0.26)' -strokewidth 4 \
  -draw 'roundrectangle 110,106 2370,3388 92,92' \
  -fill 'rgba(255,255,255,0.14)' -stroke 'rgba(255,255,255,0.28)' -strokewidth 3 \
  -draw 'roundrectangle 154,154 2326,475 58,58' \
  -fill 'rgba(255,255,255,0.12)' -stroke 'rgba(255,255,255,0.22)' -strokewidth 3 \
  -draw 'roundrectangle 154,1688 2326,2478 54,54' \
  -fill 'rgba(11,29,48,0.76)' -stroke 'rgba(255,255,255,0.23)' -strokewidth 3 \
  -draw 'roundrectangle 154,2550 1536,3262 54,54' \
  -fill 'rgba(255,255,255,0.96)' -stroke 'rgba(255,255,255,0.45)' -strokewidth 4 \
  -draw 'roundrectangle 1610,2550 2326,3262 54,54' \
  "$TMP_DIR/poster.png"

make_text "$TMP_DIR/brand.png" 2050 80 "$FONT_BOLD" 48 '#dce9f7' center 8 \
  "CGGALLERY, ANTARCTICA"
make_text "$TMP_DIR/headline.png" 2050 300 "$FONT_BLACK" 120 '#ffffff' center 4 \
  "HABLA CON APA\nTALK TO APA"
make_text "$TMP_DIR/subtitle.png" 1960 170 "$FONT_REGULAR" 46 '#e5f3ff' center 6 \
  "Un pingüino guía con voz para descubrir Antarctica, VR y la galería.\nA voice penguin guide for Antarctica, VR and the gallery."

make_text "$TMP_DIR/offer.png" 1950 180 "$FONT_BOLD" 58 '#ffffff' center 7 \
  "Escanea el QR y prueba la demo\nScan the QR and try the live demo"

make_text "$TMP_DIR/steps_title.png" 2000 80 "$FONT_BLACK" 54 '#ffffff' center 4 \
  "Cómo funciona / How it works"
make_text "$TMP_DIR/step1.png" 620 210 "$FONT_BOLD" 44 '#ffffff' center 4 \
  "1\nElige tu idioma\nChoose your language"
make_text "$TMP_DIR/step2.png" 620 210 "$FONT_BOLD" 44 '#ffffff' center 4 \
  "2\nMantén pulsado\nHold to talk"
make_text "$TMP_DIR/step3.png" 620 210 "$FONT_BOLD" 44 '#ffffff' center 4 \
  "3\nPregunta a Apa\nAsk Apa"

make_text "$TMP_DIR/es_title.png" 560 72 "$FONT_BLACK" 42 '#ffffff' west 2 \
  "ESPAÑOL"
make_text "$TMP_DIR/es_body.png" 560 520 "$FONT_REGULAR" 32 '#e9f5ff' west 7 \
  "Pregunta por VR, entradas, zona de fotos y regalos.\n\nJuega: mito o verdad, test antártico y elige tu expedición.\n\nLa entrada estándar incluye 2 experiencias VR.\n\nMaxi añade 5 VR, Ice Cube Challenge y el audio cuento."

make_text "$TMP_DIR/en_title.png" 560 72 "$FONT_BLACK" 42 '#ffffff' west 2 \
  "ENGLISH"
make_text "$TMP_DIR/en_body.png" 560 520 "$FONT_REGULAR" 32 '#e9f5ff' west 7 \
  "Ask about virtual reality, tickets, the photo zone and gifts.\n\nPlay: myth or truth, Antarctic test and choose your expedition.\n\nThe standard ticket includes 1 virtual reality episode per person.\n\nMaxi adds 5 virtual reality episodes, Ice Cube Challenge and the audio tale."

make_text "$TMP_DIR/qr_title.png" 610 115 "$FONT_BLACK" 48 '#07101c' center 2 \
  "LIVE DEMO"
make_text "$TMP_DIR/qr_url.png" 610 95 "$FONT_BOLD" 34 '#12324e' center 2 \
  "apa-v1.pages.dev"
make_text "$TMP_DIR/footer.png" 1320 120 "$FONT_BOLD" 39 '#dce9f7' center 5 \
  "CGGallery, Antarctica  •  50 m from Església de Sant Romà"

magick "$QR" -resize 470x470 -bordercolor white -border 24 "$TMP_DIR/qr.png"

magick "$TMP_DIR/poster.png" \
  "$TMP_DIR/brand.png" -gravity northwest -geometry +215+185 -compose over -composite \
  "$TMP_DIR/headline.png" -gravity northwest -geometry +215+255 -compose over -composite \
  "$TMP_DIR/subtitle.png" -gravity northwest -geometry +260+585 -compose over -composite \
  "$TMP_DIR/offer.png" -gravity northwest -geometry +265+910 -compose over -composite \
  -fill 'rgba(80,190,255,0.92)' -stroke none \
  -draw 'roundrectangle 510,1195 1970,1320 62,62' \
  -fill '#06101d' -font "$FONT_BLACK" -pointsize 50 -gravity northwest \
  -annotate +640+1234 'PROBAR AHORA / TRY NOW' \
  "$TMP_DIR/steps_title.png" -gravity northwest -geometry +240+1540 -compose over -composite \
  -fill 'rgba(52,139,204,0.62)' -stroke 'rgba(255,255,255,0.28)' -strokewidth 3 \
  -draw 'roundrectangle 240,1820 860,2085 42,42' \
  -draw 'roundrectangle 930,1820 1550,2085 42,42' \
  -draw 'roundrectangle 1620,1820 2240,2085 42,42' \
  "$TMP_DIR/step1.png" -gravity northwest -geometry +240+1845 -compose over -composite \
  "$TMP_DIR/step2.png" -gravity northwest -geometry +930+1845 -compose over -composite \
  "$TMP_DIR/step3.png" -gravity northwest -geometry +1620+1845 -compose over -composite \
  "$TMP_DIR/es_title.png" -gravity northwest -geometry +250+2600 -compose over -composite \
  "$TMP_DIR/es_body.png" -gravity northwest -geometry +250+2680 -compose over -composite \
  "$TMP_DIR/en_title.png" -gravity northwest -geometry +910+2600 -compose over -composite \
  "$TMP_DIR/en_body.png" -gravity northwest -geometry +910+2680 -compose over -composite \
  "$TMP_DIR/qr_title.png" -gravity northwest -geometry +1660+2590 -compose over -composite \
  "$TMP_DIR/qr.png" -gravity northwest -geometry +1708+2704 -compose over -composite \
  "$TMP_DIR/qr_url.png" -gravity northwest -geometry +1662+3228 -compose over -composite \
  "$TMP_DIR/footer.png" -gravity northwest -geometry +580+3300 -compose over -composite \
  -density 300 \
  "$PNG"

magick "$PNG" -units PixelsPerInch -density 300 "$PDF" || true

echo "$PNG"
echo "$PDF"
