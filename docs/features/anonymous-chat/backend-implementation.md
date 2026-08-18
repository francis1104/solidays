# Cloudflare Chat Backend 实施记录

## 范围

匿名留言的权威数据仍由 Cloudflare D1 保存：访客可以提交留言、读取当前开放会话并主动结束会话。
在 V1 HTTP 能力之上，本次已在 DEV 完成会话级实时基础层：每个开放会话对应一个
`ChatConversation` Durable Object，访客端和 Admin 端通过 WebSocket 接收 D1 写入后的事件。
这不是 AI 聊天；实时层只负责广播，不接受客户端写入，D1 HTTP 接口仍是唯一写入入口。

## 已落地结构

- `app/api/chat/conversation/route.ts`：按 `chat_visitor` Cookie 读取当前 open conversation。
- `app/api/chat/messages/route.ts`：检查同源 Origin、请求体、Rate Limiting、Turnstile，然后写入留言。
- `app/api/chat/conversation/close/route.ts`：幂等关闭当前会话；关闭后下一次提交会新建会话。
- `lib/chat/`：D1 查询、DTO、Cookie、输入校验、Origin、页面路径归一化、限流和 Turnstile Siteverify。
- `migrations/0001_chat.sql`：`visitors`、`conversations`、`messages`，以及每个访客一个 open 会话的
  唯一部分索引。
- `migrations/0002_chat_quotas.sql`：消息计数/字节计数、配额触发器、历史游标索引和删除时的计数维护。
- `migrations/0003_chat_message_idempotency.sql`：为 visitor message 增加可空的
  `client_message_id` 及唯一索引，保证客户端重复提交和服务端安全重试只落一条消息。
- `custom-worker.ts`：复用 OpenNext fetch handler，并通过 Cron 定期清理过期会话。
- `components/chat/`：前端读取历史并提交真实响应；显示“匿名留言”，不追加本地假回复。

## 实时消息改造（DEV 已完成基础阶段）

### Worker 与 Durable Object

- `wrangler.jsonc` 声明 `CHAT_CONVERSATIONS` Durable Object binding，类名为
  `ChatConversation`，并登记 `chat-realtime-v1` SQLite migration。
- `lib/chat/realtime-object.ts` 实现会话级 Hibernation WebSocket：连接保存 audience、会话 ID，
  Admin 连接同时保存已签名会话的绝对过期时间；每次广播前会清理已过期的 Admin socket。
  客户端帧全部忽略，不能绕过 HTTP 接口写入消息。
- `lib/chat/realtime-events.ts` 定义并校验 `message.created` 与 `conversation.closed` 事件。
- `lib/chat/realtime.ts` 在 D1 写入成功后调用对应 Durable Object 广播；广播最多做有限次短退避重试，
  最终失败只记录结构化日志，不回滚或阻断已经成功的 D1 写入。

### 接口与前端

| 接口 | 作用 | 额外保护 |
| --- | --- | --- |
| `GET /api/chat/realtime?conversationId=<id>` | 当前访客指定开放会话的实时订阅 | `chat_visitor` Cookie、访客存在性、开放会话与客户端期望 ID 一致、同源 Origin、WebSocket Upgrade、IP + 访客建连限流 |
| `GET /api/admin/conversations/:id/realtime` | Admin 会话实时订阅 | Admin 签名 Cookie、会话存在且仍为 open、同源 Origin、WebSocket Upgrade |

`custom-worker.ts` 在 OpenNext 之前直接处理这两个 Upgrade 路由，以保留 Cloudflare Worker 的
`101 Switching Protocols` 响应；普通 HTTP 请求仍由原有 Next.js route handler 处理。
`components/chat/use-chat-realtime.ts` 负责指数退避重连。访客连接会携带客户端当前的
`conversationId`，Worker 只允许连接到同一个仍处于 open 状态的会话；HTTP 历史接口在携带期望 ID
时同样执行这个一致性检查，发现会话不存在或已切换会返回 `CONVERSATION_CHANGED`，前端随后重新
bootstrap 并替换历史，而不是把两个会话合并。visitor 写入使用条件 INSERT 与 open 状态检查处于同一
D1 batch；如果 pre-read 后被并发 close，会丢弃旧会话写入并重解析/创建新的 open 会话后重试。
首次连接和重连都会从 D1 按游标补拉到已知消息 ID；补拉期间
到达的 WebSocket 事件会暂存，补拉成功后再按 `created_at` + `id` 合并，避免断线期间漏消息或顺序反转。
达到恢复页数上限却没有找到重叠消息时，恢复会被判定为 incomplete 并触发下一轮连接，不会静默宣告
同步成功。HTTP 提交响应与 WebSocket 事件使用消息 ID 去重。

客户端的历史 bootstrap、load-more、reconnect recovery 和 handshake refresh 都带有 request generation；
conversation identity 变化、visitor mutation、Admin 切换详情或 close barrier 都会推进 generation，过期
响应不能回写当前会话。Admin 收到 `conversation.closed` 后立即禁用 composer 和 realtime，并在断开订阅
前做一次 D1 authoritative final reconciliation，以收拢 close event 与最后一条 message event 的乱序。
Admin 回复遇到 `409 CONVERSATION_CLOSED` 也走同一条 closed/reconciliation 路径。

保持页面在线且连接健康时，visitor 与 Admin 会在浏览器重新 online、窗口 focus、页面恢复可见以及低频
定时器触发时执行一次 D1 对账；这用于弥补单次 best-effort DO publish 失败，不把 realtime 故障升级为
消息写入失败，也不引入 durable event log。

连续三次握手未成功时，客户端会重新执行对应的 HTTP bootstrap：会话不存在、实时开关关闭或 Admin
会话过期会停止 socket 重试；暂时性的 bootstrap 失败仍按退避策略重试。Admin socket 使用 10 分钟的
短租约，并且不会超过签名 Admin session 的绝对过期时间；租约由 Worker 在握手时传给 Durable Object，
DO 在广播和客户端帧事件上再次校验，避免过期 Admin 连接继续接收新事件。Admin 显式登出后，页面通过
`BroadcastChannel` 通知同浏览器的其他 Admin 标签页主动卸载详情并关闭连接；这不是服务端撤销存储，
跨设备的既有连接仍由短租约和签名 session 到期边界控制。

消息写入成功后，DO 广播通过 OpenNext execution context 的 `waitUntil()` 调度，不阻塞 201/204
响应；D1 仍是 command 成功的唯一依据。会话历史和 Admin 详情响应会携带 `realtimeEnabled`，
客户端只在服务端开关打开时建立 WebSocket，避免生产开关关闭时持续重试 404 endpoint。

### 消息写入幂等与延迟观测

visitor message 的条件写入使用 SQL `RETURNING id` 判断当前 open conversation 条件是否成立，
不再用 `meta.changes === 1` 猜测 batch 中某条 statement 是否成功。数据库迁移
`0003_chat_message_idempotency.sql` 为 `messages.client_message_id` 建立唯一索引；前端在一次
逻辑发送开始时生成 UUID，内部 close/create/append 重试以及网络重试都会复用该 UUID。重复命令会
返回已提交的 conversation/message（HTTP 200），不会再次触发 message.created 广播；首次响应丢失、
浏览器尚未拿到 visitor Cookie 的重试也能按这个 key 找回原 visitor。

`FloatingChat` 同时使用同步 `sendInFlightRef` 防止同一页面在 React state 更新前发起两个 POST，
`ChatTurnstile.getToken()` 使用 single-flight promise，多个并发调用共享一个 challenge。2xx response
解析成功后立即消费 composer 文本；后续 realtime/D1 对账失败只表示“状态同步未完成”，不会把已经提交
的文本恢复成可重复发送状态。

`POST /api/chat/messages` 输出不包含正文、Token 或 Cookie 的结构化 `chat_message_timing` 日志，
分开记录 Turnstile siteverify、D1 write、总处理耗时和是否命中幂等复用，便于区分验证慢、D1 慢和
应用重试。D1 仍是写入权威，Durable Object 广播失败不会把已提交的消息改判为失败。

本地 `worker:dev` 会通过命令行变量打开 `CHAT_REALTIME_ENABLED=true`；生产
`wrangler.jsonc` 已启用同一开关，实时入口进入生产灰度。若需紧急回退，只需将生产变量改为
`false` 后重新部署。当前阶段尚未实现 Queue 异步投递和 Slack 通知；这些属于实时改造方案的后续阶段。

接口保护范围：

| 接口 | 作用 | 保护措施 |
| --- | --- | --- |
| `GET /api/chat/conversation` | 分页读取当前访客的开放会话 | 可信 IP + 已验证访客双重限流 + 游标分页 |
| `POST /api/chat/messages` | 提交匿名留言 | 同源 Origin + 输入校验 + Rate Limiting + Turnstile |
| `POST /api/chat/conversation/close` | 结束当前会话 | Cookie + 同源 Origin + Rate Limiting |

“结束留言”只会把会话状态改为 `closed`；消息保留 30 天，长期不活跃的 open 会话保留 90 天，
之后由 Cron 清理。再次提交会创建新的会话。

## 留言配额与历史边界

- 单个会话最多 50 条消息，累计消息内容和页面路径最多 128 KiB。
- 单个访客在保留周期内最多 200 条消息，累计最多 512 KiB。
- D1 触发器在写入层强制配额，未来的 `owner`/`system` 消息也计入总量。
- 历史接口默认每页 20 条，按 `created_at` + `id` 游标向更早消息翻页；服务端不会一次加载完整历史。
- `GET /api/chat/conversation` 使用 `conversation-read` 的 IP bucket 和访客 bucket 限流。
- 每天 UTC 03:00 触发清理；每次最多处理 100 个过期会话，避免单次清理占用过多 D1 资源。

## Cloudflare 资源

`wrangler.jsonc` 已配置：

- D1 binding：`CHAT_DB` → `solidays-chat`。
- Rate Limiting binding：`CHAT_RATE_LIMITER`，留言、结束留言、历史读取和 realtime 建连均按 IP/访客分 bucket，
  每个 key 每 60 秒 10 次。
- Required secret：`TURNSTILE_SECRET_KEY`。

远程 `solidays-chat` 已创建，`0001_chat.sql` 已应用；`0002_chat_quotas.sql` 和
`0003_chat_message_idempotency.sql` 已在本地验证，生产迁移由 `worker:deploy:ci` 在部署前执行。
当前生产已确认无待应用 migration；迁移命令如下：

```bash
node .yarn/releases/yarn-3.6.1.cjs wrangler d1 migrations apply solidays-chat --local
node .yarn/releases/yarn-3.6.1.cjs wrangler d1 migrations apply solidays-chat --remote
```

## Turnstile 配置

正式 widget 为 `solidays-chat-turnstile`，允许域名为 `solidays.win`、`localhost`、`127.0.0.1`，
模式为 Invisible；公开 Site Key 配置在未提交的 `.env.local`。Worker secret 只能通过安全命令写入：

```bash
wrangler secret put TURNSTILE_SECRET_KEY
```

本地使用未提交的 `.env.local`/`.dev.vars`；不要把真实 Secret 写入 Git。服务端会检查
Siteverify 的 `success`、`action=chat_message` 和 hostname；验证失败不会写 D1。

## 验证顺序

```bash
node .yarn/releases/yarn-3.6.1.cjs worker:types
node .yarn/releases/yarn-3.6.1.cjs lint
node .yarn/releases/yarn-3.6.1.cjs worker:build
node .yarn/releases/yarn-3.6.1.cjs exec wrangler deploy --dry-run --config wrangler.jsonc
```

生产环境已用真实 Turnstile 完成一次消息提交，浏览器中只显示 1 条新消息且 composer 清空；
无效 token 返回 403。无副作用线上检查已确认首页、`/fnds`、`/api/cards`、会话 GET、生产
Durable Object/Rate Limiter/D1 绑定和迁移状态正常。

本地若要继续回归，可在未提交的 `.dev.vars` 中配置本地测试 Secret，再用 `worker:dev` 验证：首次提交设置
HttpOnly Cookie，刷新可读历史，非法 body 返回 400，Turnstile 失败返回 403，超限返回 429，重复关闭保持
幂等，关闭后提交创建新会话；历史分页返回固定上限，Cron 可通过
`curl http://localhost:8787/cdn-cgi/local/scheduled?cron=0+3+*+*+*` 手动触发。
`worker:dev` 只在本地注入 `CHAT_LOCAL_DEV=true`，用于处理 Wrangler 把本地请求映射到
`http://solidays.win` 的行为；生产配置固定为 `false`，不会放宽 HTTPS Origin 校验。

## 当前状态（2026-08-19）

- [x] 接入 `GET /api/chat/conversation`、`POST /api/chat/messages` 和
      `POST /api/chat/conversation/close`。
- [x] 创建并迁移独立 D1 `solidays-chat`，配置 `CHAT_DB`、`CHAT_RATE_LIMITER` 和必需的
      `TURNSTILE_SECRET_KEY`，并生成 Cloudflare 绑定类型。
- [x] 前端展示、读取历史、真实提交、关闭会话和关闭后新会话的代码路径已完成；
      不追加假回复。
- [x] 完成配额、分页、读取限流和 Cron 清理：单会话 50 条/128 KiB，单访客 200 条/
      512 KiB，历史每页 20 条，closed 保留 30 天，stale open 保留 90 天。
- [x] `migrations/0002_chat_quotas.sql` 已在本地应用并验证触发器拒绝第 51 条消息；
      生产迁移由 `worker:deploy:ci` 在部署前执行。
- [x] `migrations/0003_chat_message_idempotency.sql` 已在本地和生产 D1 应用；visitor 条件写入改用
      `RETURNING id`，内部 retry 和客户端重复 POST 复用 `clientMessageId`，重复请求返回已有
      message 而不重复落库；生产远程 migration 已确认无待应用项。
- [x] 创建 Turnstile widget `solidays-chat-turnstile`，配置 site key 和 Worker secret；
      Widget 允许域名为 `solidays.win`、`localhost`、`127.0.0.1`，并通过官方
      siteverify 完成 Secret 校验。
- [x] 生产 Worker 已发布版本 `8fd3f647-b4a7-4f7f-8f44-775f8accc8a9`（version 37），
      100% 流量生效；首页、`/fnds`、`/api/cards`、会话 GET、聊天路由和伪造 token 拒绝检查已通过。
- [x] 在生产页面用真实 Turnstile token 完成留言写入；手机端测试已在远程 D1 产生
      1 个访客、1 个开放会话和 3 条 visitor 消息。
- [x] DEV 已接入会话级 `ChatConversation` Durable Object、访客/Admin WebSocket、消息创建和
      会话关闭事件、访客会话 ID 绑定、首次连接/断线指数退避重连、D1 补拉、恢复事件缓冲、稳定排序和客户端消息去重；
      本地已完成双端事件互通 smoke test。
- [x] Admin 详情会实时响应 `conversation.closed`，立即显示会话已结束并禁用回复；Admin realtime 使用
      10 分钟短租约，同浏览器登出通过 `BroadcastChannel` 关闭其他标签页的连接。
- [x] 本地 Worker 已验证 WebSocket `101` 握手、访客/Admin 双端同时收取 visitor/owner 消息、关闭事件、
      无效客户端帧忽略以及未授权连接拒绝。
- [x] visitor message/close 并发写入使用 D1 open-status 原子边界；Admin closed barrier、最终 D1 对账、
      stale-response generation fencing、publish 有限重试和 online/visibility/focus/定时 reconciliation
      已落地；实时回归测试覆盖 15 个事件、状态、重试与 repository race 用例。
- [x] 消息重复写入事故的发送锁、Turnstile single-flight、幂等 key 和 timing 日志已在 DEV 落地；
      本地 Worker + 真实本地 D1 已验证重复请求 `201 → 200` 且同一 `clientMessageId` 只有一行，
      无 Cookie 重试和 close 后新会话路径也已验证；生产浏览器真实 Turnstile 单击发送已验证
      消息只出现一次且输入框清空。
- [ ] 可选回归：用本地 Turnstile 测试 key 验证重复 token、429、关闭幂等和关闭后
      新会话；不阻塞当前线上版本。
- [x] 将实时开关从 DEV 本地验证推进到生产灰度；版本 `8fd3f647-b4a7-4f7f-8f44-775f8accc8a9`
      已接收 100% 流量；发布后按
      `docs/testing/pre-commit-verification.md` 和 `docs/testing/post-deployment-verification.md`
      完成浏览器验收。
- [ ] 后续实现 Queue 异步通知、Slack 消息通知和失败重试/可观测性闭环。
