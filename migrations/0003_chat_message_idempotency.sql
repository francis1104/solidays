ALTER TABLE messages ADD COLUMN client_message_id TEXT;

CREATE UNIQUE INDEX idx_messages_client_message_id
  ON messages(client_message_id)
  WHERE client_message_id IS NOT NULL;
