# AGENTS.md

这份文件是 Solidays Worker 项目的维护交接说明。开始修改前先阅读本文件和
`wrangler.jsonc`，不要把 Cloudflare Token、`.env.local` 或其他凭据写入仓库。

本文件记录的是当前 `cloudflare-worker-DEV` 开发分支的实际状态；生产分支是
`cloudflare-worker`。如果部署配置、数据来源或本地启动方式发生变化，完成验证后同步更新这里。

## Cloudflare 操作原则

- Cloudflare 相关操作默认优先使用项目自带 Yarn 和 Wrangler CLI，不要主动打开 Cloudflare
  Dashboard 或浏览器。
- 日常部署、版本查询、绑定检查、D1/R2 操作、Worker 日志和线上冒烟测试都通过 CLI 完成；
  需要账号、网络或 macOS Keychain 时，在沙箱外运行，并设置 `WRANGLER_WRITE_LOGS=false`。
- GitHub → Cloudflare Workers Builds 的仓库连接已经完成，不要重复进入浏览器配置。日常开发只
  在 `cloudflare-worker-DEV` 分支进行；只有合并到 `cloudflare-worker` 并推送生产分支时才发布线上版本。
- 只有 CLI/API 不支持的操作，或用户明确要求查看 Dashboard 时，才使用浏览器；不要为了
  查询部署状态切换到浏览器。
- 绝不在命令参数、日志、提交记录或文档中输出 Cloudflare Token、Worker Secret 或其他凭据。

## 分支与发布约定

- `cloudflare-worker-DEV`：日常开发、调试和功能提交分支；以后默认切换到这个分支工作。
- `cloudflare-worker`：生产分支；只接受已经在 DEV 分支验证过的改动。
- 日常开发流程：切到 DEV → 修改和本地验证 → 提交 → 推送 `cloudflare-worker-DEV`。DEV 推送不应
  更新生产 Worker。
- 发布流程：停止本地开发服务器 → 在 DEV 完成检查和提交 → 切到生产分支并同步 → 合并
  `cloudflare-worker-DEV` → 推送 `cloudflare-worker` → 等待 Workers Builds 自动部署（每 2 分钟用 CLI 检查一次）→ 用 Wrangler
  CLI 和线上 HTTP 请求核验。
- 不要直接在 `cloudflare-worker` 上开发或提交；不要用本地 `worker:deploy` 绕过生产 CI，除非
  Workers Builds 明确失败或用户明确要求手工回退。

## 项目概况

- 项目：`solidays-worker`，Next.js App Router + Tailwind CSS + Framer Motion。
- 构建方式：OpenNext for Cloudflare，把 Next.js 应用构建为 Cloudflare Worker。
- 当前维护分支：`cloudflare-worker-DEV`。
- 当前生产分支：`cloudflare-worker`。
- 当前展示页：`/`、`/fnds`、`/about`；卡片接口是 `/api/cards`。
- 首页当前固定使用 `data/cards.ts` 中的一条默认卡片；首页不再请求 `/api/cards`，但该接口
  暂时保留作为以后接入 D1 的数据边界。
- 首页 CardStack 保留 3 层静态堆叠视觉：1 张真实卡片和 2 个空白后层框，不自动轮播、不
  做数据切换。
- 当前生产域名：`https://solidays.win`；`https://www.solidays.win` 会跳转到主域名。
- `workers.dev` 默认地址已经关闭，不要把它当作生产入口。

## 主要目录与当前约定

- `app/`：页面、API 路由和 App Router 入口；`fnds`、`about` 的图片/头像通过 R2 object key
  访问，`app/media/[...key]/route.ts` 负责私有媒体读取。
- `components/`、`contexts/`：页面组件、主题和交互状态；`lib/media.ts` 负责媒体 URL。
- `data/cards.ts`：当前唯一的默认卡片数据。`app/page.tsx` 直接使用它，不要恢复客户端
  fetch、本地镜像状态或自动轮播。
- `components/ui/CardStack.tsx`：3 层静态堆叠（1 张真实卡片 + 2 个空白后层框），当前不做
  数据切换；`SongContext` 仍使用同一份默认卡片供 `MusicDock` 查找歌曲。
- `app/api/cards/route.ts`：当前不是首页运行时依赖，作为未来 D1 数据边界保留；修改前确认
  没有外部调用方。
- `components/chat/`：Floating Glass Chat；全局挂载于 `app/layout.tsx`，前端展示为“匿名留言”，
  已接入 `/api/chat/*`，不调用 Workers AI，也不伪造 owner/assistant 回复。
- `app/api/chat/`、`lib/chat/`：匿名留言 V1 的同源接口、安全校验、访客 Cookie、Turnstile、限流和
  D1 访问层。后端保留 `owner`/`system` 消息角色，便于后续回复扩展。
- `migrations/0001_chat.sql`、`migrations/0002_chat_quotas.sql`：D1 的留言表结构、配额计数/触发器、
  历史游标索引和每个访客只能有一个 open conversation 的唯一部分索引。
- `custom-worker.ts`：复用 OpenNext fetch handler，并通过每天 UTC 03:00 的 Cron 清理 30 天前 closed
  和 90 天未活跃的 open 会话。
- 聊天使用现有 `framer-motion` 的 `LayoutGroup`/`layoutId` 和 `@shadcn/react` 的消息滚动
  runtime；不要再安装第二套 `motion`。玻璃效果使用本项目 CSS fallback。
- 二期已按“匿名留言 V1”开始实施：接入 D1、Turnstile、Rate Limiting、访客 Cookie 和三个留言 API；
  保留 `owner` 消息角色和后续回复扩展，但本期不做 owner 登录、后台、实时通信、邮件或 AI。
- `wrangler.jsonc`、`open-next.config.ts`：Worker、域名、R2、AI 和 OpenNext 构建配置。

## 当前 Cloudflare 资源

`wrangler.jsonc` 当前配置了：

- Worker：`solidays-worker`。
- Custom Domains：`solidays.win`、`www.solidays.win`。
- `workers_dev: false`：关闭默认 `workers.dev` 地址；如果只在 Dashboard 里关闭而不保留这个配置，下次部署可能重新启用。
- `CHAT_LOCAL_DEV` 不在 `vars` 里配置：只通过 `worker:dev --var CHAT_LOCAL_DEV:true` 注入本地
  环境；`lib/chat/turnstile.ts` 和 `lib/chat/security.ts` 的放宽分支还叠加了 http 协议判断，
  生产 https 流量即使误配该 var 也不会生效。不要把它写回 `vars`。
- `ASSETS`：OpenNext 静态资源绑定。
- `cache.enabled: true`：打开 Workers Caching，不加 `cross_version_cache`。`custom-worker.ts`
  只允许 `GET/HEAD /media/*` 且响应为 `200`、`image/*`、无 `Set-Cookie` 的结果保留原
  Cache-Control；其余动态 Worker 响应改为 `no-store`。`/_next/static/*` 仍由 Static Assets
  服务，不靠这层出口。区级 purge 清不掉 Workers Caching。`open-next.config.ts` 使用
  `defineCloudflareConfig({})`，增量缓存是 dummy，没有 R2 incremental cache。
- `MEDIA_BUCKET`：R2 桶 `solidays-media`，当前为远程绑定。
- `AI`：Workers AI 远程绑定，当前配置已预留；代码中暂未接入具体模型调用。
- `IMAGES`：Cloudflare Images Binding，负责从 R2 原图生成 FNDS 卡片图片变体；原图仍保存在
  `MEDIA_BUCKET`，不迁移到 Images 存储。
- Observability：已启用。
- `CHAT_DB`：独立 D1 `solidays-chat`，database ID 已写入 `wrangler.jsonc`；远程已应用
  `migrations/0001_chat.sql`，`migrations/0002_chat_quotas.sql` 已在本地应用，生产部署前由 CI 迁移。
- `CHAT_RATE_LIMITER`：Workers Rate Limiting binding，匿名留言、结束留言和历史读取均按可信 IP/
  已验证访客 Cookie 限制为每 60 秒 10 次。
- `TURNSTILE_SECRET_KEY`：已写入 `solidays-worker` 的 Worker Secret；正式 Turnstile widget
  `solidays-chat-turnstile` 为 Invisible，已覆盖 `solidays.win`、`localhost`、`127.0.0.1`，前端公开 Site Key
  通过版本化的 `.env.production` 注入生产构建；Site Key 本身是公开值，真正的 Secret 仍只放在
  Worker Secret 或本地未提交的 `.dev.vars` 中。

### R2 媒体约定

- FNDs 图片放在 `fnds/` 前缀下。
- 头像放在 `profile/` 前缀下，例如 `profile/avatar.jpg`。
- `/media/[...key]` 只允许 `fnds/` 和 `profile/` 前缀，并拒绝包含 `..` 的路径。
- 当前生产站通过 Worker 读取私有 R2 对象，不依赖 `r2.dev` 公共地址。
- FNDS 卡片通过 `variant=card` 请求 320/480/640 宽度的 WebP 变体，Worker 使用 Images Binding
  从 R2 原图按 `fit=cover` 生成并缓存；不要把原图直接重新写入页面。
- 新增图片时，先上传到 R2，再在页面中引用对应 object key；不要把同一批生产图片重新放回 Git。

## 本地开发和检查

项目声明使用 Yarn 3.6.1，版本文件位于 `.yarn/releases/`，配置位于 `.yarnrc.yml`。当前机器
没有全局 `yarn`，统一通过项目自带 Yarn 运行，不要生成 `package-lock.json`：

```bash
node .yarn/releases/yarn-3.6.1.cjs install
node .yarn/releases/yarn-3.6.1.cjs dev --hostname 127.0.0.1 --port 3001
node .yarn/releases/yarn-3.6.1.cjs lint
node .yarn/releases/yarn-3.6.1.cjs test
node .yarn/releases/yarn-3.6.1.cjs typecheck
node .yarn/releases/yarn-3.6.1.cjs build
node .yarn/releases/yarn-3.6.1.cjs worker:build
node .yarn/releases/yarn-3.6.1.cjs worker:types
node .yarn/releases/yarn-3.6.1.cjs wrangler d1 migrations apply solidays-chat --local
```

`lint` 覆盖 `app`、`components`、`contexts`、`data`、`lib`、`middleware.ts` 和 `custom-worker.ts`；
ESLint 不启用类型感知解析（不要在 `eslint.config.mjs` 加回 `parserOptions.project`，否则单文件
lint 会慢到不可用），`no-unused-vars` 已开启，未使用变量用 `_` 前缀豁免。`test` 用 Vitest 运行
`tests/` 下的单测（chat 安全校验、消息游标、媒体 key/宽度契约）。`typecheck` 用
`tsc --noEmit --composite false`；`--composite false` 是为了绕开生成类型文件引用
`.open-next/worker` 引发的 TS6307，不要去掉，也不要手改生成的 `cloudflare-env.d.ts` 或
`worker-configuration.d.ts`。

`worker:dev` 会先构建，再启动 Wrangler；`wrangler.jsonc` 中的 R2 和 AI 是 `remote: true`，
本地调试可能访问真实 Cloudflare 资源，不要在未确认时做上传、删除或 AI 调用。

每次改动后都要主动检查本地浏览器控制台和终端输出；无论是 Error 还是 Warning，都要定位并处理，
不能默认忽略。如果问题涉及行为取舍、权限或无法安全判断，先明确告诉用户再继续。

本地 Worker 聊天提交还需要在未提交的 `.dev.vars` 中配置 `TURNSTILE_SECRET_KEY`；生产 Worker
Secret 已通过全局 Wrangler 的 macOS 钥匙串 OAuth 登录写入。公开的
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` 位于版本化的 `.env.production`，本地 `.env.local` 可以覆盖它；
不要把 `TURNSTILE_SECRET_KEY` 或其他 Secret 写入仓库。

构建前先停止开发服务器。`build`/`worker:build` 会重写 `.next`/`.open-next`，和运行中的
Next dev 共用目录可能导致 Webpack manifest、chunk 或 CSS 404。若侧边浏览器变成无样式 HTML，
先检查 `/_next/static/css/...` 是否 404，再重启 3001 上属于本项目的旧开发进程。

## 生产部署流程

当前生产主流程是 GitHub → Cloudflare Workers Builds，目标仓库是
`francis1104/tailwind-nextjs-starter-blog`，生产分支是 `cloudflare-worker`。日常开发分支是
`cloudflare-worker-DEV`；只有生产分支推送才触发线上发布。Workers Builds 中的命令已经配置为：

```text
构建命令：yarn worker:build
部署命令：yarn worker:deploy:ci（先应用 D1 远程迁移，再部署 Worker）
```

### 日常开发

```bash
git switch cloudflare-worker-DEV
git pull --ff-only origin cloudflare-worker-DEV
# 修改、检查和本地验证
git add -A
git commit -m "<describe change>"
git push origin cloudflare-worker-DEV
```

### 发布生产

正常发布按以下顺序执行：

1. 在 DEV 分支确认工作区和分支：`git status --short --branch`。
2. 停止本地开发服务器。构建和开发服务器不能同时运行，否则可能互相覆盖 `.next` 或
   `.open-next` 产物。
3. 使用项目自带 Yarn 做检查和构建：

   ```bash
   node .yarn/releases/yarn-3.6.1.cjs lint
   node .yarn/releases/yarn-3.6.1.cjs worker:types
   node .yarn/releases/yarn-3.6.1.cjs worker:build
   WRANGLER_WRITE_LOGS=false node .yarn/releases/yarn-3.6.1.cjs worker:deploy:ci --dry-run
   ```

4. 在 DEV 分支提交并推送：

   ```bash
   git add -A
   git commit -m "<describe change>"
   git push origin cloudflare-worker-DEV
   ```

5. 切到生产分支并同步，然后合并 DEV：

   ```bash
   git switch cloudflare-worker
   git pull --ff-only origin cloudflare-worker
   git merge --no-ff cloudflare-worker-DEV -m "merge cloudflare-worker-DEV into production"
   ```

6. 推送生产分支：

   ```bash
   git push origin cloudflare-worker
   ```

7. 推送后由 Workers Builds 自动运行构建和部署；`worker:deploy:ci` 会先应用 D1 远程迁移，
   再部署 Worker。正常发布不要再手动执行 `worker:deploy`，避免重复构建或绕过 CI。
   等待 CI 时每 2 分钟检查一次，不要高频轮询：

   ```bash
   sleep 120
   ```

8. 用 Wrangler CLI 核验最新部署和绑定；每次检查间隔 120 秒，直到新版本出现并接收 100% 流量：

   ```bash
   WRANGLER_WRITE_LOGS=false node .yarn/releases/yarn-3.6.1.cjs exec wrangler deployments list --name solidays-worker --json
   WRANGLER_WRITE_LOGS=false node .yarn/releases/yarn-3.6.1.cjs exec wrangler versions view <VERSION_ID> --json
   ```

9. 用 CLI 做线上冒烟测试：

   ```bash
   curl -sS -o /dev/null -w '%{http_code} %{url_effective}\n' https://solidays.win/
   curl -sS -o /dev/null -w '%{http_code} %{url_effective}\n' https://solidays.win/fnds
   curl -sS -o /dev/null -w '%{http_code} %{url_effective}\n' https://solidays.win/api/cards
   curl -sS https://solidays.win/api/chat/conversation
   ```

### CI 不可用时的手工回退

只有 Workers Builds 明确失败、暂停或用户明确要求手工发布时，才使用本地 Wrangler 回退：

```bash
node .yarn/releases/yarn-3.6.1.cjs worker:deploy
```

`worker:deploy` 会先用项目自带 Yarn 构建，再通过 `OPEN_NEXT_DEPLOY=true` 调用 Wrangler；当前
Turnstile 配置和生产部署均已完成。部署后验证 `GET /api/chat/conversation`、Turnstile 失败返回和
正式留言写入，不要用生产 token 绕过验证。

`OPEN_NEXT_DEPLOY=true` 用来告诉 Wrangler 当前已经由 OpenNext 生成了
`.open-next/worker.js`，避免 OpenNext 和 Wrangler 互相递归调用。构建产物位于
`.open-next/`，不应手工编辑或提交生成目录。

部署后至少验证：

```bash
curl -sS -L -o /dev/null -w '%{http_code} %{url_effective}\n' https://solidays.win/
curl -sS -L -o /dev/null -w '%{http_code} %{url_effective}\n' https://www.solidays.win/
```

预期是自定义域名 `200`、`www` 跳转主域名后 `200`；`workers_dev` 已关闭，不把
`workers.dev` 当作生产入口。构建产物 `.open-next/` 不应手工编辑或提交。

## 高风险注意事项

1. Token 只能通过安全环境或交互式命令提供，绝不写入本文件、代码、日志或提交记录；账单
   只读 Token 不能代替 Worker/R2 部署权限。
2. R2 和 Workers AI 的 `remote: true` 会触碰真实资源；本地调试时不要未经确认上传、删除
   文件或调用模型。
3. 媒体路由只接受 `fnds/`、`profile/` 前缀和合法 object key，不要为了绕过 404 放宽路径
   校验。
4. 不要让生产构建和 dev server 同时运行；若侧边浏览器出现无样式 HTML，先查 CSS 404，
   再重启 3001 端口上属于本项目的旧进程。
5. `components/MusicDock.tsx` 的 React Hook lint warnings 已在 2026-08-16 重构修复（事件监听挂载时
   绑定一次、ref 在 effect 中同步、无 setTimeout 重试链）；修改音乐逻辑时仍单独提交，合并生产前
   建议做一次真机播放回归。
6. 直接 `tsc --noEmit` 会因生成类型文件引用 `.open-next/worker` 报 TS6307；用
   `yarn typecheck`（`--composite false`）或以 Next/OpenNext 正式 build 为准，不要手改生成的
   `cloudflare-env.d.ts` 或 `worker-configuration.d.ts`。
7. 本机 Wrangler 4.121.0 的 workerd 最高支持 `2026-08-11`；若本地启动提示 compatibility date
   超前，先检查 Wrangler/workerd 版本，不要为了绕过错误关闭绑定或改用 npm。

## 当前匿名留言 V1 状态

- [x] 接入 `GET /api/chat/conversation`、`POST /api/chat/messages` 和
      `POST /api/chat/conversation/close`。
- [x] 创建并迁移独立 D1 `solidays-chat`，配置 `CHAT_DB`、`CHAT_RATE_LIMITER` 和必需的
      `TURNSTILE_SECRET_KEY`，并生成 Cloudflare 绑定类型。
- [x] 前端展示、读取历史、真实提交、关闭会话和关闭后新会话的代码路径已完成；不追加假回复。
- [x] 完成 Finding 1 的配额、分页、读取限流和 Cron 清理：单会话 50 条/128 KiB，单访客 200 条/
      512 KiB，历史每页 20 条，closed 保留 30 天，stale open 保留 90 天；2026-08-16 修复了 Cron
      批处理提前退出的问题（消息或会话任一删满一批即继续下一批）。
- [x] `migrations/0002_chat_quotas.sql` 已在本地应用并验证触发器拒绝第 51 条消息；生产迁移由
      `worker:deploy:ci` 在部署前执行，当前尚未发布。
- [x] 创建 Turnstile widget `solidays-chat-turnstile`，配置 site key 和 Worker secret；Widget
      允许域名为 `solidays.win`、`localhost`、`127.0.0.1`，并通过官方 siteverify 完成 Secret 校验。
- [x] Workers Builds 已自动发布包含本期后端的 Worker，当前核验版本为
      `6b1bc459-ed63-43e4-96bd-832199ecca08`，100% 流量生效；首页、CSS、会话 GET、聊天路由和
      伪造 token 拒绝检查已通过。
- [x] 在生产页面用真实 Turnstile token 完成留言写入；手机端测试已在远程 D1 产生 1 个访客、1 个开放会话和
      3 条 visitor 消息。
- [ ] 可选回归：用本地 Turnstile 测试 key 验证重复 token、429、关闭幂等和关闭后新会话；不阻塞当前线上版本。
- [ ] 后续再做 owner 登录、后台回复、邮件通知或实时能力；本期不实现。

## 变更和提交约定

- 先检查 `git status --short --branch`，默认在 `cloudflare-worker-DEV` 上工作；保留用户已有改动，
  不要使用破坏性重置命令。
- 修改 `wrangler.jsonc` 后至少执行一次
  `node .yarn/releases/yarn-3.6.1.cjs worker:build`。
- 线上部署后验证主域名、`www` 跳转和关键媒体路径。
- Cloudflare 操作优先走 CLI，不要主动打开浏览器；若使用 Workers Builds，推送后用 Wrangler
  `deployments list`/`versions view` 核验，不要把“GitHub 已推送”直接当成“线上已发布”。
- 生产发布必须通过 `cloudflare-worker-DEV` → `cloudflare-worker` 的合并流程；不要直接在生产分支
  修改后推送。
- 生成的 `.next/`、`.open-next/`、`.wrangler/` 和本地环境文件不应提交；凭据绝不提交。
