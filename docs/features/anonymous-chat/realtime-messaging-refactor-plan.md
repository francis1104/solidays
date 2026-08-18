# 项目消息实时性改造方案

## 1. 背景

当前匿名留言功能已经从 V1 的“访客单向留言”演进到支持 `/admin` 后台查看会话和 owner 回复，但消息链路仍然以 **HTTP 请求 + D1 持久化 + 页面主动拉取** 为主。

现有核心路径：

```text
Visitor
  │
  ├─ POST /api/chat/messages
  │    ├─ Origin / Rate Limit / Turnstile
  │    └─ persistVisitorMessage()
  │           ↓
  │          D1
  │
  └─ GET /api/chat/conversation
             ↓
            D1

Admin
  │
  ├─ GET /api/admin/conversations
  ├─ GET /api/admin/conversations/:id/messages
  └─ POST /api/admin/conversations/:id/messages
             ↓
            D1
```

D1 当前承担：

- `visitors`、`conversations`、`messages` 的持久化；
- 每个 visitor 只存在一个 open conversation 的约束；
- visitor/conversation 消息数量和字节数配额；
- 消息历史游标分页；
- Admin 全局 conversation 列表、状态筛选和排序；
- owner 回复写入时的 open 状态检查；
- closed / stale open 会话的定时清理。

这部分已经形成稳定的数据模型和一致性边界，不适合为了实时性整体迁移到 Durable Objects。

当前真正缺失的是 **消息事件的实时协调层**：

1. 访客聊天窗口保持打开时，owner 新回复不会自动出现；
2. Admin 会话详情保持打开时，visitor 新留言不会自动出现；
3. Admin 会话列表不会因新消息自动更新排序或 unread 状态；
4. 新留言没有可靠的异步外部通知链路，例如 Slack；
5. 未来如果增加 Slack、Discord、邮件等渠道，目前缺少统一的消息事件边界。

因此本方案不做“D1 → Durable Object”的数据库替换，而是在现有 D1 之上增加实时与事件基础设施。

---

## 2. 改造目标

### 2.1 核心目标

采用以下职责拆分：

```text
D1               = durable source of truth
Durable Object   = per-conversation realtime coordinator
Cloudflare Queue = asynchronous integration delivery
```

目标架构：

```text
                         ┌────────────────────────────┐
                         │             D1             │
                         │ messages / conversations   │
                         │ history / quota / indexes  │
                         └──────────────┬─────────────┘
                                        │
                 persist first          │
                                        │
Visitor ── HTTP ── Worker / Next API ───┼──────── Admin HTTP
   │                    │               │
   │                    │               │
   │              publish event         │
   │                    ▼               │
   └── WebSocket ─ ChatConversation DO ─┘
                         │
                         ├── WebSocket → Visitor
                         ├── WebSocket → Admin
                         │
                         └── integration event
                                  │
                                  ▼
                          Cloudflare Queue
                                  │
                                  ▼
                         Slack Incoming Webhook
```

具体目标：

- visitor 与 admin 在会话打开期间可以实时看到新消息；
- D1 继续作为消息历史和业务状态唯一可信来源；
- Durable Object 不承担全局 conversation 查询；
- 外部通知不阻塞 visitor 的消息提交请求；
- Slack 短暂失败可以自动重试；
- 同一个消息事件可以在未来复用到其他通知渠道；
- 实时层故障时，现有 HTTP + D1 能继续完成核心留言功能；
- 改造可以分阶段上线，支持快速回退。

### 2.2 非目标

第一阶段不包含：

- 不把 `messages` / `conversations` 主存储迁移到 Durable Object SQLite；
- 不删除 D1 当前 quota trigger；
- 不改变 Admin conversation 全局分页方案；
- 不实现 Slack 中直接回复访客；
- 不实现复杂 presence、typing indicator、read receipt；
- 不引入 AI 自动回复；
- 不要求所有历史消息通过 WebSocket 传输。

---

## 3. 为什么不整体迁移到 Durable Object

Durable Object 适合围绕单一协调实体建模，例如一个 chat room / conversation 对应一个 Object。它的优势主要是：

- 同一 Object 内请求串行协调；
- 强一致状态；
- 长连接 / WebSocket；
- 每个实体独立生命周期；
- 可以承载少量会话级实时状态。

但当前项目还有大量 **跨 conversation 全局查询**：

```sql
SELECT ...
FROM conversations
WHERE status = ?
ORDER BY updated_at DESC, id DESC
LIMIT ?
```

Admin 首页需要：

- open / closed / all 筛选；
- `updated_at` 全局排序；
- 跨 conversation 游标分页；
- last message 摘要；
- visitor message count。

如果把每个 conversation 独立存进一个 Durable Object，以上查询就需要额外建立全局索引系统，反而会把已经稳定的 D1 能力重新实现一遍。

另外 D1 当前已经使用 trigger 强制配额，且 owner 回复的 open 状态检查也在写入批次中完成。这些业务约束没有必要迁移。

因此本方案保持：

```text
D1 = authoritative business data
DO = realtime coordination only
```

---

## 4. Durable Object 设计

### 4.1 Object 粒度

新增：

```text
ChatConversation
```

每个 conversation 一个 Durable Object：

```ts
const stub = env.CHAT_CONVERSATIONS.getByName(conversationId)
```

禁止使用一个全局 DO 管理所有聊天，否则会形成单点串行瓶颈。

Object 名字直接使用已经落库的 `conversationId`，因此：

- 不需要额外保存 conversationId → DO ID 映射；
- 同一 conversation 永远路由到同一个 Object；
- 关闭后仍可以按原 conversationId 找到对应 Object；
- DO eviction 不影响历史数据，因为历史仍在 D1。

### 4.2 DO 不保存什么

第一阶段 DO **不复制完整消息历史**。

不建议：

```text
D1 messages
      ↓ duplicate
DO SQLite messages
```

这样会出现双写一致性问题。

DO 只保留实时协调所需的临时状态，例如：

- WebSocket connections；
- connection metadata；
- 当前 visitor/admin 是否在线；
- 可选的最后一个广播 event id；
- 可选的短生命周期去重键。

即使 DO 完全被销毁或重新冷启动，也能依赖 D1 恢复业务状态。

### 4.3 建议的 DO RPC

第一版建议保持 API 很小：

```ts
export type ChatRealtimeEvent = {
  eventId: string
  type: 'message.created' | 'conversation.closed'
  conversationId: string
  occurredAt: number
  message?: {
    id: string
    role: 'visitor' | 'owner' | 'system'
    content: string
    pageUrl: string | null
    createdAt: number
  }
}

export class ChatConversation extends DurableObject<Env> {
  async publish(event: ChatRealtimeEvent): Promise<void>

  async connectVisitor(request: Request): Promise<Response>

  async connectAdmin(request: Request): Promise<Response>
}
```

如果 RPC + WebSocket upgrade 的组合在当前 OpenNext/Worker 入口下实现不够自然，也可以让 Worker 先根据内部路径转发到 DO `fetch()`；但普通业务调用优先使用 RPC，避免把 DO 设计成第二套公开 HTTP API。

### 4.4 WebSocket 客户端类型

同一 conversation DO 可以同时存在两类客户端：

```text
visitor
admin
```

connection metadata 至少记录：

```ts
type ChatSocketAttachment = {
  audience: 'visitor' | 'admin'
  conversationId: string
}
```

Admin 连接前必须继续走现有 Admin Session 验证，不能因为切到 WebSocket 就绕过 `/admin` 的认证模型。

Visitor 连接必须校验：

- `chat_visitor` Cookie；
- Cookie 对应 visitor 是否拥有该 open conversation；
- Origin；
- conversationId 是否匹配该 visitor 当前会话。

WebSocket 建立后不能接受客户端自报 visitorId / conversationId 作为授权依据。

---

## 5. 消息写入顺序与一致性

本方案最重要的约束：

> **先持久化 D1，再发布实时事件。**

### 5.1 Visitor 消息

推荐链路：

```text
POST /api/chat/messages
        │
        ├─ Origin
        ├─ Rate Limit
        ├─ Turnstile
        │
        ├─ persistVisitorMessage(D1)
        │      │
        │      └─ success
        │
        ├─ ChatConversation.publish(message.created)
        │
        ├─ CHAT_NOTIFICATION_QUEUE.send(...)
        │
        └─ 201 response
```

严禁：

```text
publish realtime
   ↓
Slack notify
   ↓
D1 write fails
```

否则客户端和 Slack 会看到一条实际不存在的消息。

### 5.2 Owner 消息

推荐链路：

```text
POST /api/admin/conversations/:id/messages
        │
        ├─ Admin Session
        ├─ Origin
        │
        ├─ persistOwnerMessage(D1)
        │      └─ open-status check remains in D1 batch
        │
        ├─ ChatConversation.publish(message.created)
        │
        └─ 201 response
```

Owner reply 第一阶段不需要发送 Slack notification，避免管理员自己回复后再次被通知。

### 5.3 实时 publish 失败怎么办

D1 成功、DO publish 失败时：

- **不能回滚 D1 message**；
- API 请求仍应优先返回写入成功；
- 记录可观测日志；
- 客户端下次重新连接或重新拉历史时从 D1 补齐。

这样实时层是增强能力，不会变成消息写入的单点故障。

如后续对实时可靠性要求升高，可以再引入事件 outbox；第一阶段不建议为了极低概率的广播失败增加复杂度。

---

## 6. WebSocket 实时协议

### 6.1 建议路由

建议新增：

```text
GET /api/chat/realtime
GET /api/admin/conversations/:id/realtime
```

这两个公开入口分别完成 visitor/admin 权限检查，再连接对应 conversation DO。

不要直接暴露类似：

```text
/realtime/:conversationId
```

然后只依赖客户端传入 ID。

### 6.2 Server → Client event

第一阶段只需要少量协议：

```json
{
  "eventId": "uuid",
  "type": "message.created",
  "conversationId": "uuid",
  "occurredAt": 1770000000000,
  "message": {
    "id": "uuid",
    "role": "owner",
    "content": "收到，我晚点回复你。",
    "pageUrl": null,
    "createdAt": 1770000000000
  }
}
```

以及：

```json
{
  "eventId": "uuid",
  "type": "conversation.closed",
  "conversationId": "uuid",
  "occurredAt": 1770000000000
}
```

### 6.3 Client → Server

第一阶段可以不支持业务消息从 WebSocket 上行。

即：

```text
HTTP      = command / write
WebSocket = server event stream
```

访客发送消息仍使用现有：

```text
POST /api/chat/messages
```

Admin 回复仍使用：

```text
POST /api/admin/conversations/:id/messages
```

这样可以保留现有：

- Turnstile；
- Rate Limit；
- Origin 校验；
- Admin Session；
- D1 repository；
- 错误码与表单状态。

没有必要第一阶段把“发消息”也迁进 WebSocket 协议。

### 6.4 去重

HTTP 提交成功后，发送方本地已经会把返回的 message 加进 UI；随后 WebSocket 可能再次收到同一 `message.created`。

因此前端必须继续使用 message id 去重：

```ts
if (current.some((item) => item.id === incoming.id)) {
  return current
}
```

事件级别也建议生成独立 `eventId`，供日志和 future integration 使用。

---

## 7. Visitor 前端改造

当前 `components/chat/floating-chat.tsx` 在：

- 第一次打开时加载 conversation history；
- 同一次页面生命周期重新打开时，通过“向旧消息翻页直到与本地已知 ID 重叠”补齐关闭期间的消息。

该机制可以保留作为 reconnect fallback。

### 7.1 新流程

```text
打开聊天框
   │
   ├─ GET /api/chat/conversation
   │       ↓
   │    initial history
   │
   └─ connect WebSocket
           │
           └─ message.created → append/dedupe
```

### 7.2 断线策略

WebSocket 断开：

```text
disconnect
   │
   ├─ exponential reconnect
   │
   └─ reconnect success
          │
          └─ HTTP gap recovery from D1
```

由于第一阶段不维护严格的 event offset，重连成功后推荐复用已有 `fetchMessagesUntilOverlap()` 逻辑，从 D1 做一次 gap recovery。

这样无需给 DO 实现 durable event log。

### 7.3 UI 状态

第一阶段无需显式向用户展示“WebSocket connected”。

可以只在开发日志或 Admin debug 信息中观察状态。

如果实时连接长期失败，用户仍然可以：

- 正常发送消息；
- 关闭再打开聊天；
- 重新加载历史。

因此实时连接不可用不应直接显示为“留言服务不可用”。

---

## 8. Admin 前端改造

### 8.1 Conversation detail

当前 `ConversationDetail` 初次进入后 GET 消息列表，owner 回复后本地 append。

增加 WebSocket 后：

```text
ConversationDetail mount
   │
   ├─ GET history
   │
   └─ connect admin realtime
          │
          ├─ visitor message.created → append
          └─ owner message.created   → dedupe
```

如果管理员停留在会话详情页，visitor 新留言应自动出现。

### 8.2 Conversation list

第一阶段可以分两步：

#### Phase A

只保证打开的 conversation detail 实时。

#### Phase B

增加 Admin 全局事件连接，用于：

- 新消息时刷新 conversation list；
- 更新 `updatedAt`；
- 将有新消息的 conversation 移到顶部；
- 增加 unread badge。

这里不建议用一个全局 ChatConversation DO 管理所有 conversation。

如果后续确实需要后台全局 realtime，可以单独设计：

```text
AdminInbox DO
```

它只做 Admin inbox event fan-out，不负责 conversation 状态和历史。

第一阶段可以暂时不做，避免过度设计。

---

## 9. Slack 通知设计

### 9.1 为什么不直接在请求中调用 Slack

不建议：

```text
POST visitor message
   ├─ D1 write
   ├─ fetch Slack webhook  ← request waits here
   └─ return 201
```

问题：

- Slack latency 增加用户提交耗时；
- Slack 429 / 5xx 影响留言 API；
- 外部平台故障会污染核心业务错误率；
- 后续增加其他 integration 会继续扩大请求链。

### 9.2 Queue 架构

增加：

```text
CHAT_NOTIFICATION_QUEUE
```

Visitor 消息 D1 写入成功后发送事件：

```ts
type ChatIntegrationEvent = {
  eventId: string
  type: 'chat.message.created'
  messageId: string
  conversationId: string
  visitorId: string
  content: string
  pageUrl: string | null
  createdAt: number
}
```

Queue consumer：

```text
CHAT_NOTIFICATION_QUEUE
        │
        └─ consumer
             │
             ├─ build Slack payload
             ├─ POST Incoming Webhook
             │
             ├─ 2xx → ack
             └─ failure → retry / DLQ
```

### 9.3 Slack Secret

新增 Worker Secret：

```text
SLACK_CHAT_WEBHOOK_URL
```

只允许通过安全 secret 管理方式写入，不进入：

- Git；
- `.env.production`；
- 文档中的真实 URL；
- 日志；
- commit message。

`wrangler.jsonc` 只声明 required secret 名称。

### 9.4 Slack 消息格式

第一版建议保持简单：

```text
💬 New visitor message

Visitor: #<short id>
Page: /gallery
Conversation: <short id>

<message content>

Open Admin: https://solidays.win/admin
```

可以使用 Slack Block Kit，但不要第一版就引入复杂交互。

需要注意：visitor content 属于不可信用户输入。

Slack payload 必须：

- 作为纯文本处理；
- 不把 visitor content 拼接到 URL；
- 不解释 HTML；
- 限制消息长度；
- 日志中避免打印完整留言内容。

### 9.5 重试与幂等

Queue 是至少一次投递模型，理论上同一消息可能重复送达 consumer。

第一阶段 Slack Incoming Webhook 本身没有天然 idempotency key，因此需要接受“极低概率重复通知”，或者增加简单去重状态。

推荐第一阶段：

- Queue event 使用稳定 `eventId`；
- consumer 日志包含 `eventId` / `messageId`，不包含 secret；
- 不因为实现严格 exactly-once 而引入额外数据库；
- 如果实际观察到重复通知，再增加 D1/DO notification ledger。

---

## 10. Slack 双向回复：第二阶段

第一版 Incoming Webhook 只解决：

```text
Website → Slack
```

如果以后需要：

```text
Slack → Website visitor
```

需要升级为 Slack App，而不是继续扩展 Incoming Webhook。

建议链路：

```text
Visitor message
   ↓
Slack thread / interactive message
   │
   └─ Reply action
          │
          ▼
POST /api/integrations/slack/actions
          │
          ├─ verify Slack signature
          ├─ resolve conversationId
          ├─ persistOwnerMessage(D1)
          └─ ChatConversation.publish()
                   │
                   ▼
                Visitor
```

届时需要新增：

```text
SLACK_SIGNING_SECRET
```

并验证 Slack request signature 与 timestamp，防止伪造和 replay。

不建议通过“监听 thread 中所有普通文本”自动把 Slack 消息当 owner reply；显式 Reply action 的边界更清晰。

---

## 11. Cloudflare 配置改造

当前 `wrangler.jsonc` 已存在：

- D1 `CHAT_DB`；
- R2；
- AI；
- Rate Limiting；
- Cron；
- required secrets。

第一阶段预计新增：

```jsonc
{
  "durable_objects": {
    "bindings": [
      {
        "name": "CHAT_CONVERSATIONS",
        "class_name": "ChatConversation"
      }
    ]
  },

  "migrations": [
    {
      "tag": "chat-realtime-v1",
      "new_sqlite_classes": ["ChatConversation"]
    }
  ],

  "queues": {
    "producers": [
      {
        "binding": "CHAT_NOTIFICATION_QUEUE",
        "queue": "solidays-chat-notifications"
      }
    ],
    "consumers": [
      {
        "queue": "solidays-chat-notifications",
        "dead_letter_queue": "solidays-chat-notifications-dlq"
      }
    ]
  }
}
```

具体字段以当前 Wrangler 版本生成的 schema 为准，实施时先用项目内置 Wrangler 校验，不直接照抄文档片段部署。

Required secrets 增加：

```text
SLACK_CHAT_WEBHOOK_URL
```

注意：即使 DO 第一版不主动使用 SQLite 存业务数据，也建议按 Cloudflare 当前 Durable Object class migration 要求正确声明 migration，而不是依赖隐式配置。

---

## 12. Worker 入口改造

当前 `custom-worker.ts` 已经负责：

- OpenNext Worker fetch；
- scanner path 早 404；
- response cache policy；
- scheduled chat cleanup；
- 转出 OpenNext 自身的 DO 类。

实时改造后预计新增：

```ts
export { ChatConversation } from './lib/chat/realtime-object'
```

以及 Queue consumer：

```ts
export default {
  fetch,
  scheduled,
  queue,
} satisfies ExportedHandler<CloudflareEnv>
```

需要注意不要破坏现有 OpenNext 导出：

```ts
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from './.open-next/worker.js'
```

因此实施前必须确认 OpenNext Worker 自己的 queue / DO export 与应用新增 handler 是否存在命名或 handler 合并冲突。

---

## 13. 建议代码目录

新增模块建议保持现有 `lib/chat/` 边界：

```text
lib/chat/
├── realtime-object.ts
├── realtime-events.ts
├── realtime.ts
├── notifications.ts
└── slack.ts
```

职责建议：

### `realtime-events.ts`

只放类型和协议：

- `ChatRealtimeEvent`；
- `ChatIntegrationEvent`；
- event builder。

### `realtime-object.ts`

只放 `ChatConversation` Durable Object：

- WebSocket accept；
- attachment；
- broadcast；
- publish RPC。

不要从这里直接实现 D1 repository。

### `realtime.ts`

Worker / Next route 使用的 DO adapter：

- `publishConversationEvent()`；
- connect helper；
- failures/logging normalization。

### `notifications.ts`

Queue producer / consumer 的应用边界。

### `slack.ts`

纯 Slack payload builder + webhook sender。

不要把 Slack fetch 直接塞进 `lib/chat/repository.ts`。

---

## 14. API 变更范围

预计新增：

```text
app/api/chat/realtime/route.ts
app/api/admin/conversations/[id]/realtime/route.ts
```

预计修改：

```text
app/api/chat/messages/route.ts
app/api/admin/conversations/[id]/messages/route.ts
app/api/chat/conversation/close/route.ts
```

行为：

- message persist 成功后 publish DO event；
- visitor message persist 成功后 enqueue integration event；
- conversation close 成功后 publish `conversation.closed`。

保持不变：

```text
GET /api/chat/conversation
GET /api/admin/conversations
GET /api/admin/conversations/:id/messages
```

它们继续作为历史读取和 reconnect recovery 的权威接口。

---

## 15. 事件发布辅助函数

建议把“写完后广播”的逻辑集中封装，避免 route handler 重复：

```ts
export async function publishMessageCreated(
  env: CloudflareEnv,
  conversationId: string,
  message: MessageRow
): Promise<void> {
  const stub = env.CHAT_CONVERSATIONS.getByName(conversationId)

  await stub.publish({
    eventId: crypto.randomUUID(),
    type: 'message.created',
    conversationId,
    occurredAt: Date.now(),
    message: toRealtimeMessage(message),
  })
}
```

调用方需要明确区分：

```text
persistence failure = request failure
realtime failure    = degraded enhancement
queue failure       = integration degraded
```

是否让 Queue producer 失败影响 API 返回需要单独决策。

第一阶段建议：

- D1 failure：返回 5xx；
- DO publish failure：记录 error，消息仍成功；
- Queue enqueue failure：记录 error，消息仍成功。

如果以后要求“所有留言必须通知到 owner”，应改成 transactional outbox，而不是直接把 Queue failure 变成 visitor API failure。

---

## 16. 可观测性

新增日志应使用结构化、低敏感度字段：

```text
chat_realtime_publish_failed
chat_realtime_connected
chat_realtime_disconnected
chat_notification_enqueued
chat_notification_failed
chat_slack_delivery_failed
```

建议字段：

```ts
{
  event: 'chat_realtime_publish_failed',
  conversationId,
  messageId,
  eventId,
  role,
}
```

禁止记录：

- Slack webhook URL；
- Turnstile secret；
- Admin password/session secret；
- 完整 Cookie；
- visitor 完整 IP；
- 默认打印完整 message content。

需要分析消息内容时，应在明确授权的 Admin 数据面查看 D1，而不是依赖日志。

---

## 17. 安全边界

### 17.1 Visitor realtime

必须保持：

- same-origin；
- visitor Cookie；
- conversation ownership；
- 不信任客户端传入 visitorId；
- 不允许通过任意 conversationId 订阅其他访客会话。

### 17.2 Admin realtime

必须保持：

- Admin Session 校验；
- session 失效后不再建立新连接；
- 如果连接期间 session 到期，第一阶段可以等 socket 断开后重新校验；
- 后续如需要严格即时撤销，再增加 session expiry attachment / server close。

### 17.3 WebSocket payload

Server 不接受客户端发来的业务 message command。

如果收到未知 frame：

- ignore 或 protocol close；
- 不做 D1 write；
- 不把 payload broadcast 给其他连接。

这可以显著缩小第一阶段攻击面。

---

## 18. 分阶段实施

### Phase 0：准备

- [ ] 重新确认 `cloudflare-worker-DEV` 当前 D1 schema、Admin V2 状态和 OpenNext Worker export。
- [ ] 确认当前 Wrangler 对 DO、Queue、DLQ 配置 schema。
- [ ] 更新 Cloudflare binding types。
- [ ] 创建不含真实 secret 的配置声明。

### Phase 1：Durable Object 基础

- [ ] 新增 `ChatConversation` DO。
- [ ] `wrangler.jsonc` 增加 DO binding + migration。
- [ ] 实现 visitor/admin WebSocket connection。
- [ ] 实现 `publish(message.created)`。
- [ ] 增加 realtime route auth。
- [ ] 为 DO 和 event builder 增加测试。

验收：

```text
visitor socket + admin socket
          │
          └─ synthetic publish
                  ↓
              both receive
```

### Phase 2：接入消息写入

- [ ] visitor D1 persist 成功后 publish。
- [ ] owner D1 persist 成功后 publish。
- [ ] close conversation 后 publish `conversation.closed`。
- [ ] DO 故障不能破坏 D1 核心写入。

验收：

- Admin 详情打开时 visitor 新留言自动出现；
- visitor 窗口打开时 owner 回复自动出现；
- sender 不产生重复 message；
- refresh 后 D1 历史完整。

### Phase 3：重连与 gap recovery

- [ ] Visitor socket reconnect。
- [ ] Admin detail socket reconnect。
- [ ] reconnect 后从 D1 补 gap。
- [ ] 网络 offline/online 场景测试。

验收：

```text
socket disconnect
  → create message through HTTP
  → reconnect
  → missing message recovered exactly once in UI
```

### Phase 4：Queue + Slack

- [ ] 创建 notification queue。
- [ ] 创建 DLQ。
- [ ] 增加 producer binding。
- [ ] visitor message enqueue。
- [ ] consumer 调 Slack webhook。
- [ ] webhook secret 通过 Wrangler Secret 配置。
- [ ] 验证 retry 和 failure logging。

验收：

- visitor 发送成功不等待 Slack response；
- Slack 正常时收到一条通知；
- Slack 临时失败时 visitor message 仍成功；
- consumer retry 可观察；
- webhook URL 不出现在 Git/日志。

### Phase 5：Admin Inbox realtime（可选）

- [ ] 评估是否确实需要 Admin conversation list 实时排序。
- [ ] 如需要，单独设计 Admin inbox event fan-out。
- [ ] 增加 unread 状态前先明确 unread 的业务语义和持久化边界。

### Phase 6：Slack 双向（可选）

- [ ] Slack App。
- [ ] signing secret。
- [ ] request signature verification。
- [ ] interactive Reply action。
- [ ] Slack action → D1 owner message → DO realtime。

---

## 19. 测试方案

### 19.1 单元测试

覆盖：

- realtime event builder；
- message DTO → realtime payload；
- Slack payload builder；
- secret missing；
- unsupported event；
- WebSocket attachment parsing；
- duplicate message id handling。

### 19.2 Durable Object 测试

至少验证：

- 同 conversationId 命中同一 Object；
- visitor/admin socket 都能收到 publish；
- 一个断开的 socket 不影响其他 socket；
- malformed client frame 不触发业务写入；
- object cold start 后仍可继续接受连接。

### 19.3 API integration

Visitor：

- POST message → D1 有记录；
- POST message → realtime event；
- POST message → queue event；
- DO/Queue 模拟 failure → HTTP 仍符合预期策略。

Admin：

- owner reply → D1；
- owner reply → visitor realtime；
- closed conversation → 409；
- unauthorized realtime → 401。

### 19.4 Browser manual verification

按项目既有规则，在 `cloudflare-worker-DEV` 提交前通过本地 Worker + 浏览器实际验证：

1. Desktop 打开 `/admin` conversation detail；
2. 另一个浏览器/隐私窗口模拟 visitor；
3. visitor 留言；
4. Admin 不刷新自动出现；
5. Admin 回复；
6. Visitor 不刷新自动出现；
7. DevTools 模拟 Offline；
8. Offline 期间另一端发消息；
9. 恢复 Online；
10. reconnect + D1 gap recovery 后消息无缺失、无重复。

### 19.5 Queue verification

开发阶段避免把真实 Slack channel 当高频测试目标。

优先：

- local/mock webhook；
- dedicated dev Slack webhook；
- 明确区分 dev/prod secret。

正式上线前再完成一次真实 Slack smoke test。

---

## 20. 发布策略

所有实现先进入：

```text
cloudflare-worker-DEV
```

完成本地 Worker 验证、类型检查、lint、build、dry-run 后，再按项目 release process 合并到：

```text
cloudflare-worker
```

不要直接在生产分支开发实时能力。

### 20.1 建议开关

为降低上线风险，可以加 vars：

```text
CHAT_REALTIME_ENABLED
CHAT_SLACK_NOTIFICATIONS_ENABLED
```

默认：

```text
DEV  → realtime=true, slack 可按测试环境决定
PROD → 首次部署前显式确认
```

如果不希望增加永久 feature flag，也至少在首次生产发布周期保留快速关闭通知的配置能力。

### 20.2 回退

实时功能回退原则：

```text
disable DO realtime / client socket
            ↓
        HTTP + D1 remains
```

Slack 回退：

```text
CHAT_SLACK_NOTIFICATIONS_ENABLED=false
```

或停止 consumer / 移除 producer 调用。

不要通过删除 D1 message 或回滚已有 conversation schema 来回退实时功能。

---

## 21. 预期文件变更清单

第一阶段大致涉及：

```text
wrangler.jsonc
cloudflare-env.d.ts
custom-worker.ts

lib/chat/realtime-events.ts
lib/chat/realtime-object.ts
lib/chat/realtime.ts
lib/chat/notifications.ts
lib/chat/slack.ts

app/api/chat/realtime/route.ts
app/api/chat/messages/route.ts
app/api/chat/conversation/close/route.ts

app/api/admin/conversations/[id]/realtime/route.ts
app/api/admin/conversations/[id]/messages/route.ts

components/chat/floating-chat.tsx
components/admin/conversation-detail.tsx
```

Queue / DO 测试文件按最终测试框架位置添加。

原则上不需要修改：

```text
migrations/0001_chat.sql
migrations/0002_chat_quotas.sql
migrations/0003_admin_owner_messages.sql
```

因为 D1 业务数据模型不因实时能力改变。

---

## 22. 关键设计决策总结

### 决策 1：D1 不迁移

原因：

- 已有全局查询；
- 已有 quota trigger；
- 已有 conversation 状态约束；
- 已有分页和保留策略；
- Durable Object 不适合替代当前全局 Admin 数据模型。

### 决策 2：一个 conversation 一个 DO

原因：

- 与协调实体天然一致；
- 避免全局 DO 串行瓶颈；
- deterministic routing 简单；
- WebSocket 生命周期与 conversation 对齐。

### 决策 3：HTTP 写，WebSocket 收事件

原因：

- 保留现有安全链路；
- 减少第一阶段协议复杂度；
- realtime 层故障不影响核心提交；
- 更容易渐进迁移。

### 决策 4：Slack 通过 Queue

原因：

- 不阻塞 visitor API；
- 支持 retry / DLQ；
- 外部平台故障与核心留言隔离；
- 后续 integration 可复用事件。

### 决策 5：persist first, publish second

原因：

- D1 是唯一 source of truth；
- 不允许实时端或 Slack 出现“幽灵消息”；
- reconnect 可以始终从 D1 恢复。

---

## 23. 第一版完成定义

只有同时满足以下条件，才算“消息实时性改造 V1”完成：

- [ ] D1 仍是唯一消息持久化 source of truth；
- [ ] 每个 conversation 使用独立 Durable Object；
- [ ] visitor 打开窗口时可实时收到 owner reply；
- [ ] Admin 打开详情时可实时收到 visitor message；
- [ ] socket 断开不影响 HTTP 留言与回复；
- [ ] reconnect 后可以从 D1 补齐断线期间消息；
- [ ] realtime duplicate 不会造成 UI 重复消息；
- [ ] visitor 新留言异步进入 Queue；
- [ ] Slack notification 不阻塞 visitor POST；
- [ ] Slack 失败有 retry / failure observability；
- [ ] Slack webhook secret 不进入 Git 或日志；
- [ ] 本地 Worker 浏览器双端测试通过；
- [ ] `worker:types`、lint、build、Wrangler dry-run 通过；
- [ ] 所有开发和验证先在 `cloudflare-worker-DEV` 完成；
- [ ] 验证通过后才进入 `cloudflare-worker` 生产发布流程。

---

## 24. 后续可扩展方向

完成该基础层后，可以在不修改 D1 主数据模型的前提下逐步增加：

```text
Realtime layer
├── visitor ↔ admin realtime
├── admin inbox live update
├── presence
├── typing
└── read receipt

Integration layer
├── Slack
├── Discord
├── Email
├── Telegram
└── Push notification
```

如果未来聊天量和产品形态发生明显变化，再重新评估是否需要把某些会话级状态迁入 DO SQLite；当前阶段没有必要提前承担双存储和全局索引复杂度。
