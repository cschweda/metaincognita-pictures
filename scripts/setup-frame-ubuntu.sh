#!/usr/bin/env bash
#
# Turns an Ubuntu desktop (GNOME) into a frame. Run it once, then log in again or reboot.
# The screen shows a pairing code.
#
#   curl -fsSL https://raw.githubusercontent.com/cschweda/metaincognita-pictures/main/scripts/setup-frame-ubuntu.sh | FRAME_URL=https://pictures.example.com bash
#
# FRAME_URL is the address of your pictures server.
#
set -Eeuo pipefail

: "${FRAME_URL:?Set FRAME_URL to the address of your pictures server}"
BIN="$HOME/.local/bin/pictures-frame"
AUTOSTART="$HOME/.config/autostart/pictures-frame.desktop"

BROWSER="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
if [[ -z "$BROWSER" ]]; then
  sudo snap install chromium
  BROWSER="$(command -v chromium)"
fi

mkdir -p "$(dirname "$BIN")" "$(dirname "$AUTOSTART")"

# The loop restarts the browser after a crash, so the screen can't stay black.
cat > "$BIN" <<SCRIPT
#!/usr/bin/env bash
while true; do
  "$BROWSER" --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble \\
    --no-first-run --password-store=basic --overscroll-history-navigation=0 "$FRAME_URL"
  sleep 5
done
SCRIPT
chmod +x "$BIN"

cat > "$AUTOSTART" <<DESKTOP
[Desktop Entry]
Type=Application
Name=pictures frame
Exec=$BIN
X-GNOME-Autostart-enabled=true
DESKTOP

# A frame must never blank, lock, or sleep.
gsettings set org.gnome.desktop.session idle-delay 0
gsettings set org.gnome.desktop.screensaver lock-enabled false
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type nothing
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-battery-type nothing

echo "Frame set up for $FRAME_URL. Turn on automatic login in Settings, then reboot."
