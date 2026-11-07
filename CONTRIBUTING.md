# Contributing to BOLBOT

Thanks for helping. Bug reports, translations that read badly, and pull requests are all welcome.

## Project layout

| Path | What's there |
|---|---|
| `install.ps1`, `setup.ps1` | Windows: the one-line installer and the guided setup |
| `setup.sh` | Mac: the guided setup |
| `deploy/macos/` | Starts the model and the bot at every boot on a Mac |
| `deploy/windows/` | Starts the model and the bot at sign-in on Windows |
| `src/discord/` | Slash commands, events, roles, channels and webhooks |
| `src/messages/` | The pipeline that copies each message into every language view |
| `src/translation/` | Talking to the local model (oMLX or Ollama), the queue and the cache |
| `src/language/` | Language detection and the list of supported languages |
| `src/rooms/` | Creating rooms and their language channels |
| `src/database/` | SQLite access, one repository per table |
| `migrations/` | Database migrations, applied in order |
| `scripts/` | Developer tools: model tests, benchmarks, command registration, the README animations |
| `tests/` | Unit tests, mirroring `src/` |
| `docs/` | The [advanced guide](docs/advanced.md), the [design doc](docs/architecture.md), and images |

## Run it for development

You need Node.js 22 or newer and a model server (oMLX on a Mac, Ollama on Windows). The easiest start is the normal setup for your system, then:

```bash
npm test           # unit tests
npm run build      # type check and compile
npm start          # run the bot in this terminal
```

To try the model without Discord:

```bash
npm run model:test -- --from tr --to en --text "Bu akşam oyun var mı?"
```

To redraw the README animations after changing `scripts/make-demo.py`:

```bash
python scripts/make-demo.py
```

## Ground rules

These keep BOLBOT private and reliable. Pull requests that break them won't be merged.

- **No cloud translation.** The model runs on the user's own machine, and the model server listens on `127.0.0.1` only.
- **No message text on disk.** SQLite stores Discord IDs and sync data only, and logs never contain message text or secrets.
- **Keep layers apart.** Discord handlers stay thin, model code stays behind `TranslationProvider`, and SQL stays inside the repositories.
- **Every network call has a timeout and error handling**, and every queued job is safe to run twice.
- **Edits can arrive out of order.** Never let a stale edit overwrite a newer one.

## Before you open a pull request

- `npm run build` and `npm test` pass. CI runs both.
- New behaviour has a test.
- If you add a language, add it to `src/language/registry.ts` and check it with `npm run model:test`.

## Adding a language

1. Add an entry to `SUPPORTED_LANGUAGES` in `src/language/registry.ts`.
2. Check the model handles it in both directions with `npm run model:test`.
3. Add a line to the registry test.
