#!/usr/bin/env bash
#
# Turns a Raspberry Pi (Pi OS Bookworm or Trixie, Wayland/labwc) into a frame.
# Run it once on the Pi, then reboot. The screen shows a pairing code.
#
#   curl -fsSL https://raw.githubusercontent.com/cschweda/metaincognita-pictures/main/scripts/setup-frame.sh | bash
#
# Override the site with FRAME_URL=https://example.com
#
set -Eeuo pipefail

FRAME_URL="${FRAME_URL:-https://pictures.metaincognita.com}"
SERVICE=pictures-frame.service
SERVICE_DIR="$HOME/.config/systemd/user"
AUTOSTART="$HOME/.config/labwc/autostart"

BROWSER="$(command -v chromium || command -v chromium-browser || true)"
if [[ -z "$BROWSER" ]]; then
  sudo apt-get update
  sudo apt-get install -y chromium
  BROWSER="$(command -v chromium)"
fi

mkdir -p "$SERVICE_DIR" "$(dirname "$AUTOSTART")"

# Restart=always, so a browser crash can't leave a black screen.
cat > "$SERVICE_DIR/$SERVICE" <<UNIT
[Unit]
Description=pictures frame
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
