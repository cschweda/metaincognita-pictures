#!/usr/bin/env bash
#
# Turns a Mac into a frame. Run it once while logged in. The screen shows a pairing code.
#
#   curl -fsSL https://raw.githubusercontent.com/cschweda/metaincognita-pictures/main/scripts/setup-frame-mac.sh | FRAME_URL=https://pictures.example.com bash
#
# Chrome runs full screen in its own profile, so your normal Chrome is left alone. Chrome restarts
# if it crashes or quits, so Cmd-Q won't stop the frame. To stop it, run this script with --remove.
#
# FRAME_URL is the address of your pictures server.
#
set -Eeuo pipefail

FRAME_URL="${FRAME_URL:-}"
LABEL=com.metaincognita.pictures-frame
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PROFILE="$HOME/Library/Application Support/pictures-frame"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DOMAIN="gui/$(id -u)"

if [[ "${1:-}" == "--remove" ]]; then
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Frame removed. Its profile is still at $PROFILE."
  exit 0
fi

if [[ -z "$FRAME_URL" ]]; then
  echo "Set FRAME_URL to the address of your pictures server."
  exit 1
fi

if [[ ! -x "$CHROME" ]]; then
  echo "Google Chrome is required. Install it from https://www.google.com/chrome/, then run this again."
  exit 1
fi

mkdir -p "$(dirname "$PLIST")" "$PROFILE"

# caffeinate keeps the display and the Mac awake for as long as Chrome runs.
cat > "$PLIST" <<PLIST_XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string>
    <string>-dims</string>
    <string>$CHROME</string>
    <string>--kiosk</string>
    <string>--user-data-dir=$PROFILE</string>
    <string>--no-first-run</string>
    <string>--no-default-browser-check</string>
    <string>--noerrdialogs</string>
    <string>--disable-infobars</string>
    <string>--disable-session-crashed-bubble</string>
    <string>--overscroll-history-navigation=0</string>
    <string>$FRAME_URL</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
</dict>
</plist>
PLIST_XML

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"

# A screen saver would cover the photos.
defaults -currentHost write com.apple.screensaver idleTime -int 0

cat <<DONE
Frame running at $FRAME_URL. Approve the code on your phone with Pair a frame.

For a frame that survives power cuts, also do these once:
  sudo pmset -a autorestart 1
  System Settings > Users & Groups > Automatically log in as
  (Automatic login needs FileVault to be off.)

To stop the frame: bash setup-frame-mac.sh --remove
DONE
