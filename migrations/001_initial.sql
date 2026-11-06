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
