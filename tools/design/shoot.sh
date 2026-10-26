#!/bin/sh
# Render a still of the style frame with headless Chrome.
# usage: tools/design/shoot.sh <out.png> "<query string>"   (style-frame server must be running on :5180)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1920,1080 --force-device-scale-factor=1 --virtual-time-budget=4000 \
  --screenshot="$1" "http://127.0.0.1:5180/?$2" >/dev/null 2>&1
