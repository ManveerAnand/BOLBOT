#!/bin/sh
# Runs BOLBOT and its translation model at every boot, as the user who owns this folder.
# Works without anyone logged in to that account. Run it again after moving the folder.
# Usage: sudo deploy/macos/install.sh
set -eu

[ "$(id -u)" = 0 ] || { echo "Run with sudo."; exit 1; }

BOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
RUN_AS=$(stat -f %Su "$BOT_DIR")
HOME_DIR=$(dscl . -read "/Users/$RUN_AS" NFSHomeDirectory | awk '{print $2}')
NODE_BIN=${NODE_BIN:-/opt/homebrew/opt/node@24/bin/node}
OMLX_PYTHON=${OMLX_PYTHON:-$HOME_DIR/.omlx/bin/omlx-cluster-python}
DAEMONS=${DAEMONS:-/Library/LaunchDaemons}

# macOS privacy rules stop background jobs from reading these folders.
case "$BOT_DIR" in
  "$HOME_DIR"/Documents/* | "$HOME_DIR"/Desktop/* | "$HOME_DIR"/Downloads/*)
    echo "Background jobs can't read $BOT_DIR. Move the folder, for example to $HOME_DIR/BOLBOT, and run this again."
    exit 1 ;;
esac
[ -x "$NODE_BIN" ] || { echo "Node not found at $NODE_BIN. Install node@24 or set NODE_BIN."; exit 1; }
[ -x "$OMLX_PYTHON" ] || { echo "oMLX not found at $OMLX_PYTHON. Open the oMLX app once, or set OMLX_PYTHON."; exit 1; }
[ -f "$BOT_DIR/.env" ] || { echo "Create $BOT_DIR/.env from .env.example first."; exit 1; }

mkdir -p "$BOT_DIR/logs"
chown "$RUN_AS" "$BOT_DIR/logs"

# write_job LABEL WORKDIR LOGFILE PROGRAM [ARGS...]
write_job() {
  label=$1 workdir=$2 log=$3
  shift 3
  args=""
  for arg in "$@"; do args="$args<string>$arg</string>"; done
  cat > "$DAEMONS/$label.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$label</string>
  <key>UserName</key><string>$RUN_AS</string>
  <key>ProgramArguments</key><array>$args</array>
  <key>EnvironmentVariables</key><dict>
    <key>HOME</key><string>$HOME_DIR</string>
    <key>PATH</key><string>$(dirname "$NODE_BIN"):/usr/bin:/bin</string>
  </dict>
  <key>WorkingDirectory</key><string>$workdir</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$log</string>
  <key>StandardErrorPath</key><string>$log</string>
</dict></plist>
EOF
  chmod 644 "$DAEMONS/$label.plist"
  plutil -lint "$DAEMONS/$label.plist" >/dev/null
}

write_job com.bolbot.model "$HOME_DIR" "$HOME_DIR/.omlx/logs/bolbot-model.log" \
  "$OMLX_PYTHON" -m omlx.cli serve --host 127.0.0.1 --port 8000
write_job com.bolbot.bot "$BOT_DIR" "$BOT_DIR/logs/bot.log" \
  "$NODE_BIN" "$BOT_DIR/node_modules/tsx/dist/cli.mjs" src/index.ts

[ "$DAEMONS" = /Library/LaunchDaemons ] || { echo "Wrote jobs to $DAEMONS (not loaded)."; exit 0; }

# Stop copies started by hand, so there is never a second bot or a port clash.
pkill -u "$RUN_AS" -f "omlx.cli serve" || true
pkill -u "$RUN_AS" -f "src/index.ts" || true
for label in com.bolbot.model com.bolbot.bot; do
  launchctl bootout "system/$label" 2>/dev/null || true
  launchctl bootstrap system "$DAEMONS/$label.plist"
done
echo "Installed. The model and the bot now start at every boot, as $RUN_AS."
echo "Logs: $BOT_DIR/logs/bot.log and $HOME_DIR/.omlx/logs/bolbot-model.log"
