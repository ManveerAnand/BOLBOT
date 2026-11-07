# BOLBOT

**Your squad speaks five languages. Your Discord doesn't have to choose one.**

BOLBOT translates your Discord server live. Everyone types in their own language and reads everyone else in theirs, under each person's real name. No copy-pasting into a translator, no "English only" rule, nobody left out of the callouts.

It's free, it runs on your own Mac, and your chats never leave it.

[![CI](https://github.com/ManveerAnand/BOLBOT/actions/workflows/ci.yml/badge.svg)](https://github.com/ManveerAnand/BOLBOT/actions/workflows/ci.yml)

## What it feels like

Emre writes in the Turkish channel:

> **Emre:** Bu akşam ranked oynayan var mı?

Everyone else sees it in their own channel, a second later:

> **Emre:** Anyone playing ranked tonight? *(in #general-en)*
>
> **Emre:** 今晚有人打排位吗？ *(in #general-zh)*
>
> **Emre:** Ada yang main ranked malam ini? *(in #general-id)*

Replies, edits, deletes, screenshots and stickers all follow along.

## Why BOLBOT

- **Free, for good.** No subscription and no API bill. The translator runs on your Mac.
- **Private.** Messages are translated on your machine and never saved. Nothing goes to a cloud translator.
- **Feels native.** Translations show up as the person who wrote them, not as a bot.
- **12 languages.** English, Chinese, Indonesian, Japanese, Korean, Spanish, French, German, Hindi, Portuguese, Russian and Turkish.
- **Set and forget.** It starts with your Mac and restarts itself if anything goes wrong.

## Get started

You need a Mac with Apple Silicon (M1 or newer), a Discord server where you're an admin, and about 10 minutes.

**1. Install the free oMLX app** from [its releases page](https://github.com/jundot/omlx/releases) and drag it into Applications. It's what runs the translator.

**2. Open Terminal and paste this:**

```bash
git clone https://github.com/ManveerAnand/BOLBOT.git ~/BOLBOT && ~/BOLBOT/setup.sh
```

If your Mac asks to install developer tools first, click Install, then paste the line again.

Setup walks you through the rest:

- installs what BOLBOT needs and downloads the translator (about 2 GB, once)
- shows you how to make your Discord bot and checks the token works
- opens the invite page so you can add the bot to your server
- starts BOLBOT and keeps it running whenever your Mac is on

**3. In your Discord server, run three commands:**

| Command | What it does |
|---|---|
| `/translator room-create` | Makes a room, for example `general`, with a channel for each language |
| `/translator language-enable` | Turns on a language. Run it once per language your friends speak |
| `/translator welcome` | Posts the language picker in a channel everyone can see |

That's it. Friends click their language once and they're in.

## FAQ

**Does it cost anything?**
No. BOLBOT and the translator are free, and there's no hosting to pay for.

**Does my Mac need to stay on?**
Yes, BOLBOT works while your Mac is awake. For a server that's always on, stop the Mac sleeping in System Settings → Energy.

**What about Windows?**
Not yet. The translator currently needs an Apple Silicon Mac. Watch the repo to hear when Windows lands.

**How good are the translations?**
Great for everyday chat and game talk, and strongest into English. Slang and very short messages can come out a little stiff.

**Are my messages stored?**
No. BOLBOT keeps only the IDs it needs to match up copies. The text is translated in memory and forgotten.

**How many languages can I turn on?**
Up to 8 at once. Every extra language means one more translation per message, so turn on the ones your friends actually use.

**How do I update it?**

```bash
cd ~/BOLBOT && git pull && ./setup.sh
```

Manual setup, all the commands, the privacy details and how to uninstall are in the [advanced guide](docs/advanced.md).

## License

Free and open source under the [MIT license](LICENSE). Bug reports and ideas are welcome in [Issues](https://github.com/ManveerAnand/BOLBOT/issues).
