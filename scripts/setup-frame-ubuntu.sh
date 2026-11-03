#!/usr/bin/env bash
#
# Turns an Ubuntu desktop (GNOME) into a frame. Run it once, then log in again or reboot.
# The screen shows a pairing code.
#
#   curl -fsSL https://raw.githubusercontent.com/cschweda/openmantel/main/scripts/setup-frame-ubuntu.sh | FRAME_URL=https://photos.example.com bash
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
BIN="$HOME/.local/bin/openmantel-frame"
AUTOSTART="$HOME/.config/autostart/openmantel-frame.desktop"

BROWSER="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
if [[ -z "$BROWSER" ]]; then
  sudo snap install chromium
  BROWSER="$(command -v chromium)"
fi

mkdir -p "$(dirname "$BIN")" "$(dirname "$AUTOSTART")"

# Remove what an install from before the OpenMantel rename left behind.
pkill -f "$HOME/.local/bin/pictures-frame" 2>/dev/null || true
rm -f "$HOME/.local/bin/pictures-frame" "$HOME/.config/autostart/pictures-frame.desktop"

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
Name=OpenMantel frame
Exec=$BIN
X-GNOME-Autostart-enabled=true
DESKTOP

# A frame must never blank, lock, or sleep.
gsettings set org.gnome.desktop.session idle-delay 0
gsettings set org.gnome.desktop.screensaver lock-enabled false
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type nothing
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-battery-type nothing

echo "Frame set up for $FRAME_URL. Turn on automatic login in Settings, then reboot."
