// 前四项配额与 migrations/0002_chat_quotas.sql 中 messages_enforce_chat_quotas
// 触发器里的字面量（50 / 131072 / 200 / 524288）重复定义；修改任一处必须同步另一处，
// 否则接口提示与实际限流行为会不一致。迁移已在生产应用，改配额需新增迁移。
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
