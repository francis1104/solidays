CREATE TABLE visitors (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
) STRICT;

CREATE TABLE conversations (
  id TEXT PRIMARY KEY NOT NULL,
  visitor_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  last_page_url TEXT CHECK (last_page_url IS NULL OR length(last_page_url) <= 2048),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (visitor_id) REFERENCES visitors(id)
) STRICT;

CREATE TABLE messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('visitor', 'owner', 'system')),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  page_url TEXT CHECK (page_url IS NULL OR length(page_url) <= 2048),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
) STRICT;

CREATE UNIQUE INDEX idx_conversations_one_open_per_visitor
  ON conversations(visitor_id)
  WHERE status = 'open';

CREATE INDEX idx_conversations_visitor_updated
  ON conversations(visitor_id, updated_at DESC);

CREATE INDEX idx_conversations_status_updated
  ON conversations(status, updated_at DESC);

CREATE INDEX idx_messages_conversation_created
  ON messages(conversation_id, created_at ASC);
