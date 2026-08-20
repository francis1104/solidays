# 本地开发

> 原 AGENTS.md「本地开发和检查」「高风险注意事项」中的本地开发相关内容拆分至此
> （2026-08-16）。

## 常用命令

项目声明使用 Yarn 3.6.1，版本文件位于 `.yarn/releases/`，配置位于 `.yarnrc.yml`。
当前机器没有全局 `yarn`，统一通过项目自带 Yarn 运行，不要生成 `package-lock.json`：

```bash
node .yarn/releases/yarn-3.6.1.cjs install
node .yarn/releases/yarn-3.6.1.cjs dev --hostname 127.0.0.1 --port 3001
node .yarn/releases/yarn-3.6.1.cjs lint
node .yarn/releases/yarn-3.6.1.cjs build
node .yarn/releases/yarn-3.6.1.cjs worker:build
node .yarn/releases/yarn-3.6.1.cjs worker:types
node .yarn/releases/yarn-3.6.1.cjs wrangler d1 migrations apply solidays-chat --local
node .yarn/releases/yarn-3.6.1.cjs test:chat-realtime
node .yarn/releases/yarn-3.6.1.cjs test:chat-local-concurrent
```

`worker:dev` 会先构建，再启动 Wrangler；`wrangler.jsonc` 中的 R2 和 AI 是
`remote: true`，本地调试可能访问真实 Cloudflare 资源，不要在未确认时做上传、删除
或 AI 调用。当前 `worker:dev` 还会只在本地命令行覆盖
`CHAT_REALTIME_ENABLED=true`，用于验收聊天 WebSocket；生产开关由
`wrangler.jsonc` 管理，当前已启用实时留言。

`test:chat-local-concurrent` 是自包含的本地 Worker + 隔离 D1 并发测试。默认每次都会
重新执行一次 `worker:build`，确保 smoke 测试的是当前工作树对应的 Worker，不会因为旧的
`.open-next` 产物产生 false pass。然后它使用同一个系统临时 persistence 目录启动
`wrangler dev --local --persist-to`，并将该目录通过 `CHAT_LOCAL_PERSIST_TO` 传给 D1 查询。
测试结束会关闭 Worker、删除临时目录；如果 `localhost:8787` 已经被占用，会直接失败。
该命令不使用 `--remote`，不会查询生产 D1。若明确确认 `.open-next` 与当前源码一致，
可用 `CHAT_LOCAL_REUSE_BUILD=true` 跳过构建；这只适合开发时的性能优化，不应用于普通
验证或 pre-commit。手动运行底层 smoke 时，仍可通过 `CHAT_LOCAL_ORIGIN` 和
`CHAT_LOCAL_PERSIST_TO` 指定 Worker 地址及完全相同的本地 persistence。

## 检查要求

每次改动后都要主动检查本地浏览器控制台和终端输出；无论是 Error 还是 Warning，
都要定位并处理，不能默认忽略。如果问题涉及行为取舍、权限或无法安全判断，先明确
告诉用户再继续。

## 环境变量与 Secret

- 本地 Worker 聊天提交使用 Cloudflare 官方 dummy 测试密钥对（不提交仓库）：
  `.env.local` 配 `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000BB`
  （invisible 永过），`.dev.vars` 配
  `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`（永过校验）。
  两把必须配套，dummy token 只被 dummy secret 接受。dummy 密钥下 siteverify
  固定返回 `hostname: "example.com"`、无 `action`，并带
  `metadata.result_with_testing_key: true` 标记；后端在 `CHAT_LOCAL_DEV` 下
  凭该标记接受校验结果（实测为准，勿信文档摘要）。测 403 路径可临时换
  永失败 sitekey `2x00000000000000000000BB`。
- 真实密钥只用于生产：公开的 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 位于版本化的
  `.env.production`，Worker Secret 已通过全局 Wrangler 的 macOS 钥匙串 OAuth
  登录写入。
- Next.js 的 `.env.local` 优先级高于 `.env.production`。因此 `worker:build` 会显式从
  `.env.production` 注入生产 Site Key，避免本地 dummy key 被打进生产客户端 bundle；
  `worker:dev` 则显式注入官方 dummy Site Key。生产构建请使用项目 Yarn 命令，不要直接
  调用 `opennextjs-cloudflare build`。
- 不要把 `TURNSTILE_SECRET_KEY` 或其他 Secret 写入仓库。
- `worker:dev` 只在本地注入 `CHAT_LOCAL_DEV=true`，用于处理 Wrangler 把本地请求
  映射到 `http://solidays.win` 的行为；生产配置固定为 `false`，不会放宽 HTTPS
  Origin 校验。

## 构建与 dev server 互斥

构建前先停止开发服务器。`build`/`worker:build` 会重写 `.next`/`.open-next`，和
运行中的 Next dev 共用目录可能导致 Webpack manifest、chunk 或 CSS 404。若侧边
浏览器变成无样式 HTML，先检查 `/_next/static/css/...` 是否 404，再重启 3001 端口上
属于本项目的旧开发进程。

## 已知坑

1. `components/site/MusicDock.tsx` 仍有已知的 React Hook lint warnings；修改音乐逻辑时
   单独处理，不要把 warning 当成本期功能错误。
2. `npx tsc --noEmit` 可能因生成类型文件引用 `.open-next/worker` 报 TS6307；以
   Next/OpenNext 正式 build 为准，不要手改生成的 `cloudflare-env.d.ts` 或
   `worker-configuration.d.ts`。
3. 本机 Wrangler 4.121.0 的 workerd 最高支持 `2026-08-11`；若本地启动提示
   compatibility date 超前，先检查 Wrangler/workerd 版本，不要为了绕过错误关闭
   绑定或改用 npm。
4. Turnstile widget 管理有内置 CLI：`wrangler turnstile widget list/get/create/
   update/delete`（alpha），本机 OAuth 凭据含 `challenge-widgets.write` 权限，
   widget 增删改查走 CLI，不进 Dashboard。核对配置用 `list --json`，展示前
   过滤掉 secret 字段。

## 聊天本地回归（可选）

本地若要继续回归，可在未提交的 `.dev.vars` 中配置本地测试 Secret，再用 `worker:dev`
验证：首次提交设置 HttpOnly Cookie，刷新可读历史，非法 body 返回 400，Turnstile
失败返回 403，超限返回 429，重复关闭保持幂等，关闭后提交创建新会话；历史分页返回
固定上限。实时层还应验证 `GET /api/chat/realtime` 与
`GET /api/admin/conversations/:id/realtime` 的 `101` 握手、断线重连、visitor/owner 双端事件、
关闭事件和重复消息去重。纯事件校验可单独运行
`node .yarn/releases/yarn-3.6.1.cjs test:chat-realtime`。Cron 可通过
`curl http://localhost:8787/cdn-cgi/local/scheduled?cron=0+3+*+*+*` 手动触发。
