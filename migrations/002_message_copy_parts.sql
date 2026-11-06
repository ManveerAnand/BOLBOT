CREATE TABLE message_copy_parts (
    logical_message_id TEXT NOT NULL,
    view_id TEXT NOT NULL,
    part_index INTEGER NOT NULL,
    discord_message_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    PRIMARY KEY(logical_message_id, view_id, part_index),
    FOREIGN KEY (logical_message_id, view_id)
        REFERENCES message_copies(logical_message_id, view_id)
        ON DELETE CASCADE
);
