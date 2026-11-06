# Multilingual Discord Translation Layer
## Detailed Architecture & Cursor Implementation Plan

**Version:** 2.0  
**Target deployment:** Private Discord server, ~60 members  
**Host:** Base Apple Mac mini M4, 16 GB unified memory  
**Primary goal:** Make one logical Discord conversation readable in each member's preferred language with automatic translation, while keeping message text out of the local database.

---

## 0. Executive Summary

This project is **not** a normal "translate this message" Discord bot.

The intended product is a **multilingual conversation synchronization layer**:

- A member chooses their preferred language once.
- They participate in normal Discord text chat.
- Other members may use different languages.
- Each member sees the shared conversation in their own preferred language.
- Translation happens automatically.
- The system translates **once per required target language**, not once per user.
- Discord stores the actual original and translated messages.
- The Mac mini stores only:
  - member language preferences;
  - logical-room configuration;
  - Discord channel/message/webhook IDs;
  - synchronization metadata;
  - retry/job metadata that contains IDs, not message text.
- No paid translation API is required.
- The translation model runs locally on the M4 Mac mini.

Because Discord does **not** allow one channel message to have different content for different viewers, this must be implemented as **multiple hidden language-specific Discord channel views that together represent one logical room**.

Example:

```text
Logical room: #general

Physical Discord views:

#general-en  -> visible to English-preferring members
#general-id  -> visible to Indonesian-preferring members
#general-zh  -> visible to Chinese-preferring members
#general-ja  -> visible to Japanese-preferring members
```

A Chinese message entered in `#general-zh` remains there as the original. The bot translates it once into each required target language and posts synchronized copies into `#general-en`, `#general-id`, and `#general-ja`.

To normal members, only the channel for their selected language is visible, so the result behaves like one multilingual room.

---

# 1. Product Requirements

## 1.1 Core user experience

A member should configure their preferred language once:

```text
/language set English
```

or:

```text
/language set Indonesian
```

After that, the bot should require no translation commands during normal conversation.

Example users:

```text
Chen  -> Chinese
Budi  -> Indonesian
Alex  -> English
Yuki  -> Japanese
```

Chen writes:

```text
今晚有人想一起玩吗？
```

The logical message should appear as:

```text
Chinese view:
今晚有人想一起玩吗？

English view:
Does anyone want to play together tonight?

Indonesian view:
Ada yang mau bermain bersama malam ini?

Japanese view:
今夜一緒に遊ぶ人いる？
```

If Alex replies in English:

```text
I'll join after dinner.
```

the same conversation should continue in every language view.

---

## 1.2 Automatic source-language behavior

A member's **preferred language controls what they receive**, not what they are technically allowed to type.

Therefore:

```text
User preference = target/display language
Detected message language = source language
```

If a member whose preference is English unexpectedly sends Chinese text, source-language detection should identify Chinese.

However, Discord introduces an unavoidable UX caveat:

- the sender's original message is posted directly into their current physical language view;
- other users of that same physical view can see the original immediately;
- the bot cannot secretly render that exact Discord message differently to those viewers.

For V1, assume the normal case:

> Members primarily type in the language they selected as their preferred language.

Still implement source-language detection so translations to other views use the correct source language.

A later optional "normalize mismatched input" mode may delete and repost mismatched-language source messages, but that removes native editability for the sender and is therefore **not recommended for V1**.

---

## 1.3 Automatic target-language behavior

Never translate once per recipient.

Translate once per **active language view**.

Example:

```text
25 English users
15 Indonesian users
10 Chinese users
5 Japanese users
5 Spanish users
```

One Chinese message requires:

```text
Chinese -> English       one inference
Chinese -> Indonesian    one inference
Chinese -> Japanese      one inference
Chinese -> Spanish       one inference
```

It does **not** require 59 inference calls.

---

# 2. Discord Platform Constraint

Discord stores one content value for a normal message. A bot or webhook cannot make the same channel message display differently to different viewers.

Therefore this architecture is intentionally based on:

```text
ONE LOGICAL ROOM
      |
      +-- one physical channel per active language
```

Channel permissions make each normal member see only the physical view corresponding to their preferred language.

Administrators with Discord's Administrator permission may see all physical views. That is expected and should be documented.

---

# 3. Recommended Technology Stack

## 3.1 Discord application

Use:

```text
Node.js 24 LTS
TypeScript
discord.js 14.x
```

Current discord.js 14 releases require a modern Node 24 runtime, so Cursor should not target old Node versions.

Recommended packages:

```text
discord.js
better-sqlite3
zod
p-queue
pino
dotenv
fasttext.wasm.js
lru-cache
```

Development:

```text
typescript
tsx
vitest
eslint
prettier
@types/node
```

Avoid:

```text
React
Next.js
Redis
PostgreSQL
MongoDB
Docker
Kubernetes
```

for V1.

They add no value for a single private server.

---

## 3.2 Translation runtime

Primary model:

```text
google/translategemma-4b-it
```

Preferred Apple Silicon quantization:

```text
mlx-community/translategemma-4b-it-4bit
```

Preferred runtime:

```text
oMLX
```

Reason:

- native Apple Silicon/MLX execution;
- small memory footprint;
- continuous batching;
- OpenAI-compatible local HTTP interface;
- well suited to a permanently loaded local model.

The model service must bind only to localhost:

```text
127.0.0.1
```

Never expose it directly to the LAN or Internet.

---

## 3.3 Why TranslateGemma 4B 4-bit

A published oMLX benchmark on the exact class of machine targeted here:

```text
Apple M4
10 CPU cores
10 GPU cores
16 GB unified memory
TranslateGemma 4B
4-bit
```

reported approximately:

```text
~2.8 GB peak memory at 1K context
~37.5 generated tokens/sec
~53.6 aggregate tokens/sec at batch size 2
```

That makes the 4B model a much better latency/concurrency fit than a 12B model for this Discord workload.

Do not begin V1 with TranslateGemma 12B.

---

# 4. Model Compatibility Spike — Mandatory Before Bot Work

TranslateGemma uses explicit source and target language metadata in its intended chat template.

The first engineering milestone must be:

```text
Text + source language + target language
        |
        v
local model
        |
        v
translation only
```

Before Discord integration, verify the selected oMLX/model combination accepts the required TranslateGemma format correctly.

## 4.1 Required smoke tests

At minimum test:

```text
en -> zh
zh -> en
en -> id
id -> en
zh -> id
id -> zh
en -> ja
ja -> en
```

Use actual casual Discord-like samples, not only formal benchmark sentences.

Examples:

```text
gg guys, I'll be back in 10
这个boss真的太强了
bro are we doing raid tonight?
aku join setelah makan
nahhh that was crazy 💀
```

## 4.2 Generation settings

Translation should be deterministic.

Use equivalent settings to:

```text
temperature = 0
do_sample = false
```

The response must contain only the translation.

No:

```text
Translation:
```

No explanation.

No quotation marks added around the whole output.

## 4.3 Compatibility fallback order

If the standard oMLX OpenAI-compatible endpoint cannot correctly pass TranslateGemma's structured source/target payload:

1. keep the Node application architecture unchanged;
2. modify only the `TranslationProvider`;
3. test a raw completion request using the model's rendered official chat template;
4. test `mlx_lm.server`;
5. if necessary, implement a tiny localhost Python MLX translation adapter that applies the official tokenizer/chat template directly.

Do **not** switch to a paid cloud API merely because the local prompt path requires adaptation.

---

# 5. Source-Language Detection

TranslateGemma expects a source language. Discord messages therefore need a lightweight language detector before translation.

## 5.1 Detector

Recommended V1 detector:

```text
fastText language identification
lid.176.ftz
```

Use a WebAssembly Node wrapper such as:

```text
fasttext.wasm.js
```

This avoids a separate Python process.

The official compressed fastText LID model recognizes 176 languages and is under 1 MB compressed.

## 5.2 Detection philosophy

Language identification on very short Discord messages is inherently uncertain.

Examples:

```text
gg
ok
no
ja
lol
bruh
ayo
```

Do not blindly trust a detector for tiny inputs.

Use a confidence-based policy.

Conceptual algorithm:

```text
naturalText = remove/protect URLs, code, mentions, emoji-only content

if naturalText has fewer than MIN_LANGUAGE_CHARS:
    sourceLanguage = senderPreference

else:
    detection = fastText.detect(naturalText)

    if detection.confidence >= HIGH_CONFIDENCE:
        sourceLanguage = detection.language

    else if detection.language == senderPreference:
        sourceLanguage = senderPreference

    else if script heuristic strongly indicates a language family:
        use detected language when supported

    else:
        sourceLanguage = senderPreference
```

Initial configurable thresholds:

```text
MIN_LANGUAGE_CHARS = 8
HIGH_CONFIDENCE = 0.75
MEDIUM_CONFIDENCE = 0.45
```

These values must be tuned using real server messages.

---

## 5.3 Script heuristics

Add lightweight script checks before/around fastText for obvious cases:

```text
Han characters      -> Chinese candidate
Hiragana/Katakana   -> Japanese candidate
Hangul               -> Korean candidate
Cyrillic             -> Slavic-language candidate
Arabic script        -> Arabic/Persian/etc candidate
Devanagari           -> Hindi/etc candidate
```

Do not attempt to fully identify language using script alone.

Use script checks only as confidence hints.

---

## 5.4 Mixed-language messages

Messages such as:

```text
这个 boss is actually broken lol
```

are expected.

V1 should use the detector's dominant language and translate the whole natural-language string.

Do not split a sentence by detected language in V1.

Mixed-language segmentation is a potential V2 improvement.

---

# 6. Supported-Language Registry

Do not expose all fastText languages automatically.

A target language is supported only when:

1. TranslateGemma accepts the source/target code;
2. the language passed local smoke testing;
3. the application has a normalized internal code for it.

Maintain:

```ts
interface SupportedLanguage {
  internalCode: string;
  displayName: string;
  nativeName: string;
  translateGemmaCode: string;
  fastTextCodes: string[];
  enabledByDefault: boolean;
}
```

Example:

```ts
{
  internalCode: "en",
  displayName: "English",
  nativeName: "English",
  translateGemmaCode: "en",
  fastTextCodes: ["en"],
  enabledByDefault: true
}
```

Do not trust documentation examples alone for every locale code.

Create a build/test script that applies the actual installed model's chat template and verifies each exposed language code.

V1 should explicitly verify at least:

```text
English
Chinese
Indonesian
Japanese
Korean
Spanish
French
German
Hindi
Portuguese
Russian
```

Then expand as needed.

---

# 7. Logical Room Architecture

## 7.1 Core concepts

Define:

```text
Guild
  |
  +-- Logical Room
        |
        +-- Language View EN
        +-- Language View ID
        +-- Language View ZH
        +-- Language View JA
```

A logical room is an application concept.

Discord itself only knows the physical language-view channels.

---

## 7.2 Example

Application database:

```text
Logical room:
name = general
guild = 123

Views:
en -> Discord channel 1001
id -> Discord channel 1002
zh -> Discord channel 1003
ja -> Discord channel 1004
```

Users see only the channels permitted by their language role.

---

# 8. Language Roles & Permissions

Create one bot-managed Discord role per enabled target language:

```text
Translator · English
Translator · Indonesian
Translator · Chinese
Translator · Japanese
```

Properties:

```text
mentionable = false
hoisted = false
no privileged permissions
```

The bot role must be positioned above these roles so it can add/remove them.

For every language view:

```text
@everyone:
  VIEW_CHANNEL = deny

correct language role:
  VIEW_CHANNEL = allow
  SEND_MESSAGES = allow
  READ_MESSAGE_HISTORY = allow

bot role:
  VIEW_CHANNEL = allow
  SEND_MESSAGES = allow
  READ_MESSAGE_HISTORY = allow
  MANAGE_WEBHOOKS = allow where required
```

Do not give translation roles unrelated server permissions.

---

# 9. User Language Preference

Store one preferred target language per guild member.

Command:

```text
/language set <language>
```

Other commands:

```text
/language show
/language list
```

Optional later UX:

- select menu;
- onboarding button;
- welcome-channel language picker.

When language changes:

1. validate selected language;
2. provision language infrastructure if necessary;
3. remove old translator-language role;
4. add new translator-language role;
5. persist preference;
6. confirm ephemerally.

A member should have at most one managed translator-language role.

Do not remove unrelated Discord roles.

---

# 10. Enabled vs Supported Languages

Distinguish:

```text
SUPPORTED language
```

from:

```text
ENABLED language
```

A supported language is one the local translation stack can handle.

An enabled language is one currently provisioned for this Discord server.

This prevents creating 50+ duplicate channel views immediately.

Recommended V1 policy:

- start with server default language;
- enable new languages when an admin enables them or when the first member selects them;
- create that language view for each configured logical room;
- continue maintaining the view while the language remains enabled.

Optional cleanup:

- if no members use a language for 30 days, mark it dormant;
- do not delete automatically in V1;
- allow admin to disable it manually.

No historical backfill is required when a brand-new language is first enabled.

From the moment it is enabled, new messages are synchronized into it.

---

# 11. Physical Channel Naming

Use predictable names for administrators.

Example:

```text
general-en
general-id
general-zh
general-ja
```

Channel topic:

```text
Managed translation view for logical room "general".
Language: English (en).
Do not manually rename/delete without updating the translator.
```

Normal users should only see their own language suffix, so the implementation detail is not especially distracting.

Avoid hacks involving invisible Unicode characters or duplicate-looking names in V1.

---

# 12. Incoming Message Pipeline

For every `MESSAGE_CREATE`:

```text
Discord Gateway
     |
     v
ignore bot/webhook/system?
     |
     v
is channel a managed language view?
     |
     v
resolve logical room
     |
     v
resolve sender preference
     |
     v
extract/protect Discord syntax
     |
     v
detect source language
     |
     v
create logical-message metadata
     |
     v
determine target language views
     |
     v
enqueue one translation job per target language
     |
     v
TranslateGemma
     |
     v
restore protected content
     |
     v
post translated copy to target view
     |
     v
record Discord message ID mapping
```

---

# 13. Loop Prevention

Translated messages posted by our own webhook must never enter the translation pipeline.

Mandatory early guards:

```ts
if (message.author.bot) return;
if (message.webhookId) return;
```

Also ignore:

- system messages;
- application-generated translation placeholders;
- messages from configured ignored bots.

Add a regression test proving that one source message cannot recursively create more translation jobs.

An infinite webhook loop is a severity-1 production bug.

---

# 14. Target Selection

For a new source message:

1. find the logical room;
2. list enabled language views;
3. exclude the physical source view only if its desired target language equals the detected source language;
4. translate to every other enabled view that should remain synchronized.

For target language equal to detected source language:

```text
translation model call = unnecessary
```

If that language is not the physical source view, copy the source text unchanged into that target view.

Example:

```text
sender preference/view = English
actual detected source = Chinese

Chinese target view:
copy original Chinese without model call

Indonesian:
translate zh -> id

Japanese:
translate zh -> ja
```

The English source view still contains the user's original Chinese message because V1 preserves native editability.

This edge case should be documented.

---

# 15. Translation Queue & Scheduling

Do not call the model directly from the Discord event handler.

Use a bounded queue.

Recommended:

```text
p-queue
```

Initial settings:

```text
translation concurrency = 2
max queued translation jobs = 100
```

Why 2:

- exact-M4 benchmark shows batching benefits;
- low enough to preserve interactive latency;
- low risk of memory pressure;
- adequate for a ~60-member server.

Make configurable:

```env
TRANSLATION_CONCURRENCY=2
TRANSLATION_QUEUE_LIMIT=100
```

---

# 16. Message-Level Fan-Out Scheduling

One Discord source message may need multiple language translations.

Do not let one 8-language message monopolize the entire queue unfairly.

Use:

```text
source message
  -> fan-out translation jobs
```

with fair scheduling.

Recommended queue key:

```text
logicalMessageId + targetLanguage
```

Deduplicate identical jobs.

Optionally group jobs from the same source message and allow oMLX continuous batching to process two targets together.

---

# 17. Translation Job Structure

```ts
interface TranslationJob {
  logicalMessageId: string;
  sourceMessageId: string;
  sourceChannelId: string;
  sourceLanguage: string;
  targetLanguage: string;
  targetViewId: string;
  revision: number;
  createdAt: number;
}
```

**Do not persist `text` in durable jobs.**

When a durable/retried job executes, fetch the current source message from Discord by ID.

This is a major privacy feature.

---

# 18. No Persistent Message Text

## 18.1 Core rule

The local database must not store:

```text
original Discord message content
translated Discord message content
conversation transcripts
```

Discord is the persistent message store.

The local Mac stores synchronization metadata only.

---

## 18.2 Runtime lifecycle

Normal message:

```text
Discord stores source
        |
        v
Node receives content in RAM
        |
        v
model receives text
        |
        v
translation returns in RAM
        |
        v
Discord stores translated copy
        |
        v
local process releases text references
```

No permanent local transcript is created.

---

## 18.3 Crash-safe retries without storing text

If translation fails, persist only:

```text
source message ID
target view ID
attempt count
next retry timestamp
```

On retry:

```text
source message ID
        |
        v
Discord API fetch
        |
        v
current source text
        |
        v
translate
```

This allows retry after application restart without saving message text locally.

If the source message has been deleted, mark the job cancelled.

---

# 19. SQLite Schema

Use migrations.

Recommended initial schema:

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE guild_settings (
    guild_id TEXT PRIMARY KEY,
    default_language TEXT NOT NULL,
    translation_enabled INTEGER NOT NULL DEFAULT 1,
    max_enabled_languages INTEGER NOT NULL DEFAULT 8,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE member_preferences (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    preferred_language TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE enabled_languages (
    guild_id TEXT NOT NULL,
    language_code TEXT NOT NULL,
    role_id TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (guild_id, language_code)
);

CREATE TABLE logical_rooms (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    display_name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (guild_id, slug)
);

CREATE TABLE room_views (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    language_code TEXT NOT NULL,
    channel_id TEXT NOT NULL UNIQUE,
    webhook_id TEXT,
    webhook_token_ciphertext TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE (room_id, language_code),

    FOREIGN KEY (room_id)
        REFERENCES logical_rooms(id)
        ON DELETE CASCADE
);

CREATE TABLE logical_messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    source_message_id TEXT NOT NULL UNIQUE,
    source_channel_id TEXT NOT NULL,
    source_view_id TEXT NOT NULL,
    author_user_id TEXT NOT NULL,
    detected_source_language TEXT,
    detection_confidence REAL,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,

    FOREIGN KEY (room_id)
        REFERENCES logical_rooms(id)
        ON DELETE CASCADE
);

CREATE TABLE message_copies (
    logical_message_id TEXT NOT NULL,
    view_id TEXT NOT NULL,
    language_code TEXT NOT NULL,
    discord_message_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    is_original INTEGER NOT NULL DEFAULT 0,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    PRIMARY KEY (logical_message_id, view_id),

    FOREIGN KEY (logical_message_id)
        REFERENCES logical_messages(id)
        ON DELETE CASCADE,

    FOREIGN KEY (view_id)
        REFERENCES room_views(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_message_copies_discord_id
ON message_copies(discord_message_id);

CREATE TABLE pending_translation_jobs (
    id TEXT PRIMARY KEY,
    logical_message_id TEXT NOT NULL,
    target_view_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT NOT NULL,
    status TEXT NOT NULL,
    last_error_code TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    UNIQUE(logical_message_id, target_view_id, revision),

    FOREIGN KEY (logical_message_id)
        REFERENCES logical_messages(id)
        ON DELETE CASCADE,

    FOREIGN KEY (target_view_id)
        REFERENCES room_views(id)
        ON DELETE CASCADE
);
```

Do not add message-content columns later for convenience.

---

# 20. Webhook Rendering

Translated copies should preferably use incoming webhooks because they can display:

```text
original member display name
original member avatar
```

Suggested webhook username:

```text
Chen · translated
```

or:

```text
Chen 🌐
```

Keep it visibly distinguishable from a real user-authored message.

Never intentionally impersonate the source user without a translation marker.

---

# 21. Webhook Tokens

Webhook tokens are secrets.

Options:

### Preferred

Encrypt each token before storing it in SQLite using AES-256-GCM.

Environment:

```env
WEBHOOK_ENCRYPTION_KEY=<32-byte secret>
```

Store:

```text
nonce
ciphertext
auth tag
```

as one encoded value.

### Acceptable for a very small private deployment

Store the database with strict filesystem permissions and document that webhook tokens exist inside it.

The bot token itself must **never** be stored in SQLite.

---

# 22. Mention Safety

Translated messages must not generate accidental pings.

Always send:

```ts
allowedMentions: {
  parse: []
}
```

This applies to initial webhook sends **and edits**.

Discord specifically rebuilds mention metadata when webhook content is edited, so the edit path must also explicitly set allowed mentions.

Never rely on the setting from the original send.

---

# 23. Protected Discord Syntax

Translation must not corrupt:

```text
URLs
user mentions
role mentions
channel mentions
custom emoji
Discord timestamps
slash-command mentions
inline code
fenced code
message jump links
```

Use a content-protection pipeline.

Example input:

```text
Hey <@1234>, join <#5555> and run `npm install`.
Docs: https://example.com
```

Protect:

```text
Hey ⟦D0⟧, join ⟦D1⟧ and run ⟦D2⟧.
Docs: ⟦D3⟧
```

Translate once.

Restore afterward.

Before accepting model output, validate:

```text
number of sentinels
sentinel identifiers
no duplicate/missing sentinel
```

If validation fails, do not post corrupted markup.

Retry using segmented translation or fall back safely.

---

# 24. Channel Mention Remapping

A channel mention from one language view can point to a channel the recipient cannot see.

Example source:

```text
meet me in <#general-zh-id>
```

When generating English-view content:

- detect whether the mentioned channel belongs to a logical translated room;
- if so, replace its physical channel ID with that logical room's English view channel ID.

Therefore:

```text
source physical channel mention
        |
        v
logical room
        |
        v
target physical view
```

This should happen during content restoration.

This small feature will make the multi-view architecture feel significantly more native.

---

# 25. Code Blocks

Never translate fenced code blocks.

Example:

````text
try this:

```js
const result = await foo();
```

it should work
````

Translate only:

```text
try this:
it should work
```

Preserve code byte-for-byte.

The same rule applies to inline code.

---

# 26. URLs

Never translate or modify URLs unless performing explicit Discord message/channel-view remapping for known Discord jump/channel references.

Ordinary URLs must remain byte-for-byte identical.

---

# 27. Emoji

Unicode emoji can remain in natural-language input.

Example:

```text
that was insane 😂🔥
```

Custom Discord emoji:

```text
<:name:123456789>
<a:name:123456789>
```

must be protected and restored.

---

# 28. Messages That Should Skip Inference

Do not call TranslateGemma for messages with no meaningful natural language.

Examples:

```text
😂😂😂
👍
https://example.com
<:custom:123>
```

If synchronization is necessary, copy them unchanged into the other language views.

This means the room stays synchronized without wasting inference.

---

# 29. Long Messages

Discord normal message content is limited.

Use a safe output chunk size:

```text
1900 characters
```

Do not wait until the absolute Discord limit.

Function:

```ts
splitDiscordMessage(text, 1900)
```

Preferred split order:

1. paragraph;
2. newline;
3. sentence;
4. whitespace;
5. hard split only as last resort.

Protected spans must not be split.

---

# 30. Multi-Part Message Mapping

A translated result may require multiple Discord messages.

Therefore `message_copies` may eventually need to support multiple parts.

Recommended schema improvement before implementation:

```sql
CREATE TABLE message_copy_parts (
    logical_message_id TEXT NOT NULL,
    view_id TEXT NOT NULL,
    part_index INTEGER NOT NULL,
    discord_message_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    revision INTEGER NOT NULL,

    PRIMARY KEY(logical_message_id, view_id, part_index)
);
```

The original message can also be represented as part index `0`.

Use this design from the beginning if Cursor can keep the repository clean.

---

# 31. Edits

When a source user edits their original message:

```text
MESSAGE_UPDATE
```

Process:

1. identify source message;
2. increment logical-message revision;
3. fetch full current content if event is partial;
4. rerun content protection;
5. rerun language detection;
6. cancel stale queued jobs for earlier revisions;
7. retranslate each target language;
8. edit existing webhook copy/parts;
9. create or delete extra parts as required;
10. update mapping metadata.

Revision numbers prevent an old slow translation from overwriting a newer edit.

Example:

```text
revision 1 translation still running
user edits message -> revision 2
revision 1 finishes later
```

Before posting revision 1:

```text
if job.revision != currentRevision:
    discard result
```

Mandatory.

---

# 32. Deletes

When an original source message is deleted:

```text
MESSAGE_DELETE
```

Process:

1. find logical message;
2. mark deleted;
3. cancel pending translation jobs;
4. delete all translated webhook copies;
5. delete multi-part copies;
6. optionally retain minimal mapping metadata for audit/debugging, or cascade-delete it.

No source text is required.

If a translated copy was manually deleted, do not delete the source.

Log and repair mapping if appropriate.

---

# 33. Replies — Important Discord Limitation

Webhook execution does not provide the same straightforward native-reply flow as ordinary bot message creation.

Therefore V1 should **not depend on native webhook reply threading**.

Use a logical reply representation.

If a member replies to an original or translated message:

1. inspect the replied-to Discord message ID;
2. map it to the logical parent message;
3. when posting translations into each target view, locate that parent's corresponding target copy;
4. include a compact reply marker.

Example:

```text
↪ Replying to Chen
I'll join after dinner.
```

Optionally make "Replying to Chen" a jump link to the corresponding parent message in that target language view.

The jump link can be constructed entirely from:

```text
guild ID
target channel ID
target message ID
```

No message text storage is required.

V2 can investigate using ordinary bot-authored translated messages instead of webhooks if native Discord reply rendering becomes more valuable than source-user avatar/name mirroring.

---

# 34. Attachments

Attachments should not be stored permanently on the Mac.

V1 behavior:

### Text + attachment

- translate text;
- mirror attachment to other language views.

### Attachment only

- no translation inference;
- mirror attachment.

Preferred mirroring:

1. download once from Discord into a temporary file;
2. upload to each required target view;
3. delete temporary file immediately after fan-out.

Set a conservative configurable size limit:

```env
ATTACHMENT_MIRROR_MAX_BYTES=8388608
```

For attachments above the configured limit:

- do not crash;
- post a clear attachment metadata/link fallback;
- log size and reason.

Do not OCR images in V1.

---

# 35. Stickers, Polls, Threads, Voice

V1 scope:

```text
plain text       supported
URLs             supported
mentions         supported
custom emoji     supported
inline code      supported
code blocks      supported
attachments      basic mirroring
replies          logical reply marker
edits            supported
deletes          supported
```

Out of scope initially:

```text
poll synchronization
thread synchronization
forum posts
voice translation
speech-to-text
OCR
image translation
sticker semantic translation
reaction synchronization
```

Thread messages should either:

- be explicitly ignored with documentation;
- or thread creation should be disabled in managed translated channels for V1.

Do not silently implement half-working thread translation.

---

# 36. Reactions

V1:

```text
do not synchronize reactions
```

A reaction applies only to the physical copy where it was added.

V2 may map reactions through logical-message IDs.

If reaction synchronization is added later, prevent loops using the same event-origin protections used for message copies.

---

# 37. Translation Cache

Persistent translated-text caches conflict with the no-local-chat-storage goal.

Use **in-memory only** LRU cache.

Key:

```text
SHA256(
  modelVersion
  + sourceLanguage
  + targetLanguage
  + normalizedText
)
```

Value:

```text
translatedText
```

Suggested:

```text
max entries = 2000
TTL = 1 hour
```

Cache disappears on restart.

Do not save cached translations to SQLite.

---

# 38. Rate Limits

Discord rate limits must be treated dynamically.

Do not hard-code assumptions about per-route limits.

Let discord.js handle standard rate-limit scheduling and respect Discord's returned retry timing.

The architecture should also avoid pathological fan-out.

Guardrails:

```text
MAX_ENABLED_LANGUAGES default = 8
TRANSLATION_QUEUE_LIMIT = 100
```

If a server admin attempts to enable excessive language views, warn before creating large numbers of physical channels.

For this private 60-member use case, normal expected operation is approximately 2-6 enabled languages.

---

# 39. Backpressure

If translation demand exceeds capacity:

```text
queue depth > configured maximum
```

do not allocate unlimited memory.

Recommended behavior:

1. persist ID-only pending job;
2. delay it;
3. process later by refetching source from Discord;
4. if source was deleted, cancel;
5. if job is superseded by a newer edit revision, cancel.

No message text needs to remain in the queue after a process restart.

---

# 40. Timeouts & Retries

Translation request timeout:

```text
30 seconds
```

Normal maximum attempts:

```text
2 immediate attempts
```

After that, convert to delayed retry metadata.

Use exponential-ish retry timing:

```text
30 sec
2 min
10 min
```

Do not retry indefinitely.

After final failure:

- mark target copy failed;
- optionally post a small translation-unavailable placeholder;
- expose failure count in `/translator status`.

---

# 41. Failure Placeholder

A missing message in one language view can break conversation continuity.

Optional recommended V1 behavior:

```text
Chen 🌐
⚠️ Translation temporarily unavailable.
```

Store the placeholder's Discord message ID as the target copy.

If retry later succeeds:

```text
edit placeholder -> actual translation
```

This preserves message ordering.

Do not include source text in the placeholder.

---

# 42. Translation Provider Abstraction

Discord code must not know oMLX-specific request details.

```ts
interface TranslateRequest {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
}

interface TranslateResult {
  text: string;
  inferenceMs: number;
  model: string;
}

interface TranslationProvider {
  translate(request: TranslateRequest): Promise<TranslateResult>;
  healthCheck(): Promise<boolean>;
}
```

Implement:

```text
OmlxTranslateGemmaProvider
```

Unit tests use:

```text
FakeTranslationProvider
```

This allows changing inference runtimes without rewriting Discord synchronization logic.

---

# 43. Language Detector Abstraction

```ts
interface LanguageDetection {
  language: string;
  confidence: number;
  candidates?: Array<{
    language: string;
    confidence: number;
  }>;
}

interface LanguageDetector {
  detect(
    text: string,
    preferredLanguage?: string
  ): Promise<LanguageDetection>;
}
```

Implementation:

```text
FastTextWasmLanguageDetector
```

Keep heuristics in a separate service/class:

```text
SourceLanguageResolver
```

so detector output and product policy are not mixed together.

---

# 44. Content Pipeline Abstraction

Recommended stages:

```text
raw Discord message
        |
        v
ContentAnalyzer
        |
        +-- should translate?
        +-- natural-language character count
        +-- attachment metadata
        |
        v
ContentProtector
        |
        v
protected translation text
        |
        v
TranslationProvider
        |
        v
ContentRestorer(targetView)
        |
        +-- restore mentions
        +-- remap channel mentions
        +-- restore URLs
        +-- restore code
        |
        v
Discord-safe translated content
```

Each stage must be independently unit tested.

---

# 45. Room Router

Create a central service:

```ts
class LogicalRoomRouter
```

Responsibilities:

```text
physical channel -> room view
room view -> logical room
logical room + language -> target view
Discord message ID -> logical message
```

Discord event handlers should never contain raw SQL or complex routing rules.

---

# 46. Repositories

Recommended repositories:

```text
GuildSettingsRepository
MemberPreferenceRepository
EnabledLanguageRepository
LogicalRoomRepository
RoomViewRepository
LogicalMessageRepository
MessageCopyRepository
PendingJobRepository
```

Use explicit transactions for:

- creating a logical message + original mapping;
- provisioning a room view;
- recording successful translated copy;
- edit revision transitions.

---

# 47. Discord Commands

## Member commands

```text
/language set <language>
/language show
/language list
```

All responses should be ephemeral when appropriate.

---

## Admin commands

```text
/translator status
/translator language-enable <language>
/translator language-disable <language>

/translator room-create <name>
/translator room-delete <room>
/translator room-list

/translator reconcile
/translator test <from> <to> <text>
```

`/translator reconcile` verifies:

```text
managed roles exist
managed channels exist
webhooks exist
permissions match expected state
database IDs still point to valid Discord resources
```

It should repair safe drift automatically and report destructive drift without guessing.

---

# 48. Room Creation Flow

Admin:

```text
/translator room-create general
```

Bot:

1. validate logical room name;
2. insert logical room row;
3. enumerate enabled server languages;
4. create one physical Discord text channel per language;
5. configure permission overwrites;
6. create a managed webhook in each target view;
7. encrypt/store webhook token;
8. write room-view records;
9. return an ephemeral summary.

Use a transaction-like compensating workflow.

If channel 3/4 fails to provision:

- do not leave database pretending setup completed;
- mark room `provisioning_failed`;
- clean up resources that can safely be removed;
- tell admin to run reconcile.

---

# 49. Language Enable Flow

When the first Indonesian user selects Indonesian and it is not enabled:

1. confirm `id` is in tested model allowlist;
2. enforce max-enabled-language guardrail;
3. create `Translator · Indonesian` role;
4. for each logical room:
   - create Indonesian physical view;
   - add permissions;
   - create webhook;
   - store IDs;
5. assign role to member;
6. persist preference.

No historical translation backfill is required.

---

# 50. Message Rendering

For translated webhook copies:

```text
username:
<displayName> · translated

avatar:
source member's current avatar
```

Content:

```text
translated natural language
```

Do not add repeated language banners to every message; users already occupy a language-specific view.

A subtle translation marker in the webhook username is enough.

---

# 51. Ordering

Multiple translations may finish in a different order.

A rapid conversation:

```text
A
B
C
```

must ideally appear:

```text
A
B
C
```

in every target language view.

Implement per-room/per-target ordering.

Recommended:

- assign each logical message a monotonically increasing local sequence for that room;
- translation inference may happen concurrently;
- delivery into each target view waits for earlier sequence numbers unless they time out.

Do not hold ordering forever.

Example:

```text
message A translation failed
message B ready
```

After a short ordering deadline, post failure placeholder for A, then B.

Suggested deadline:

```text
5 seconds
```

This is important for conversation readability.

---

# 52. Sequence Metadata

Add:

```sql
ALTER TABLE logical_messages
ADD COLUMN room_sequence INTEGER;
```

Generate sequence under a SQLite transaction per room.

Target delivery coordinator maintains:

```text
room + target language -> next expected sequence
```

This can be reconstructed from database state after restart.

---

# 53. Idempotency

Discord reconnects and partial failures can produce duplicate event handling.

Every state-changing operation must be idempotent.

Examples:

```text
same MESSAGE_CREATE received twice
-> one logical message

same target translation job scheduled twice
-> one target copy

same edit event processed twice
-> one revision result
```

Use database uniqueness constraints, not only in-memory flags.

---

# 54. Startup Reconciliation

On application start:

1. validate environment;
2. open SQLite;
3. run migrations;
4. initialize language detector;
5. connect to Discord;
6. health-check model service;
7. load room/view configuration;
8. verify managed resources;
9. restore pending ID-only jobs;
10. warm model;
11. mark translator ready.

Do not start consuming translation events before configuration is loaded.

---

# 55. Model Warm-Up

At startup perform a tiny translation:

```text
en -> es
hello
```

or another enabled pair.

Record warm-up latency.

The model should remain loaded continuously.

Do not unload it between messages.

---

# 56. Discord Intents

Required Gateway intents should include only what is needed.

Core:

```text
Guilds
GuildMessages
MessageContent
```

Potentially:

```text
GuildMembers
```

if role/member synchronization requires member events.

`MESSAGE_CONTENT` is a privileged intent and must be enabled in the Discord Developer Portal.

For a small private bot this is operationally straightforward, but still must be configured.

---

# 57. Discord Permissions

Do not request Administrator.

Expected bot permissions:

```text
View Channels
Send Messages
Read Message History
Manage Channels
Manage Roles
Manage Webhooks
Use Application Commands
Attach Files
Embed Links
```

Potentially:

```text
Manage Messages
```

only if a future feature actually requires it.

Keep bot permissions minimal.

---

# 58. Privacy & Logging

Default logs must never contain message content.

Allowed structured fields:

```text
event
guildId
roomId
sourceChannelId
targetChannelId
sourceMessageId
logicalMessageId
sourceLanguage
targetLanguage
detectionConfidence
inputCharacterCount
queueWaitMs
inferenceMs
deliveryMs
status
errorCode
```

Do not log:

```text
source text
translated text
attachment content
bot token
webhook token
full webhook URL
```

---

# 59. Metrics

Maintain in-memory metrics:

```text
messages_seen_total
logical_messages_total
translations_requested_total
translations_completed_total
translations_failed_total
translations_cache_hit_total
language_detection_fallback_total
queue_depth
jobs_active
pending_retry_jobs
p50_translation_ms
p95_translation_ms
p50_end_to_end_ms
p95_end_to_end_ms
```

Expose useful summaries through:

```text
/translator status
```

No Prometheus deployment required for V1.

---

# 60. Status Command Example

```text
Translator: Online
Model: TranslateGemma 4B 4-bit
Model server: Healthy
Language detector: Healthy

Rooms: 2
Enabled languages: 4

Queue: 1 waiting / 2 active
Pending retries: 0

Median translation: 1.7s
P95 translation: 4.2s

Uptime: 3d 6h
```

Do not expose secrets.

---

# 61. Expected Performance Targets

These are engineering targets, not guarantees.

For short warmed-up Discord messages on the M4:

```text
source detection: effectively immediate
median first translated view: <= 3 seconds
P95 light-load translation: <= 6 seconds
```

For several target languages:

```text
all target views synchronized: preferably <= 5-8 seconds
```

Under bursts:

- queueing is acceptable;
- missing messages and reordering should be minimized;
- system stability is more important than absolute latency.

Benchmark actual behavior before declaring success.

---

# 62. Benchmark Harness

Create:

```text
scripts/benchmark.ts
```

Datasets:

```text
short casual messages
medium conversation messages
long Discord messages
mixed-language messages
emoji-heavy messages
code-containing messages
```

Test target fan-out:

```text
1 target language
2 target languages
4 target languages
6 target languages
```

Test simultaneous source messages:

```text
1
2
4
8
```

Record:

```text
language-detection time
queue wait
model inference
Discord delivery simulation
total latency
memory usage
failure count
```

---

# 63. Project Structure

```text
discord-multilingual-layer/
|
├── src/
│   ├── index.ts
│   │
│   ├── config/
│   │   ├── env.ts
│   │   ├── languages.ts
│   │   └── constants.ts
│   │
│   ├── discord/
│   │   ├── client.ts
│   │   ├── intents.ts
│   │   ├── events/
│   │   │   ├── messageCreate.ts
│   │   │   ├── messageUpdate.ts
│   │   │   ├── messageDelete.ts
│   │   │   └── guildMemberUpdate.ts
│   │   ├── commands/
│   │   │   ├── language.ts
│   │   │   ├── translator.ts
│   │   │   └── register.ts
│   │   ├── provisioning/
│   │   │   ├── roles.ts
│   │   │   ├── channels.ts
│   │   │   ├── permissions.ts
│   │   │   └── webhooks.ts
│   │   └── rendering/
│   │       ├── translatedMessage.ts
│   │       └── replyMarker.ts
│   │
│   ├── rooms/
│   │   ├── logicalRoomRouter.ts
│   │   ├── roomService.ts
│   │   ├── viewService.ts
│   │   └── reconcileService.ts
│   │
│   ├── language/
│   │   ├── detector.ts
│   │   ├── fastTextDetector.ts
│   │   ├── sourceLanguageResolver.ts
│   │   ├── scriptHeuristics.ts
│   │   └── registry.ts
│   │
│   ├── translation/
│   │   ├── provider.ts
│   │   ├── omlxProvider.ts
│   │   ├── queue.ts
│   │   ├── scheduler.ts
│   │   ├── cache.ts
│   │   ├── revisionGuard.ts
│   │   └── deliveryCoordinator.ts
│   │
│   ├── content/
│   │   ├── analyzer.ts
│   │   ├── protector.ts
│   │   ├── restorer.ts
│   │   ├── discordMarkup.ts
│   │   ├── channelMentionMapper.ts
│   │   └── splitter.ts
│   │
│   ├── messages/
│   │   ├── logicalMessageService.ts
│   │   ├── createPipeline.ts
│   │   ├── editPipeline.ts
│   │   ├── deletePipeline.ts
│   │   └── replyResolver.ts
│   │
│   ├── attachments/
│   │   ├── attachmentMirror.ts
│   │   └── tempFiles.ts
│   │
│   ├── database/
│   │   ├── db.ts
│   │   ├── migrate.ts
│   │   └── repositories/
│   │       ├── guildSettings.ts
│   │       ├── memberPreferences.ts
│   │       ├── enabledLanguages.ts
│   │       ├── logicalRooms.ts
│   │       ├── roomViews.ts
│   │       ├── logicalMessages.ts
│   │       ├── messageCopies.ts
│   │       └── pendingJobs.ts
│   │
│   ├── security/
│   │   ├── webhookCrypto.ts
│   │   └── secrets.ts
│   │
│   └── observability/
│       ├── logger.ts
│       ├── metrics.ts
│       └── health.ts
│
├── migrations/
│   ├── 001_initial.sql
│   └── 002_message_copy_parts.sql
│
├── scripts/
│   ├── modelSmokeTest.ts
│   ├── modelLanguageMatrix.ts
│   ├── benchmark.ts
│   ├── registerCommands.ts
│   └── installLaunchAgents.sh
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── discord/
│   └── fixtures/
│
├── data/
│   └── .gitkeep
│
├── logs/
│   └── .gitkeep
│
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── eslint.config.js
├── README.md
└── LICENSE
```

---

# 64. Environment Variables

```env
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=

DATABASE_PATH=./data/translator.sqlite

TRANSLATION_BASE_URL=http://127.0.0.1:8000/v1
TRANSLATION_MODEL=mlx-community/translategemma-4b-it-4bit
TRANSLATION_TIMEOUT_MS=30000
TRANSLATION_CONCURRENCY=2
TRANSLATION_QUEUE_LIMIT=100

DEFAULT_LANGUAGE=en
MAX_ENABLED_LANGUAGES=8

LANGUAGE_DETECT_MIN_CHARS=8
LANGUAGE_DETECT_HIGH_CONFIDENCE=0.75

ATTACHMENT_MIRROR_MAX_BYTES=8388608

WEBHOOK_ENCRYPTION_KEY=

LOG_LEVEL=info
```

Validate with `zod`.

Fail startup clearly if critical values are invalid.

---

# 65. `.gitignore`

```gitignore
.env
node_modules/
dist/
data/*.sqlite
data/*.sqlite-*
logs/*.log
.DS_Store
tmp/
```

Never commit:

```text
bot token
webhook encryption key
production SQLite DB
webhook tokens
logs
```

---

# 66. macOS Deployment

Run natively.

Do not use Docker in V1.

Services:

```text
1. oMLX model service
2. Node Discord translator
```

Both should be configured with `launchd`.

The Mac must not enter system sleep while acting as the server.

Display sleep is fine.

Recommended operational setup:

```text
wired Ethernet if possible
automatic restart after power failure
stable macOS user account
FileVault enabled if appropriate
restricted project/data directory permissions
regular OS updates
```

---

# 67. launchd

Create:

```text
scripts/installLaunchAgents.sh
```

Model service LaunchAgent:

```text
RunAtLoad = true
KeepAlive = true
bind localhost only
```

Bot LaunchAgent:

```text
RunAtLoad = true
KeepAlive = true
WorkingDirectory = repository
stdout -> logs/bot.stdout.log
stderr -> logs/bot.stderr.log
```

Production bot execution:

```text
npm run build
node dist/index.js
```

Do not run production through `tsx`.

Document that a user LaunchAgent typically requires that macOS user to log in after reboot.

If boot-before-login is later required, migrate to system LaunchDaemons carefully.

---

# 68. Health Handling

Bot and model service are separate.

If oMLX is unavailable:

- Discord connection may remain online;
- `/translator status` reports model offline;
- source events can create ID-only pending jobs;
- worker retries after model recovery;
- content is refetched from Discord;
- the bot does not crash-loop.

Health-check interval:

```text
10-30 seconds while unhealthy
60 seconds while healthy
```

---

# 69. Graceful Shutdown

On SIGINT/SIGTERM:

1. stop accepting new translation jobs;
2. persist ID-only outstanding job metadata;
3. allow current Discord sends to settle briefly;
4. close Discord client;
5. close SQLite;
6. flush logs;
7. exit.

Do not attempt to serialize message text to disk during shutdown.

---

# 70. Testing Strategy

## 70.1 Unit tests

Mandatory:

```text
language-code normalization
source-language fallback
script heuristics
message shouldTranslate logic
URL protection
mention protection
custom emoji protection
code-block protection
placeholder integrity
channel mention remapping
message splitting
translation job deduplication
revision cancellation
room routing
role selection
webhook encryption/decryption
```

---

## 70.2 Translation integration tests

With local model online:

```text
en -> zh
zh -> en
en -> id
id -> en
zh -> id
id -> zh
en -> ja
ja -> en
```

Include:

```text
slang
emoji
short text
mixed language
punctuation
gaming vocabulary
```

Assertions:

- output not empty;
- no model commentary;
- no duplicated prompt;
- expected script/language;
- protected markers preserved.

---

## 70.3 Discord integration tests

Mock or test in a private development guild.

Verify:

```text
human source -> translation jobs
bot source -> ignored
webhook source -> ignored
unmanaged channel -> ignored
language role switch -> permission view changes
translated copy -> correct target channel
delete source -> translated copies deleted
edit source -> translated copies edited
stale edit result -> discarded
```

---

# 71. Critical Regression Tests

## No infinite loop

One source event must create:

```text
N target jobs
```

and webhook events generated by those copies must create:

```text
0 new jobs
```

---

## No accidental ping

Source:

```text
@everyone hello
```

Translated copy:

- may display text;
- must not notify everyone.

Test both initial send and edit.

---

## URL integrity

Source URL must survive byte-for-byte.

---

## Code integrity

Code blocks and inline code must survive byte-for-byte.

---

## Correct logical reply mapping

Reply to Indonesian copy of logical message A must resolve to logical message A, not create a relationship to an unrelated physical message.

---

## Revision race

Simulate:

```text
revision 1 slow
revision 2 fast
```

Only revision 2 may become final visible content.

---

## Restart retry without text storage

1. queue translation;
2. persist ID-only job;
3. restart process;
4. fetch original from Discord;
5. translate;
6. deliver successfully.

Verify database never contained message content.

---

# 72. Development Phases

## Phase 0 — Local Model Proof

Do not touch Discord yet.

Build:

```text
TranslationProvider
OmlxTranslateGemmaProvider
modelSmokeTest.ts
modelLanguageMatrix.ts
benchmark.ts
```

Acceptance:

- required language pairs work;
- output is clean;
- M4 memory stable;
- latency acceptable;
- two concurrent requests stable.

---

## Phase 1 — Project Skeleton

Build:

```text
TypeScript project
env validation
structured logger
SQLite migrations
repositories
health services
```

Acceptance:

```text
npm test passes
npm run build passes
database initializes cleanly
```

---

## Phase 2 — Language Detection

Build:

```text
fastText WASM detector
script heuristics
source resolver
supported-language registry
```

Create a CLI:

```text
npm run detect -- --text "今晚开吗"
```

Acceptance:

- common server languages recognized;
- short-text fallback works;
- no network API required.

---

## Phase 3 — Discord Skeleton

Build:

```text
Discord login
Gateway intents
slash command registration
status command
```

No translation yet.

Acceptance:

```text
bot reconnects
status works
message content available
```

---

## Phase 4 — User Preferences & Roles

Build:

```text
/language set
/language show
/language list
managed translator roles
preference persistence
```

Acceptance:

- role changes match DB;
- only one translator role per member;
- restart preserves preference.

---

## Phase 5 — Logical Room Provisioning

Build:

```text
room-create
language enable
physical channel views
permissions
webhooks
reconciliation
```

Acceptance:

- English user sees only English view;
- Indonesian user sees only Indonesian view;
- admin can diagnose all views.

---

## Phase 6 — One-Way Translation

Choose:

```text
Chinese source -> English target
```

Implement:

```text
message create pipeline
content protection
source detection
translation queue
webhook post
message mapping
```

Acceptance:

- end-to-end message appears;
- no loops;
- no text in SQLite.

---

## Phase 7 — Full Multi-Language Fan-Out

Add:

```text
all enabled target views
copy-without-inference when target == source
bounded queue
in-memory cache
fair scheduling
```

Acceptance:

- one source produces exactly one physical copy per view;
- inference count equals required unique target languages, not users.

---

## Phase 8 — Edits & Deletes

Implement:

```text
revision numbers
stale-job cancellation
webhook edits
multi-part edits
source delete propagation
```

Acceptance:

- no old translation overwrites new edit;
- delete removes translated copies.

---

## Phase 9 — Reply Mapping

Implement:

```text
copy -> logical parent resolution
logical parent -> target-view copy resolution
reply marker / target jump link
```

Acceptance:

- replies remain understandable across language views;
- no local message text required.

---

## Phase 10 — Attachments

Implement temporary attachment mirroring.

Acceptance:

- attachment-only messages mirror without model inference;
- temp files removed;
- no persistent copies remain on Mac.

---

## Phase 11 — Durable Retry & Ordering

Implement:

```text
ID-only pending jobs
Discord refetch
target-view delivery ordering
failure placeholders
```

Acceptance:

- oMLX restart does not permanently lose messages;
- app restart can resume translation using Discord as source store.

---

## Phase 12 — Production Hardening

Implement/test:

```text
launchd
sleep settings documentation
structured metrics
reconcile command
failure injection
restart testing
```

Run for several days on the actual server before considering V1 finished.

---

# 73. Cursor Working Rules

Give Cursor these instructions explicitly.

1. Implement **one phase at a time**.
2. Do not generate the entire project in a single pass.
3. After each phase:
   - run TypeScript compilation;
   - run tests;
   - fix all errors;
   - summarize changed files;
   - provide exact manual verification commands.
4. Do not introduce cloud translation APIs.
5. Do not add unrelated frameworks.
6. Do not persist message contents.
7. Keep Discord handlers thin.
8. Keep model-specific code behind `TranslationProvider`.
9. Keep SQLite access inside repositories.
10. Every network call needs timeout/error handling.
11. Every queued operation must be idempotent.
12. Protect against stale message-edit results.
13. Never log raw Discord content.
14. Never log secrets.
15. Do not continue to the next phase while the current one is failing.

---

# 74. First Cursor Task

Paste the following as Cursor's first implementation task:

```text
Implement Phase 0 only.

Goal:
Prove that TranslateGemma 4B 4-bit can provide clean local translations
on this Mac mini before any Discord integration exists.

Requirements:

1. Create a TypeScript Node 24 project.
2. Add zod-based environment validation.
3. Define TranslationProvider.
4. Implement OmlxTranslateGemmaProvider.
5. Add scripts/modelSmokeTest.ts.
6. Add scripts/modelLanguageMatrix.ts.
7. Add scripts/benchmark.ts.
8. Do not add discord.js yet.
9. Do not add SQLite yet.
10. Do not use any cloud translation API.

modelSmokeTest must support:

npm run model:test -- \
  --from zh \
  --to en \
  --text "今晚有人想一起玩吗？"

Output should include:

Source: zh
Target: en
Translation: ...
Inference ms: ...
Model: ...

The test must fail non-zero if:
- the model returns empty output;
- the request fails;
- the model outputs obvious prompt commentary;
- source/target code is rejected.

Also test at least:
en->zh
zh->en
en->id
id->en
zh->id
id->zh

Do not proceed to Discord work until these pass reliably.
```

---

# 75. Second Cursor Task

After Phase 0 succeeds:

```text
Implement Phase 1 and Phase 2.

Create:
- configuration validation;
- logger;
- SQLite migration runner;
- repository skeleton;
- fastText WASM language detector;
- script heuristics;
- SourceLanguageResolver;
- supported-language registry;
- unit tests.

Do not connect to Discord yet.

The language detector must:
- accept UTF-8 text;
- return normalized internal language code;
- return confidence where available;
- use preferred-language fallback for very short text;
- never make network requests.

Add a CLI test command and fixtures for:
English, Chinese, Indonesian, Japanese, Korean, Spanish, Hindi.
```

---

# 76. Definition of Done — V1

V1 is complete only when:

```text
✓ User sets a preferred language once.

✓ Their language role controls which physical view they can see.

✓ One logical room is backed by one physical channel per enabled language.

✓ Human messages are detected automatically.

✓ Translation runs locally.

✓ No paid/cloud translation API is involved.

✓ TranslateGemma 4B 4-bit runs reliably on the M4.

✓ A source message is translated once per unique target language, not per user.

✓ Webhook copies preserve source display name/avatar with a translated marker.

✓ Webhook copies cannot cause recursive translation.

✓ URLs, code, mentions and custom emoji are protected.

✓ Channel mentions are remapped to the recipient's language view when possible.

✓ Accidental @everyone/@role/user pings are prevented.

✓ Discord stores the conversation text.

✓ SQLite stores no original or translated message body.

✓ SQLite stores only routing/synchronization metadata.

✓ Failed translations can be retried after restart by refetching the source from Discord using message IDs.

✓ Edits propagate.

✓ Deletes propagate.

✓ Stale edit translations cannot overwrite newer content.

✓ Replies resolve to the corresponding logical parent.

✓ Long translated messages are split safely.

✓ Translation ordering remains readable.

✓ The queue is bounded.

✓ Model failure does not crash the Discord bot.

✓ The bot/model recover after restart.

✓ Status and reconciliation commands work.

✓ Logs contain no chat text or secrets.

✓ Unit/integration/regression tests pass.
```

---

# 77. V1 Non-Goals

Do not include these in the first production version:

```text
voice translation
speech recognition
OCR
image-text translation
video subtitles
forum synchronization
thread synchronization
poll synchronization
reaction synchronization
historical backfill
public multi-guild hosting
web dashboard
mobile app
vector database
conversation memory
AI chatbot features
moderation AI
summaries
```

The product should remain a translation/synchronization layer.

---

# 78. V2 Possibilities

After V1 is stable:

## 78.1 Better mixed-language handling

Segment messages such as:

```text
那个 boss is actually broken lol
```

into multilingual spans.

---

## 78.2 Translation glossary

Per-guild terminology:

```text
raid names
game item names
player names
guild terminology
acronyms
```

---

## 78.3 Reaction synchronization

Map reactions across physical copies using logical message IDs.

---

## 78.4 Thread synchronization

Create corresponding translated threads in each view.

This requires a separate logical-thread model and should not be bolted onto V1 casually.

---

## 78.5 Context-aware translation

For ambiguous messages, fetch one or two previous logical messages from Discord and provide them as non-output context.

Do not persist that context locally.

Only add this if translation quality clearly benefits.

---

## 78.6 Optional input normalization

If a member repeatedly types in a language different from their selected view:

- prompt them to change preferred language;
- optionally offer automatic normalization mode.

Do not enable source-message deletion/reposting by default.

---

# 79. Key Architectural Decisions

These decisions should remain stable unless testing proves them wrong.

### Decision 1
Use **language-specific physical Discord channels** because Discord cannot render one channel message differently for each viewer.

### Decision 2
Use **one role per enabled preferred language** to control view access efficiently.

### Decision 3
Translate **once per target language**, never once per recipient.

### Decision 4
Use **automatic source-language detection**, with user preference as a fallback/prior.

### Decision 5
Use **TranslateGemma 4B 4-bit on MLX/oMLX** as the initial local model.

### Decision 6
Keep **Discord as the message database**.

### Decision 7
Store **only IDs and synchronization metadata** in SQLite.

### Decision 8
For crash recovery, store **ID-only pending jobs and refetch source content from Discord**.

### Decision 9
Use **webhooks for translated copies**, but implement logical reply markers rather than depending on native webhook replies.

### Decision 10
Keep V1 deliberately narrow and reliable.

---

# 80. Final System Diagram

```text
                         DISCORD
                            |
               human MESSAGE_CREATE event
                            |
                            v
                  +----------------------+
                  | Discord Bot          |
                  | Node + TypeScript    |
                  +----------+-----------+
                             |
                             v
                  +----------------------+
                  | Logical Room Router  |
                  +----------+-----------+
                             |
                             v
                  +----------------------+
                  | Content Protector    |
                  +----------+-----------+
                             |
                             v
                  +----------------------+
                  | fastText LID (WASM)  |
                  | + preference fallback|
                  +----------+-----------+
                             |
                             v
                  +----------------------+
                  | Target View Planner  |
                  +----------+-----------+
                             |
                      unique languages
                             |
                  +----------v-----------+
                  | Bounded Job Queue    |
                  | concurrency ~2       |
                  +----------+-----------+
                             |
                             v
                  +----------------------+
                  | oMLX localhost       |
                  | TranslateGemma 4B    |
                  | MLX / Apple GPU      |
                  +----------+-----------+
                             |
                             v
                  +----------------------+
                  | Restore + Validate   |
                  | Discord markup       |
                  +----------+-----------+
                             |
                 +-----------+-----------+
                 |           |           |
                 v           v           v
             #room-en    #room-id    #room-zh
                 |           |           |
          English role  Indonesian   Chinese role
                             role
```

SQLite sits beside the bot and stores:

```text
preferences
roles
room IDs
view/channel IDs
webhook metadata
logical message IDs
copy message IDs
edit revisions
ID-only retry jobs
```

It does **not** store:

```text
chat text
translated text
conversation transcripts
```

---

# 81. Research Notes / References

The architectural plan was checked against current documentation/resources in September 2026.

1. **Discord Webhook Resource** — incoming webhooks, webhook message edit/delete behavior, `allowed_mentions`, webhook token behavior.  
   https://docs.discord.com/developers/resources/webhook

2. **Discord Permissions** — role/member permission overwrites and channel permission behavior.  
   https://docs.discord.com/developers/topics/permissions

3. **Discord Gateway / Message Content Intent** — message content is a privileged intent and affects content/attachments/components availability.  
   https://docs.discord.com/developers/events/gateway

4. **Discord Rate Limits** — rate limits should not be hard-coded; clients should respect returned rate-limit state/retry timing.  
   https://docs.discord.com/developers/topics/rate-limits

5. **Discord Message Resource** — message IDs, references, content limits, reply/message metadata.  
   https://docs.discord.com/developers/resources/message

6. **TranslateGemma 4B model card** — structured translation input uses explicit source and target language codes.  
   https://huggingface.co/google/translategemma-4b-it

7. **MLX Community TranslateGemma 4B 4-bit** — Apple Silicon MLX conversion.  
   https://huggingface.co/mlx-community/translategemma-4b-it-4bit

8. **oMLX exact M4 16 GB benchmark** — TranslateGemma 4B 4-bit performance/memory reference.  
   https://omlx.ai/benchmarks/performance/1k03tjvc

9. **fastText Language Identification** — official LID models and 176-language support.  
   https://fasttext.cc/docs/en/language-identification

10. **discord.js documentation** — current Node runtime requirements and Discord API library.  
    https://discord.js.org/docs

---

# 82. Final Principle

The implementation should stay conceptually simple:

```text
User writes normally
      |
      v
detect source language
      |
      v
translate once per target language
      |
      v
synchronize language-specific Discord views
      |
      v
store only IDs needed to keep those copies related
```

The Mac mini is **not** a second chat archive.

It is a local translation and synchronization engine.

Discord remains the conversation store.
