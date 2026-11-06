ALTER TABLE logical_rooms ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE logical_rooms ADD COLUMN category_id TEXT;
