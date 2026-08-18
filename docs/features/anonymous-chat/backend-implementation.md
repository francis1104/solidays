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
- `custom-worker.ts`：复用 OpenNext fetch handler，并通过 Cron 定期清理过期会话。
- `components/chat/`：前端读取历史并提交真实响应；显示“匿名留言”，不追加本地假回复。

## 实时消息改造（DEV 已完成基础阶段）

### Worker 与 Durable Object

- `wrangler.jsonc` 声明 `CHAT_CONVERSATIONS` Durable Object binding，类名为
  `ChatConversation`，并登记 `chat-realtime-v1` SQLite migration。
- `lib/chat/realtime-object.ts` 实现会话级 Hibernation WebSocket：连接只保存 audience 和
  conversation ID attachment；客户端帧全部忽略，不能绕过 HTTP 接口写入消息。
- `lib/chat/realtime-events.ts` 定义并校验 `message.created` 与 `conversation.closed` 事件。
- `lib/chat/realtime.ts` 在 D1 写入成功后调用对应 Durable Object 广播；广播失败只记录结构化日志，
  不回滚或阻断已经成功的 D1 写入。

### 接口与前端

| 接口 | 作用 | 额外保护 |
| --- | --- | --- |
| `GET /api/chat/realtime` | 当前访客开放会话的实时订阅 | `chat_visitor` Cookie、访客存在性、开放会话、同源 Origin、WebSocket Upgrade |
| `GET /api/admin/conversations/:id/realtime` | Admin 会话实时订阅 | Admin 签名 Cookie、会话 ID/存在性、同源 Origin、WebSocket Upgrade |

`custom-worker.ts` 在 OpenNext 之前直接处理这两个 Upgrade 路由，以保留 Cloudflare Worker 的
`101 Switching Protocols` 响应；普通 HTTP 请求仍由原有 Next.js route handler 处理。
`components/chat/use-chat-realtime.ts` 负责指数退避重连。首次连接和重连都会从 D1 按游标补拉到已知
消息 ID；补拉期间到达的 WebSocket 事件会暂存，补拉成功后再按 `created_at` + `id` 合并，避免断线
期间漏消息或顺序反转。HTTP 提交响应与 WebSocket 事件使用消息 ID 去重。

消息写入成功后，DO 广播通过 OpenNext execution context 的 `waitUntil()` 调度，不阻塞 201/204
响应；D1 仍是 command 成功的唯一依据。会话历史和 Admin 详情响应会携带 `realtimeEnabled`，
客户端只在服务端开关打开时建立 WebSocket，避免生产开关关闭时持续重试 404 endpoint。

本地 `worker:dev` 会通过命令行变量打开 `CHAT_REALTIME_ENABLED=true`；`wrangler.jsonc` 默认值仍为
`false`，因此生产实时入口在完成 DEV 浏览器验收前不会被启用。当前阶段尚未实现 Queue 异步投递、
Slack 通知和生产灰度开关；这些属于实时改造方案的后续阶段。

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
- Rate Limiting binding：`CHAT_RATE_LIMITER`，留言、结束留言和历史读取均按 IP/访客分 bucket，
  每个 key 每 60 秒 10 次。
- Required secret：`TURNSTILE_SECRET_KEY`。

远程 `solidays-chat` 已创建，`0001_chat.sql` 已应用；本次新增的 `0002_chat_quotas.sql` 已在本地
应用，生产迁移由 `worker:deploy:ci` 在部署前执行。迁移命令如下：

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

生产环境已用手机端真实 Turnstile token 完成留言写入，并在远程 D1 中确认 1 个访客、1 个开放会话和
3 条 visitor 消息。无副作用线上检查已确认首页/CSS、会话 GET 和伪造 token 拒绝正常。

本地若要继续回归，可在未提交的 `.dev.vars` 中配置本地测试 Secret，再用 `worker:dev` 验证：首次提交设置
HttpOnly Cookie，刷新可读历史，非法 body 返回 400，Turnstile 失败返回 403，超限返回 429，重复关闭保持
幂等，关闭后提交创建新会话；历史分页返回固定上限，Cron 可通过
`curl http://localhost:8787/cdn-cgi/local/scheduled?cron=0+3+*+*+*` 手动触发。
`worker:dev` 只在本地注入 `CHAT_LOCAL_DEV=true`，用于处理 Wrangler 把本地请求映射到
`http://solidays.win` 的行为；生产配置固定为 `false`，不会放宽 HTTPS Origin 校验。

## 当前状态（2026-08-18）

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
- [x] 创建 Turnstile widget `solidays-chat-turnstile`，配置 site key 和 Worker secret；
      Widget 允许域名为 `solidays.win`、`localhost`、`127.0.0.1`，并通过官方
      siteverify 完成 Secret 校验。
- [x] Workers Builds 已自动发布包含本期后端的 Worker，当前核验版本为
      `6b1bc459-ed63-43e4-96bd-832199ecca08`，100% 流量生效；首页、CSS、会话 GET、
      聊天路由和伪造 token 拒绝检查已通过。
- [x] 在生产页面用真实 Turnstile token 完成留言写入；手机端测试已在远程 D1 产生
      1 个访客、1 个开放会话和 3 条 visitor 消息。
- [x] DEV 已接入会话级 `ChatConversation` Durable Object、访客/Admin WebSocket、消息创建和
      会话关闭事件、首次连接/断线指数退避重连、D1 补拉、恢复事件缓冲、稳定排序和客户端消息去重；
      本地已完成双端事件互通 smoke test。
- [x] 本地 Worker 已验证 WebSocket `101` 握手、访客/Admin 双端同时收取 visitor/owner 消息、关闭事件、
      无效客户端帧忽略以及未授权连接拒绝。
- [ ] 可选回归：用本地 Turnstile 测试 key 验证重复 token、429、关闭幂等和关闭后
      新会话；不阻塞当前线上版本。
- [ ] 将实时开关从 DEV 本地验证推进到生产灰度；发布前需要按
      `docs/testing/pre-commit-verification.md` 和 `docs/testing/post-deployment-verification.md`
      完成浏览器验收。
- [ ] 后续实现 Queue 异步通知、Slack 消息通知和失败重试/可观测性闭环。
