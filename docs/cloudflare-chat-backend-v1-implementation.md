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
- `components/chat/`：前端读取历史并提交真实响应；显示“匿名留言”，不追加本地假回复。

接口保护范围：

| 接口 | 作用 | 保护措施 |
| --- | --- | --- |
| `GET /api/chat/conversation` | 读取当前访客的开放会话 | `chat_visitor` HttpOnly Cookie + D1 归属查询 |
| `POST /api/chat/messages` | 提交匿名留言 | 同源 Origin + 输入校验 + Rate Limiting + Turnstile |
| `POST /api/chat/conversation/close` | 结束当前会话 | Cookie + 同源 Origin + Rate Limiting |

“结束留言”只会把会话状态改为 `closed`，不会删除已有消息；之后再次提交会创建新的会话。

## Cloudflare 资源

`wrangler.jsonc` 已配置：

- D1 binding：`CHAT_DB` → `solidays-chat`。
- Rate Limiting binding：`CHAT_RATE_LIMITER`，每个访客/IP 每 60 秒 10 次。
- Required secret：`TURNSTILE_SECRET_KEY`。

远程 `solidays-chat` 已创建，`0001_chat.sql` 已应用；本地迁移命令如下：

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
```

生产环境已用手机端真实 Turnstile token 完成留言写入，并在远程 D1 中确认 1 个访客、1 个开放会话和
3 条 visitor 消息。无副作用线上检查已确认首页/CSS、会话 GET 和伪造 token 拒绝正常。

本地若要继续回归，可在未提交的 `.dev.vars` 中配置本地测试 Secret，再用 `worker:dev` 验证：首次提交设置
HttpOnly Cookie，刷新可读历史，非法 body 返回 400，Turnstile 失败返回 403，超限返回 429，重复关闭保持
幂等，关闭后提交创建新会话。
`worker:dev` 只在本地注入 `CHAT_LOCAL_DEV=true`，用于处理 Wrangler 把本地请求映射到
`http://solidays.win` 的行为；生产配置固定为 `false`，不会放宽 HTTPS Origin 校验。

## 当前状态

代码、绑定、数据库迁移、Turnstile widget、Worker Secret、Worker 部署和一次生产真实 token 留言写入验证
均已完成。剩余的本地测试 key 回归和重复 token/限流/关闭流程属于后续可选回归，不阻塞当前上线。
