#!/usr/bin/env bash
#
# Turns a Mac into a frame. Run it once while logged in. The screen shows a pairing code.
#
#   curl -fsSL https://raw.githubusercontent.com/cschweda/openmantel/main/scripts/setup-frame-mac.sh | FRAME_URL=https://photos.example.com bash
#
# To stop the frame later:
#
#   curl -fsSL https://raw.githubusercontent.com/cschweda/openmantel/main/scripts/setup-frame-mac.sh | bash -s -- --remove
#
# Chrome runs full screen in its own profile, so your normal Chrome is left alone. Chrome restarts
# if it crashes or quits, so Cmd-Q won't stop the frame. To stop it, run this script with --remove.
#
# FRAME_URL is the address of your OpenMantel server. To turn the monitor off overnight, also set
# SLEEP_START and SLEEP_END, for example SLEEP_START=22:30 SLEEP_END=06:30.
#
set -Eeuo pipefail

FRAME_URL="${FRAME_URL:-}"
LABEL=com.openmantel.frame
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PROFILE="$HOME/Library/Application Support/openmantel-frame"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DOMAIN="gui/$(id -u)"
SLEEP_LABEL=$LABEL.display-off
WAKE_LABEL=$LABEL.display-on
SLEEP_PLIST="$HOME/Library/LaunchAgents/$SLEEP_LABEL.plist"
WAKE_PLIST="$HOME/Library/LaunchAgents/$WAKE_LABEL.plist"

# Names used before the OpenMantel rename.
OLD_LABEL=com.metaincognita.pictures-frame
OLD_PROFILE="$HOME/Library/Application Support/pictures-frame"

# Stops and deletes the agents an install from before the rename left behind.
remove_old_agents() {
  for label in "$OLD_LABEL" "$OLD_LABEL.display-off" "$OLD_LABEL.display-on"; do
    launchctl bootout "$DOMAIN/$label" 2>/dev/null || true
    rm -f "$HOME/Library/LaunchAgents/$label.plist"
  done
}

# Writes a LaunchAgent that runs one command at HH:MM every day.
daily_agent() {
  local label=$1 path=$2 time=$3 command=$4
  cat > "$path" <<AGENT
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>$command</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>$((10#${time%%:*}))</integer>
    <key>Minute</key>
    <integer>$((10#${time##*:}))</integer>
  </dict>
</dict>
</plist>
AGENT
  launchctl bootout "$DOMAIN/$label" 2>/dev/null || true
  launchctl bootstrap "$DOMAIN" "$path"
}

if [[ "${1:-}" == "--remove" ]]; then
  for label in "$LABEL" "$SLEEP_LABEL" "$WAKE_LABEL"; do
    launchctl bootout "$DOMAIN/$label" 2>/dev/null || true
  done
  rm -f "$PLIST" "$SLEEP_PLIST" "$WAKE_PLIST"
  remove_old_agents
  echo "Frame removed. Its profile is still at $PROFILE."
  exit 0
fi

if [[ -z "$FRAME_URL" ]]; then
  echo "Set FRAME_URL to the address of your OpenMantel server."
  exit 1
fi

# These values are written into launch files and scripts, so anything but a plain address is refused.
if [[ ! "$FRAME_URL" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._~/-]*)?$ ]]; then
  echo "FRAME_URL must be a plain address such as https://photos.example.com"
  exit 1
fi
for value in "${SLEEP_START:-}" "${SLEEP_END:-}"; do
  if [[ -n "$value" && ! "$value" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]; then
    echo "SLEEP_START and SLEEP_END must be times such as 22:30"
    exit 1
  fi
done

if [[ ! -x "$CHROME" ]]; then
  echo "Google Chrome is required. Install it from https://www.google.com/chrome/, then run this again."
  exit 1
fi

remove_old_agents
# The old profile holds the pairing, so keep it rather than pairing again.
if [[ -d "$OLD_PROFILE" && ! -e "$PROFILE" ]]; then
  mv "$OLD_PROFILE" "$PROFILE"
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

if [[ -n "${SLEEP_START:-}" && -n "${SLEEP_END:-}" ]]; then
  daily_agent "$SLEEP_LABEL" "$SLEEP_PLIST" "$SLEEP_START" "pmset displaysleepnow"
  daily_agent "$WAKE_LABEL" "$WAKE_PLIST" "$SLEEP_END" "caffeinate -u -t 5"
fi

# A screen saver would cover the photos.
defaults -currentHost write com.apple.screensaver idleTime -int 0

cat <<DONE
Frame running at $FRAME_URL. Approve the code on your phone with Pair a frame.

The frame starts when you log in. With FileVault on, a Mac waits for your password after a
power cut, so keep a keyboard handy, or use a small battery backup.

To stop the frame:
  curl -fsSL https://raw.githubusercontent.com/cschweda/openmantel/main/scripts/setup-frame-mac.sh | bash -s -- --remove
DONE
