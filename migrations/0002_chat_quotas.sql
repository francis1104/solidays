ALTER TABLE visitors ADD COLUMN message_count INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0);
ALTER TABLE visitors ADD COLUMN message_bytes INTEGER NOT NULL DEFAULT 0 CHECK (message_bytes >= 0);

ALTER TABLE conversations ADD COLUMN message_count INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0);
ALTER TABLE conversations ADD COLUMN message_bytes INTEGER NOT NULL DEFAULT 0 CHECK (message_bytes >= 0);

UPDATE conversations
SET
  message_count = (
    SELECT COUNT(*)
    FROM messages
    WHERE messages.conversation_id = conversations.id
  ),
  message_bytes = COALESCE(
    (
      SELECT SUM(
        length(CAST(messages.content AS BLOB)) +
        length(CAST(COALESCE(messages.page_url, '') AS BLOB))
      )
      FROM messages
      WHERE messages.conversation_id = conversations.id
    ),
    0
  );

UPDATE visitors
SET
  message_count = (
    SELECT COUNT(*)
    FROM messages
    INNER JOIN conversations ON conversations.id = messages.conversation_id
    WHERE conversations.visitor_id = visitors.id
  ),
  message_bytes = COALESCE(
    (
      SELECT SUM(
        length(CAST(messages.content AS BLOB)) +
        length(CAST(COALESCE(messages.page_url, '') AS BLOB))
      )
      FROM messages
      INNER JOIN conversations ON conversations.id = messages.conversation_id
      WHERE conversations.visitor_id = visitors.id
    ),
    0
  );

CREATE INDEX idx_messages_conversation_cursor
  ON messages(conversation_id, created_at DESC, id DESC);

CREATE TRIGGER messages_enforce_chat_quotas
BEFORE INSERT ON messages
WHEN EXISTS (
  SELECT 1
  FROM conversations
  INNER JOIN visitors ON visitors.id = conversations.visitor_id
  WHERE conversations.id = NEW.conversation_id
    AND (
      conversations.message_count >= 50 OR
      conversations.message_bytes +
        length(CAST(NEW.content AS BLOB)) +
        length(CAST(COALESCE(NEW.page_url, '') AS BLOB)) > 131072 OR
      visitors.message_count >= 200 OR
      visitors.message_bytes +
        length(CAST(NEW.content AS BLOB)) +
        length(CAST(COALESCE(NEW.page_url, '') AS BLOB)) > 524288
    )
)
BEGIN
  SELECT RAISE(ABORT, 'CHAT_QUOTA_EXCEEDED');
END;

CREATE TRIGGER messages_increment_chat_quotas
AFTER INSERT ON messages
BEGIN
  UPDATE conversations
  SET
    message_count = message_count + 1,
    message_bytes = message_bytes +
      length(CAST(NEW.content AS BLOB)) +
      length(CAST(COALESCE(NEW.page_url, '') AS BLOB))
  WHERE id = NEW.conversation_id;

  UPDATE visitors
  SET
    message_count = message_count + 1,
    message_bytes = message_bytes +
      length(CAST(NEW.content AS BLOB)) +
      length(CAST(COALESCE(NEW.page_url, '') AS BLOB))
  WHERE id = (
    SELECT visitor_id FROM conversations WHERE id = NEW.conversation_id
  );
END;

CREATE TRIGGER messages_decrement_chat_quotas
AFTER DELETE ON messages
BEGIN
  UPDATE conversations
  SET
    message_count = MAX(message_count - 1, 0),
    message_bytes = MAX(
      message_bytes -
        length(CAST(OLD.content AS BLOB)) -
        length(CAST(COALESCE(OLD.page_url, '') AS BLOB)),
      0
    )
  WHERE id = OLD.conversation_id;

  UPDATE visitors
  SET
    message_count = MAX(message_count - 1, 0),
    message_bytes = MAX(
      message_bytes -
        length(CAST(OLD.content AS BLOB)) -
        length(CAST(COALESCE(OLD.page_url, '') AS BLOB)),
      0
    )
  WHERE id = (
    SELECT visitor_id FROM conversations WHERE id = OLD.conversation_id
  );
END;
