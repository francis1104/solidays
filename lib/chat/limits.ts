export const CHAT_LIMITS = {
  maxMessagesPerConversation: 50,
  maxMessageBytesPerConversation: 128 * 1024,
  maxMessagesPerVisitor: 200,
  maxMessageBytesPerVisitor: 512 * 1024,
  historyPageSize: 20,
  closedConversationRetentionMs: 30 * 24 * 60 * 60 * 1000,
  staleOpenConversationRetentionMs: 90 * 24 * 60 * 60 * 1000,
  purgeBatchSize: 100,
  cleanupCron: '0 3 * * *',
} as const
