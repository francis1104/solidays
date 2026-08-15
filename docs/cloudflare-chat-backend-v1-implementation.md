# Cloudflare Chat Backend V1 实施记录

## 范围

本期是“匿名留言 V1”，不是 AI 聊天，也不是实时客服：访客可以提交留言、刷新后看到当前仍开放的
留言会话，并主动结束会话。数据写入 Cloudflare D1；代码保留 `owner` 和 `system` 消息角色，供后续
回复能力扩展，但本期不实现 owner 登录、管理后台、邮件、队列、WebSocket、Durable Objects 或 AI。

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
模式为 Managed；公开 Site Key 配置在未提交的 `.env.local`。Worker secret 只能通过安全命令写入：

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

## 当前状态

代码、配额迁移、分页、读取限流、Cron 清理、Turnstile widget 和 Worker 配置均已完成；`0002_chat_quotas.sql`
已在本地验证，尚未随本次 DEV 改动发布到生产。生产发布前必须由 `worker:deploy:ci` 先应用远程迁移，
再部署 Worker。剩余的本地测试 key 回归和重复 token/关闭流程属于后续可选回归。
