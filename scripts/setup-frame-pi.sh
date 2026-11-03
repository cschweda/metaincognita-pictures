#!/usr/bin/env bash
#
# Turns a Raspberry Pi (Pi OS Bookworm or Trixie, Wayland/labwc) into a frame.
# Run it once on the Pi, then reboot. The screen shows a pairing code.
#
#   curl -fsSL https://raw.githubusercontent.com/cschweda/openmantel/main/scripts/setup-frame-pi.sh | FRAME_URL=https://photos.example.com bash
#
# FRAME_URL is the address of your OpenMantel server.
#
set -Eeuo pipefail

: "${FRAME_URL:?Set FRAME_URL to the address of your OpenMantel server}"

# These values are written into launch files and scripts, so anything but a plain address is refused.
if [[ ! "$FRAME_URL" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._~/-]*)?$ ]]; then
  echo "FRAME_URL must be a plain address such as https://photos.example.com"
  exit 1
fi
SERVICE=openmantel-frame.service
OLD_SERVICE=pictures-frame.service
SERVICE_DIR="$HOME/.config/systemd/user"
AUTOSTART="$HOME/.config/labwc/autostart"

BROWSER="$(command -v chromium || command -v chromium-browser || true)"
if [[ -z "$BROWSER" ]]; then
  sudo apt-get update
  sudo apt-get install -y chromium
  BROWSER="$(command -v chromium)"
fi

mkdir -p "$SERVICE_DIR" "$(dirname "$AUTOSTART")"

# Remove the service an install from before the OpenMantel rename left behind.
systemctl --user stop "$OLD_SERVICE" 2>/dev/null || true
rm -f "$SERVICE_DIR/$OLD_SERVICE"
[[ -f "$AUTOSTART" ]] && sed -i "/$OLD_SERVICE/d" "$AUTOSTART"

# Restart=always, so a browser crash can't leave a black screen.
cat > "$SERVICE_DIR/$SERVICE" <<UNIT
[Unit]
Description=OpenMantel frame
After=graphical-session.target

[Service]
ExecStart=$BROWSER --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --overscroll-history-navigation=0 --autoplay-policy=no-user-gesture-required --ozone-platform=wayland $FRAME_URL
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT

START_LINE="systemctl --user import-environment WAYLAND_DISPLAY XDG_RUNTIME_DIR; systemctl --user restart $SERVICE &"
touch "$AUTOSTART"
grep -qF "$SERVICE" "$AUTOSTART" || echo "$START_LINE" >> "$AUTOSTART"

systemctl --user daemon-reload 2>/dev/null || true

# Screen blanking would turn the frame off. raspi-config only exists on Pi OS.
if command -v raspi-config >/dev/null; then
  sudo raspi-config nonint do_blanking 1
fi

echo "Frame set up for $FRAME_URL. Turn on desktop auto-login in raspi-config if it isn't on, then reboot."
