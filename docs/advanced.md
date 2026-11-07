# BOLBOT: advanced guide

For people who want to set things up by hand, change the code, or remove BOLBOT. Most people only need `./setup.sh` from the [README](../README.md).

## How it works

- **Rooms and views.** A room such as `general` gets one channel per enabled language: `general-en`, `general-zh`, `general-tr` and so on.
- **Pick a language once.** Members click their language on the welcome message, or use `/language set`. The bot gives them that language's role, so they see only their own channels.
- **Write anywhere, read everywhere.** A message in any view is copied into every other view of the room. Same-language views get it as is. Other views get one translation each, posted through a webhook with the author's name.
- **Stays in sync.** Edits update every copy, deleting the original deletes the copies, and replies get a link back to the message they answer. Images, files and stickers come along with the copy.
- **Source language is detected for you**, with fastText plus script checks for short or mixed messages.

## What you need

- An Apple Silicon Mac. 16 GB of memory is enough.
- [Node.js](https://nodejs.org) 22 or newer.
- [oMLX](https://github.com/jundot/omlx) with the model `mlx-community/translategemma-4b-it-4bit` (about 2 GB).
- A Discord application with a bot user and the **Message Content** intent turned on.

## Manual setup

1. Clone the repo and install:

   ```bash
   git clone https://github.com/ManveerAnand/BOLBOT.git
   cd BOLBOT
   npm ci
   cp .env.example .env
   ```

2. Fill in `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID` and `DISCORD_GUILD_ID` in `.env`. The other settings have working defaults.

3. Invite the bot to your server with these permissions: Manage Roles, Manage Channels, Manage Webhooks, View Channels, Send Messages and Read Message History. In Server Settings → Roles, place the bot's role above the `Translator · …` roles so it can hand them out.

4. Start oMLX on `127.0.0.1:8000`, either from the oMLX app or from a terminal:

   ```bash
   ~/.omlx/bin/omlx-cluster-python -m omlx.cli serve --host 127.0.0.1 --port 8000
   ```

5. Prepare the database and start the bot:

   ```bash
   npm run db:migrate
   npm run start
   ```

6. In Discord, as an admin:
   - `/translator room-create` to make a room, for example `general`.
   - `/translator language-enable` for each language you want.
   - `/translator welcome` in a channel everyone can see, so members can pick a language.

## Keep it running on a Mac

`deploy/macos/install.sh` sets up the model and the bot to start at every boot and restart if they crash. It works even when nobody is logged in to the account that owns the folder.

```bash
sudo deploy/macos/install.sh
```

Keep the folder outside Documents, Desktop and Downloads: macOS doesn't let background jobs read those. The script runs the bot as the folder's owner, and writes logs to `logs/bot.log` and `~/.omlx/logs/bolbot-model.log`.

To restart the bot after an update:

```bash
git pull && npm ci && sudo launchctl kickstart -k system/com.bolbot.bot
```

## Commands

| Command | Who | What it does |
|---|---|---|
| `/language set` | Everyone | Choose the language you read and write |
| `/language show` | Everyone | Show your language |
| `/language list` | Everyone | List the languages the bot supports |
| `/translator status` | Admins | Show whether the model and the bot are healthy |
| `/translator room-create` | Admins | Create a room and its language channels |
| `/translator room-list` | Admins | List rooms |
| `/translator language-enable` | Admins | Turn a language on and create its channels |
| `/translator language-disable` | Admins | Turn a language off, keeping its channels |
| `/translator welcome` | Admins | Post the language picker. Post it again after enabling a language |
| `/translator reconcile` | Admins | Repair missing roles, channels and webhooks |

## Privacy

- The model listens on `127.0.0.1` only.
- The database (SQLite) holds Discord IDs and sync data, never message text.
- Message text is held in memory only while it is being translated, and is never written to the logs.
- Webhook tokens are encrypted on disk with a key kept in `data/webhook.key`.

## Development

The project layout, how to run it for development and the ground rules are in [CONTRIBUTING.md](../CONTRIBUTING.md). The full design is in [architecture.md](architecture.md).

## Limits

- Translation quality is that of a small 4B model. It is strongest into English, and other directions can read stiffly.
- One server per running bot (`DISCORD_GUILD_ID`).

## Uninstall

### Windows

```powershell
Unregister-ScheduledTask -TaskName BOLBOT -Confirm:$false
Get-Process ollama -ErrorAction SilentlyContinue | Stop-Process
```

Then delete the folder you installed BOLBOT to. Node.js, Ollama and the model were all inside it. If you already had Ollama, remove the model with `ollama rm translategemma:4b`.

### Mac

```bash
sudo launchctl bootout system/com.bolbot.bot
sudo launchctl bootout system/com.bolbot.model
sudo rm /Library/LaunchDaemons/com.bolbot.bot.plist /Library/LaunchDaemons/com.bolbot.model.plist
rm -rf ~/BOLBOT
```

Then delete the bot in the [Discord Developer Portal](https://discord.com/developers/applications). The model stays in `~/.omlx/models` until you delete it.
