#!/bin/bash
# BOLBOT setup for Apple Silicon Macs. Safe to run again: finished steps are skipped.
set -euo pipefail
cd "$(dirname "$0")"

MODEL_REPO=mlx-community/translategemma-4b-it-4bit
MODEL_DIR=$HOME/.omlx/models/translategemma-4b-it-4bit
OMLX_PYTHON=$HOME/.omlx/bin/omlx-cluster-python
API=https://discord.com/api/v10
# Manage Roles, Manage Channels, Manage Webhooks, View Channels, Send Messages, Read Message History
PERMISSIONS=805374992

step() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '\n  \033[31m✗\033[0m %s\n\n' "$*" >&2; exit 1; }

env_get() { [ -f .env ] && sed -n "s/^$1=//p" .env | head -1 || true; }
env_set() {
  K="$1" V="$2" awk 'BEGIN { k = ENVIRON["K"]; v = ENVIRON["V"]; done = 0 }
    index($0, k "=") == 1 { if (!done) { print k "=" v; done = 1 } next }
    { print }
    END { if (!done) print k "=" v }' .env > .env.new
  mv .env.new .env
  chmod 600 .env
}
# Calls Discord as the bot. The token goes in on stdin, so it never shows in the process list.
discord() { printf 'Authorization: Bot %s\n' "$(env_get DISCORD_BOT_TOKEN)" | curl -fsS -A 'DiscordBot (https://github.com/ManveerAnand/BOLBOT, 1.0)' -H @- "$API$1"; }
discord_status() { printf 'Authorization: Bot %s\n' "$(env_get DISCORD_BOT_TOKEN)" | curl -s -o /dev/null -w '%{http_code}' -A 'DiscordBot (https://github.com/ManveerAnand/BOLBOT, 1.0)' -H @- "$API$1"; }
json() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log(eval(process.argv[1]))})' "$1"; }

step "1/6  Checking your Mac"
[ "$(uname -s)" = Darwin ] && [ "$(uname -m)" = arm64 ] || fail "BOLBOT needs a Mac with Apple Silicon (M1 or newer)."
case "$PWD" in
  "$HOME"/Documents/* | "$HOME"/Desktop/* | "$HOME"/Downloads/*)
    fail "macOS won't let BOLBOT run in the background from $PWD. Move the folder to your home folder, then run setup again:
     mv \"$PWD\" ~/BOLBOT && ~/BOLBOT/setup.sh" ;;
esac
ok "Apple Silicon Mac"

step "2/6  Node.js"
node_ok() { command -v node >/dev/null && node -e 'process.exit(+process.versions.node.split(".")[0] >= 22 ? 0 : 1)' 2>/dev/null; }
node_ok || PATH=/opt/homebrew/opt/node@24/bin:$PATH
if ! node_ok; then
  command -v brew >/dev/null || fail "Install Homebrew from https://brew.sh, then run ./setup.sh again."
  echo "  Installing Node.js with Homebrew…"
  brew install node@24 >/dev/null
  PATH=$(brew --prefix node@24)/bin:$PATH
fi
node_ok || fail "Node.js 22 or newer is needed. Install it from https://nodejs.org and run ./setup.sh again."
NODE_BIN=$(command -v node)
ok "Node.js $(node -v)"
echo "  Installing BOLBOT's parts…"
npm ci --no-audit --no-fund --loglevel=error >/dev/null
ok "Ready"

step "3/6  Translation model"
if [ ! -x "$OMLX_PYTHON" ]; then
  app=$(ls -d "$HOME/Applications/oMLX.app" /Applications/oMLX.app 2>/dev/null | head -1 || true)
  [ -n "$app" ] || fail "BOLBOT translates with oMLX, a free app. Download it from https://github.com/jundot/omlx/releases, drag it to Applications, then run ./setup.sh again."
  open "$app"
  for _ in $(seq 1 30); do [ -x "$OMLX_PYTHON" ] && break; sleep 2; done
  [ -x "$OMLX_PYTHON" ] || fail "oMLX didn't finish starting. Open it once from Applications, then run ./setup.sh again."
fi
ok "oMLX installed"
if [ ! -f "$MODEL_DIR/config.json" ]; then
  echo "  Downloading the translation model (about 2 GB, once)…"
  "$OMLX_PYTHON" -c 'import sys; from huggingface_hub import snapshot_download; snapshot_download(sys.argv[1], local_dir=sys.argv[2])' "$MODEL_REPO" "$MODEL_DIR" >/dev/null
fi
ok "Model downloaded"

step "4/6  Your Discord bot"
[ -f .env ] || { cp .env.example .env; chmod 600 .env; }
if [ -z "$(env_get DISCORD_BOT_TOKEN)" ]; then
  cat <<'EOF'
  BOLBOT runs as your own Discord bot. Making one takes a minute:
    1. Open https://discord.com/developers/applications and click New Application.
    2. Name it (for example BOLBOT), then open the Bot page.
    3. Turn on Message Content Intent and click Save.
    4. Click Reset Token and copy the token.
EOF
  read -r -s -p "  Paste the bot token (it stays hidden): " token; echo
  [ -n "$token" ] || fail "No token entered. Run ./setup.sh again when you have it."
  env_set DISCORD_BOT_TOKEN "$token"
  unset token
fi
if ! app=$(discord /applications/@me 2>/dev/null); then
  if [ "$(discord_status /applications/@me)" = 401 ]; then
    env_set DISCORD_BOT_TOKEN ""
    fail "Discord didn't accept that token. Copy it again from the Bot page and run ./setup.sh again."
  fi
  fail "Couldn't reach Discord. Check your internet connection and run ./setup.sh again."
fi
# 1<<18 and 1<<19 are Discord's flags for the Message Content intent.
until [ "$(printf '%s' "$app" | json '(j.flags & (1<<18 | 1<<19)) ? 1 : 0')" = 1 ]; do
  read -r -p "  Turn on Message Content Intent on the Bot page, click Save, then press Enter. " _
  app=$(discord /applications/@me)
done
env_set DISCORD_CLIENT_ID "$(printf '%s' "$app" | json 'j.id')"
ok "Bot \"$(printf '%s' "$app" | json 'j.name')\" connected"

step "5/6  Add the bot to your server"
if [ -z "$(env_get DISCORD_GUILD_ID)" ]; then
  invite="https://discord.com/oauth2/authorize?client_id=$(env_get DISCORD_CLIENT_ID)&scope=bot%20applications.commands&permissions=$PERMISSIONS"
  echo "  Opening the invite page. Pick your server and click Authorize."
  echo "  If it doesn't open: $invite"
  open "$invite" 2>/dev/null || true
  while :; do
    read -r -p "  Press Enter once the bot is in your server. " _
    guilds=$(discord /users/@me/guilds)
    count=$(printf '%s' "$guilds" | json 'j.length')
    [ "$count" -gt 0 ] && break
    echo "  The bot isn't in a server yet."
  done
  pick=0
  if [ "$count" -gt 1 ]; then
    printf '%s' "$guilds" | json 'j.map((g,i)=>`    ${i+1}. ${g.name}`).join("\n")'
    read -r -p "  Which server should BOLBOT translate? Number: " n
    pick=$((n - 1))
  fi
  env_set DISCORD_GUILD_ID "$(printf '%s' "$guilds" | json "j[$pick].id")"
fi
ok "Server chosen"
npm run -s db:migrate >/dev/null
ok "Database ready"

step "6/6  Start BOLBOT"
read -r -p "  Start BOLBOT now and keep it running whenever this Mac is on? [Y/n] " yes
if [[ "$yes" =~ ^[Nn] ]]; then
  cat <<EOF
  To start it yourself, run these in two Terminal windows:
    $OMLX_PYTHON -m omlx.cli serve --host 127.0.0.1 --port 8000
    cd "$PWD" && npm start
EOF
  exit 0
fi
# The oMLX app would hold the model's port, so BOLBOT runs the model in the background itself.
osascript -e 'quit app "oMLX"' >/dev/null 2>&1 || true
echo "  macOS will ask for your Mac password to set up the background service."
seen=$(wc -l < logs/bot.log 2>/dev/null || echo 0)
sudo NODE_BIN="$NODE_BIN" deploy/macos/install.sh >/dev/null
echo "  Waiting for BOLBOT to come online…"
online() { tail -n +$((seen + 1)) logs/bot.log 2>/dev/null | grep -q discord_ready; }
for _ in $(seq 1 60); do online && break; sleep 2; done
online || fail "BOLBOT didn't come online. Check logs/bot.log for the reason."
ok "BOLBOT is online"

cat <<'EOF'

  You're set. In your Discord server:
    1. /translator room-create  to make a room, for example "general"
    2. /translator language-enable  for each language your friends speak
    3. /translator welcome  in a channel everyone sees, so people can pick their language

EOF
