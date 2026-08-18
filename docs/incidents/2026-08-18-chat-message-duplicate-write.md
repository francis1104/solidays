# 生产事故记录：匿名留言误报冲突、重复落库与发送延迟

- 日期：2026-08-18
- 站点：`https://solidays.win`
- Worker：`solidays-worker`
- 数据库：Cloudflare D1 `solidays-chat`
- 相关分支：`cloudflare-worker`、`cloudflare-worker-DEV`
- 严重程度：P0（消息写入结果与 HTTP 响应不一致，可能重复落库）
- 当前状态：根因已完成静态分析并用生产数据高度验证；修复已在 `cloudflare-worker-DEV` 实施并通过本地
  Worker/真实本地 D1 回归，等待 DEV 提交和生产发布后的浏览器验收

这份文档记录匿名留言发送链路在生产出现的几种表现、排查证据、根因判断、为什么现有测试没有挡住，以及下一步应如何修复和验收。

## 1. 用户实际看到的表现

这次问题不是一个单独的错误提示，而是同一条写入链路在不同时间点表现出的多个症状。

### 1.1 点击发送后提示“留言状态已经变化”

用户点击发送后，界面很快显示：

```text
留言状态刚刚发生变化，请稍后重试。
```

对应接口响应是：

```text
POST /api/chat/messages
HTTP 503
code: CHAT_WRITE_RETRY
```

这个提示目前被前端理解为“这次留言没有提交成功”，但实际并不能证明 D1 没有写入。

### 1.2 返回失败，但消息实际上已经落库

生产 D1 中能查到与本次发送内容对应的 visitor 消息。也就是说：

```text
HTTP 响应：失败
D1 写入：成功
```

这是本事故最关键的语义错误：客户端收到的是失败结论，数据库已经把命令执行完了。

### 1.3 发送栏没有清空

由于前端收到 503 后进入失败分支，输入框中的原文本仍然保留。用户会自然地认为：

> “刚才没有发出去，我再点一次。”

但第一次请求可能已经成功写入，因此第二次操作不是简单重试，而是再次创建一条新的消息。

### 1.4 重复点击会继续发送，最终出现两条或更多条

当前前端主要依赖 React 的 `isSending` state 防止重复提交，没有一个在同一 JavaScript 调用栈内立即生效的同步 mutex。连续点击、Enter 与按钮事件同时触发、移动端事件重复等情况，都可能在 state 更新生效前启动多个请求。

后端内部也存在一次自动重试。于是一次用户操作就可能形成：

```text
第一次 D1 写入成功
        ↓
服务端误判冲突
        ↓
内部重试并生成新的 message id
        ↓
第二次 D1 写入成功
        ↓
最终仍返回 503
```

因此会出现“一次发送变成两条”。如果用户看到 503 后再次点击，同样的链路还会再次发生，可能变成四条、八条或更多，而不是永远只重复一条。

### 1.5 访客端和 Admin 端都出现重复

这不是单纯的 React 列表重复渲染，也不是只由 WebSocket 事件重复造成的 UI 问题。Admin 端和访客端都从 D1 读取到了重复行，说明重复已经进入持久化层。

WebSocket 可能让重复更快显示，但不是这次重复行的根本来源。关闭 realtime 也不能修复已经重复执行的 D1 INSERT。

### 1.6 发送过程很慢，常见体感是十秒左右

用户反馈发送会等待十几秒。当前链路中存在两个与十秒相关的等待点：

- 浏览器端 Turnstile token 获取超时：10 秒；
- Worker 调用 Turnstile Siteverify 的 abort timeout：10 秒。

此外，服务端误判冲突后的内部重试也会延长整个请求。当前没有把 Turnstile 客户端等待、Siteverify、D1 写入和总请求耗时分别记录下来，所以“每一次具体慢在哪里”还需要修复后通过新的 timing 日志确认。Turnstile 是明确的次要延迟嫌疑，但不是重复落库的主因。

## 2. 生产排查证据

### 2.1 实时 Worker tail

在用户再次发送的监听窗口内，生产 Worker 捕获到至少两次：

```text
POST /api/chat/messages → 503
```

这些请求的 Worker 执行结果是 `ok`，没有 uncaught exception。原因是应用主动把 `ChatWriteConflictError` 映射成了 503，而不是 Worker 崩溃。

Wrangler tail 只能监听启动之后的新事件，不能读取历史日志；当前代码也没有输出 D1 条件写入的实际返回值和阶段耗时。因此 tail 能确认 HTTP 结果，但不能单独证明某个 `meta.changes` 数值。

### 2.2 D1 消息总数和重复聚合

监听前的只读聚合快照：

```text
messages_total:       24
duplicate_groups:      7
duplicate_extra_rows: 14
```

用户发送后再次查询：

```text
messages_total:       34
duplicate_groups:      9
duplicate_extra_rows: 22
```

重复聚合按以下字段分组，故意不输出留言正文：

```text
conversation_id + role + content + page_url
```

`created_at` 没有参与分组，因为每次内部重试都会重新取时间，不能用完全相同的时间戳识别重复。

最近窗口中至少出现了：

- 一个重复组包含 2 行；
- 另一个重复组包含 8 行。

这与“第一次提示失败后再次点击，单次操作可能写两次”的现象一致，并证明问题已经发生在 D1 数据层，而不是只发生在浏览器渲染层。

### 2.3 为什么现有线上日志没有直接显示“D1 写成功后误判”

当前 `/api/chat/messages` 没有记录以下字段：

- D1 batch 每个 statement 的 `RETURNING` 结果；
- `meta.changes` 原始值；
- visitor write retry 次数；
- Turnstile 和 D1 分段耗时；
- 是否发生了重复 client command。

所以这次结论来自三部分交叉证据：

1. 生产实际返回 503；
2. 同一时间段 D1 出现新的重复 visitor 行；
3. 静态代码存在“batch 执行完成后再用 `meta.changes === 1` 判断成功”的路径。

## 3. 相关系统背景

当前匿名留言主链路是：

```text
浏览器
  │
  ├─ Turnstile 获取 token
  │
  └─ POST /api/chat/messages
         │
         ├─ Origin / Rate Limit / 输入校验
         ├─ Turnstile Siteverify
         └─ persistVisitorMessage()
                │
                ├─ D1 conversations
                ├─ D1 messages
                └─ D1 quota triggers
                        │
                        └─ 成功后 best-effort 广播 Durable Object
```

设计上的正确原则本来应该是：

```text
D1 command commit 成功 = 消息提交成功
Durable Object 广播失败 = 后续对账补齐，不回滚消息
```

这次实现把“D1 已提交”和“代码认为条件写入影响了 1 行”错误地混成了同一件事，导致 HTTP 命令结果与数据库事实分离。

## 4. 根因分析

### 4.1 P0 主因：用 `meta.changes === 1` 判断 batch 中当前写入是否成功

当前 visitor append 的核心逻辑可以抽象为：

```ts
const results = await db.batch([
  // visitors
  // UPDATE conversations ... WHERE status = 'open'
  // INSERT messages ... SELECT ... WHERE status = 'open'
  // visitors last_seen_at
])

if (
  (results[1]?.meta.changes ?? 0) !== 1 ||
  (results[2]?.meta.changes ?? 0) !== 1
) {
  throw new ChatWriteConflictError()
}
```

这里有两个问题：

1. Cloudflare D1 的 `meta.changes` 不是一个可靠的“这条 statement 当前准确影响了几行”的接口。它基于 SQLite 的累计 change 语义，适合做粗略信息，不能当作这个条件写入的精确成功标记。
2. 当前数据库有配额触发器。`messages` INSERT 成功后，触发器还会更新 conversation 和 visitor 的计数。这些触发器产生的修改也会影响累计 changes 语义，使“应该等于 1”的假设更加不成立。

`db.batch()` 返回以后，D1 的 batch 已经执行完毕。此时 JavaScript 再抛出 `ChatWriteConflictError`，不能撤销已经完成的 INSERT。于是可能出现：

```text
batch 实际提交成功
        ↓
meta.changes 不等于预期的 1
        ↓
代码误判为冲突
        ↓
返回路径进入 retry
```

### 4.2 P0 主因的放大器：内部 retry 每轮生成新的 message id

`persistVisitorMessage()` 当前最多进行两轮 visitor write attempt。`appendToConversation()` 在每一轮内部生成新的：

```ts
id: crypto.randomUUID()
```

因此第一次 batch 已经落库后，下一轮并不是“确认同一条消息”，而是 INSERT 一个全新的 message row。数据库没有 client idempotency key，也没有一个可以把两个请求识别为同一逻辑命令的唯一约束。

这正好解释了“最终返回 503，但 D1 精确多出两条”的现象：

```text
attempt 1: message id A，实际 INSERT 成功，随后误判冲突
attempt 2: message id B，实际 INSERT 成功，随后再次误判或耗尽重试
HTTP: 503 CHAT_WRITE_RETRY
DB: A、B 两行都存在
```

### 4.3 P1 放大器：前端没有同步发送锁

当前 `FloatingChat.sendMessage()` 主要使用：

```ts
if (!content || isSending) return
setIsSending(true)
```

`isSending` 是 React state。它适合控制按钮 disabled 和展示 loading，但不是同步互斥锁。连续事件在同一次 render 更新生效前，仍可能进入多个 `sendMessage()` 调用。

因此需要一个 `useRef` 形式的同步锁：

```text
第一件事检查 ref
第一件事设置 ref = true
finally 中释放 ref
```

仅仅把按钮变灰不等于请求已经被互斥。

### 4.4 P1 放大器：失败分支保留 input，造成用户重复提交

当前输入框清空主要发生在成功响应和同步路径。收到 `CHAT_WRITE_RETRY` 后，前端进入错误处理，文本仍然在 composer 中。

因为服务端的 503 实际上是“提交结果不确定”，把它当作普通失败会产生错误引导：

```text
服务端已经可能提交
        ↓
前端提示失败并保留原文本
        ↓
用户再次点击
        ↓
新的随机 ID 再次写入
```

修复后必须把“command committed”和“state synchronized”分开：

- 2xx 已确认提交：立即消费 input；
- 后续历史对账失败：显示同步状态，不恢复原 input；
- 结果不确定时：使用同一个幂等 key 安全重试，不创建新逻辑消息。

### 4.5 P1 次要原因：Turnstile `getToken()` 不是 single-flight

`ChatTurnstile` 当前只保存一个 pending resolver。并发调用 `getToken()` 时，后一次调用可能覆盖前一次的 resolver 和 timeout 引用。

这会带来：

- 某个发送请求等待到 10 秒超时；
- 一个 challenge 的结果只唤醒其中一个调用；
- 多个发送请求的 Turnstile 状态互相影响。

这可以解释部分“发送很慢”或并发提交行为，但不能单独解释 D1 中已经存在的重复行。Turnstile 应改成 single-flight：已有 challenge promise 时，后续调用直接 await 同一个 promise。

### 4.6 为什么 Durable Object / WebSocket 不是主因

当前 Durable Object 只负责 D1 成功后的 best-effort 广播，不是 visitor message 的权威写入入口。

即使 WebSocket 事件重复到达，客户端的消息合并逻辑也应按 message id 去重；而这次 D1 聚合已经证明数据库中出现了多个不同 ID 的重复行。因此：

- 不能通过关闭 realtime 修复；
- 不应继续从 realtime recovery 状态机方向打补丁；
- 应先修 D1 command 的提交判定和幂等性。

## 5. 根因结论和置信度

| 结论 | 状态 | 依据 |
| --- | --- | --- |
| 生产确实产生了重复 visitor message rows | 已确认 | D1 聚合中重复组和 extra rows 增加 |
| HTTP 503 与 D1 实际写入同时发生 | 已确认 | tail 捕获 503，D1 同期出现新重复行 |
| `meta.changes === 1` 是错误的条件写入判定 | 高度确认 | 静态代码、D1 change 语义、quota triggers、现象完全吻合 |
| 每次 repository retry 生成新 UUID，放大为两行 | 已确认存在 | `appendToConversation()` 每次调用生成 message id，retry 上限为 2 |
| 输入框不清空是 503 失败语义导致 | 已确认存在 | 失败分支不消费 input，代码路径与现象一致 |
| 重复点击可启动多个 POST | 高度可能 | 缺少同步 ref mutex；需用浏览器 Network 录制精确计数 |
| 十秒级等待全部来自 Turnstile | 尚未完全确认 | 存在两个十秒 timeout，但当前缺少分段 timing 日志 |
| WebSocket 是重复落库主因 | 已排除为主因 | D1 已存在不同 message id 的重复行 |

## 6. 推荐解决方案

### 6.1 后端：用 SQL `RETURNING` 判断条件写入

所有需要判断“open conversation 条件是否仍成立”的写入，都不再使用 `meta.changes === 1`。

visitor append 应改成类似以下语义：

```sql
UPDATE conversations
SET ...
WHERE id = ? AND visitor_id = ? AND status = 'open'
RETURNING id;
```

```sql
INSERT INTO messages (...)
SELECT ...
FROM conversations
WHERE id = ? AND visitor_id = ? AND status = 'open'
RETURNING id;
```

代码检查的是 `results` 中是否返回预期 ID：

```text
返回目标 id → 当前条件写入成功
没有返回行 → 当前 conversation 已被关闭或条件不再满足
```

这样不会把触发器产生的额外 changes 当成冲突，也不会在 batch 成功后凭累计计数重新猜测结果。

同一轮应审计并统一处理：

- visitor append；
- owner reply 的 conditional INSERT；
- close conversation 的 conditional UPDATE；
- 其它依赖 `meta.changes === 1` 表示成功的路径。

删除/清理统计使用的 `meta.changes` 与条件成功判断不是同一语义，可以单独评估，不要混用。

### 6.2 后端：增加逻辑消息幂等性

最低要求是：一次 `persistVisitorMessage()` 逻辑操作只生成一个 message id，并在 close/create/append 的 bounded retry 中复用它。

更完整、也是推荐的 API 方案是增加 `clientMessageId`：

1. 浏览器开始一次发送时生成一个 UUID；
2. `clientMessageId` 随 POST body 发送；
3. `messages` 增加可为空的 client id 字段和唯一索引；
4. 同一个 visitor 的相同 client id 重复提交时，返回已经存在的 conversation/message，而不是再次 INSERT；
5. repository 内部 retry 始终复用同一个 logical message id 和 client id；
6. HTTP 超时或 503 后的安全重试也复用同一个 client id。

幂等性要覆盖两种情况：

```text
同一个 HTTP 请求在服务端内部重试
同一个客户端命令被用户或网络重复发送
```

只在数据库 message 表使用随机主键，不足以识别第二种情况。

### 6.3 后端：明确“已提交”和“已同步”是两个状态

API 处理应遵循：

```text
D1 commit 成功
    ↓
命令视为 committed，返回成功 DTO
    ↓
DO 广播 / 客户端 reconciliation 属于后置同步
```

如果 D1 commit 结果不确定，不能简单返回“肯定失败”。应通过幂等 key 做一次安全查询或重试，最终收敛到同一条消息。

`CHAT_WRITE_RETRY` 应只表示“本次命令没有提交且可以安全重试”，不能覆盖“已经提交但响应阶段判断错误”的情况。

### 6.4 前端：增加同步发送 mutex

`FloatingChat.sendMessage()` 应在读取 Turnstile、发起 fetch 之前使用 `sendInFlightRef`：

```text
if (sendInFlightRef.current) return
sendInFlightRef.current = true
try {
  ...
} finally {
  sendInFlightRef.current = false
}
```

`isSending` 继续保留，用于 UI loading/disabled；它不再承担并发正确性职责。

`clientMessageId` 应在加锁后、第一次等待 Turnstile 前生成并保留到这条逻辑命令结束。2xx 响应解析成功后立即清空 input；后续 reconciliation 失败不能把已经消费的 input 恢复回来。

### 6.5 Turnstile：改为 single-flight

Turnstile 组件需要保存一个完整的 pending promise，而不是一个可以被后一次调用覆盖的 resolver：

```text
没有进行中的 challenge → 创建 promise 并启动 challenge
已有 challenge         → 返回同一个 promise
challenge 成功/失败/超时 → 一次性结算并清理引用
```

这样并发调用不会互相覆盖，也不会为同一个 challenge 创建多个独立的超时状态。

### 6.6 可观测性：不记录留言正文

在 `/api/chat/messages` 增加结构化 timing 日志，只记录数值、状态和计数，不记录正文、token、Cookie：

```text
request_id
route
response_code
visitor_write_attempts
idempotency_reused
turnstile_siteverify_ms
d1_write_ms
total_request_ms
realtime_publish_scheduled
```

浏览器侧可以通过 Chrome DevTools Network/Performance 记录：

```text
turnstile_client_wait_ms
POST total duration
```

修复后可以明确区分：

- Turnstile 客户端等待慢；
- Siteverify 慢；
- D1 写入慢；
- repository 错误重试；
- realtime publish 是否影响响应。

## 7. 测试和验收方案

### 7.1 D1 集成测试必须覆盖真实语义

当前 FakeD1 测试把每个成功 statement 的 `meta.changes` 固定为 1，也没有充分模拟 quota triggers，因此无法复现远程 D1 的累计 change 行为。

必须增加 workerd/Miniflare 或等价真实 D1 集成测试，至少覆盖：

1. 已有 open conversation，单击发送一次，HTTP 201，D1 恰好新增 1 条 message；
2. `meta.changes` 大于 1 但 `RETURNING id` 成功时，不能返回 503；
3. repository 内部 retry 两次，仍然只有一个 message id；
4. 两个相同 `clientMessageId` 并发 POST，最终只有一条消息；
5. visitor append 与 close 交错，不允许把消息插入 closed conversation；
6. close/create 竞态最终写入当前 open conversation；
7. D1 已提交后 realtime publish 失败，不影响 HTTP 成功结果；
8. 访客端和 Admin 端读取同一条消息时，HTTP response 与 WebSocket event 仍按 id 去重。

### 7.2 前端 deterministic regression

至少增加：

- 连续两次调用 `sendMessage()` 只有一个 POST；
- 2xx 返回后 input 一定清空；
- stale success reconciliation 失败时，已提交 input 不恢复；
- 503/网络超时后的安全重试复用同一个 `clientMessageId`；
- Turnstile 并发 `getToken()` 共享同一个 promise；
- 已提交消息最终只显示一条。

### 7.3 本地和生产验收

代码修复后按以下顺序验收：

```text
test:chat-realtime
repository / D1 integration tests
lint
worker:types
next build / worker:build
本地 Worker + Chrome DevTools Network 验证
本地 visitor/Admin WebSocket smoke
DEV 环境单击、双击、Enter+按钮、Turnstile 慢路径
生产发布后只做一次真实 Turnstile 单击发送
```

生产验收需要同时查看：

- POST 最终状态码为 201；
- Network 中没有重复 POST；
- composer 清空；
- visitor/Admin 各只出现一条；
- D1 聚合只增加一条；
- Worker timing 日志没有异常 retry。

## 8. 修复前的临时注意事项

在代码修复发布前，如果看到“留言状态刚刚发生变化”：

1. 不要立即连续点击发送；
2. 先刷新或查看 Admin/历史，确认留言是否已经出现；
3. 如果必须重试，当前版本不能保证重复请求幂等，存在再次落库的风险；
4. 不要通过关闭 Durable Object realtime 解决，因为主问题发生在 D1 写入判定；
5. 不要未经备份和人工确认直接删除重复消息。

当前尚未执行生产历史重复数据删除或修正。本事故修复只阻止新的重复写入，不自动修改既有历史数据。

## 9. 完成标准

这次事故不能以“错误提示消失”作为唯一完成标准。必须同时满足：

- 一次用户逻辑发送最多对应一条 D1 message；
- D1 已提交的命令不会再返回与事实相反的失败语义；
- 内部 retry 和客户端重复 POST 都具备幂等性；
- 发送锁能阻止同一页面的同步重复请求；
- 2xx 成功后 composer 立即消费文本；
- Turnstile 并发调用不会互相覆盖；
- 发送耗时可以拆分定位；
- 真实 D1 集成测试和浏览器 Network 验收均通过；
- Durable Object 仍保持 best-effort，不会成为消息写入成功的必要条件。

## 10. 相关代码和文档

- `lib/chat/repository.ts`：visitor message append、bounded retry、`meta.changes` 条件判断
- `app/api/chat/messages/route.ts`：Turnstile、repository 调用和 `CHAT_WRITE_RETRY` 映射
- `components/chat/floating-chat.tsx`：发送、input 清理、`isSending` 和 realtime reconciliation
- `components/chat/chat-turnstile.tsx`：token challenge、pending resolver 和 timeout
- `migrations/0001_chat.sql`：D1 基础表结构
- `migrations/0002_chat_quotas.sql`：消息/会话配额触发器
- `migrations/0003_chat_message_idempotency.sql`：visitor message 幂等 key 唯一索引
- `docs/features/anonymous-chat/backend-implementation.md`：匿名留言后端与 realtime 当前实现
- `docs/features/anonymous-chat/realtime-messaging-refactor-plan.md`：实时消息架构方案

## 11. 修复落地记录（DEV）

本轮在 `cloudflare-worker-DEV` 完成以下修复，保持 D1 authoritative + Durable Object best-effort
架构不变：

- visitor append、owner reply、close conversation 的条件写入改为 SQL `RETURNING id` 判断，不再使用
  `meta.changes === 1` 判断当前 statement 是否成功；清理统计用途的 `meta.changes` 保持不变。
- 新增 `0003_chat_message_idempotency.sql`，以 `client_message_id` 唯一索引约束一次逻辑 visitor
  message；同一个 key 的内部 retry、网络重试、首次响应丢失后的无 Cookie 重试都会复用已有消息。
- 2xx response 被视为 command committed；重复命令返回已有 DTO，不再重复广播；前端成功解析后立即
  清空 composer，后续 reconciliation 失败不会把已提交文本恢复成可再次发送状态。
- `FloatingChat` 增加同步发送锁；`ChatTurnstile` 的并发 token 请求共享 single-flight promise。
- `/api/chat/messages` 增加不含正文、Token、Cookie 的 `chat_message_timing` 结构化日志，拆分
  Turnstile、D1 write 和总处理耗时。

已完成的本地验证：

```text
test:chat-realtime：28 tests passed
lint：passed
next build：passed
worker:build：passed
worker:dev + local D1：同一 clientMessageId 首次 201、重复 200，数据库 1 行；无 Cookie 重试 1 行；
close 后新会话写入成功
```

浏览器端真实 Turnstile 交互仍需按发布后验收流程在可用的 Chrome/手机浏览器中确认；本地 dummy
Turnstile 只用于 Worker/D1 回归，不能替代 Turnstile 本身的挑战验证。生产 Turnstile 不应为了测试
长期关闭；如必须短暂关闭，必须在测试结束后立即恢复并重新部署，同时复核 Worker 变量和日志。
