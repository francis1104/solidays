# AGENTS.md

这份文件只保留跨任务通用的工作规则和导航信息。项目细节按类别放在 `docs/` 下，
做对应任务前先读相关文档；如果部署配置、数据来源或本地启动方式发生变化，完成
验证后同步更新对应文档。绝不在命令参数、日志、提交记录或文档中输出 Cloudflare
Token、Worker Secret 或其他凭据。

## 技术栈

- 框架：Next.js 15 App Router + React 19 + TypeScript
- 样式与动画：Tailwind CSS 4、Framer Motion、next-themes（明暗主题）
- 构建：OpenNext for Cloudflare 把 Next.js 应用构建为 Cloudflare Worker（`solidays-worker`）
- 存储：R2 `solidays-media`（私有媒体）、D1 `solidays-chat`（匿名留言）、
  Cloudflare Images（FNDS 卡片图片变体）
- 安全与限流：Cloudflare Turnstile、Workers Rate Limiting
- 包管理：仓库内置 Yarn 3.6.1（无全局 yarn）、Wrangler CLI 4.x
- 资源与绑定细节见 `docs/cloudflare/resources-and-bindings.md`

## 模块与路由

```text
solidays.win/
│
├── / ······················ 首页：CardStack 静态卡片堆叠
│     app/page.tsx
│     ├── components/magicui/CardStack.tsx   # 3 层堆叠（1 真卡 + 2 空白后层）
│     └── data/cards.ts                      # 默认卡片数据（首页唯一数据源）
│
├── /fnds ·················· FNDS 图片卡片页
│     app/fnds/page.tsx
│     ├── components/magicui/draggable-card.tsx
│     ├── components/magicui/squiggly-text.tsx
│     └── lib/media.ts + lib/media-image-loader.ts   # R2 key → /media URL
│
├── /about ················· 个人介绍页（头像走 /media/profile/）
│     app/about/page.tsx → lib/media.ts
│
├── /api/cards ············· GET 卡片数据（force-static；未来 D1 数据边界）
│     app/api/cards/route.ts → data/cards.ts
│
├── /api/chat/ ············· 匿名留言（三个接口共用下列模块）
│     ├── conversation ····· GET   读当前开放会话（游标分页）
│     ├── messages ········· POST  提交留言（同源 Origin+Turnstile+限流+D1 配额）
│     └── conversation/close POST  幂等关闭会话
│     app/api/chat/**/route.ts               # 三个 route handler
│     ├── lib/chat/                          # db(D1)·validation·security·turnstile·
│     │                                      #   rate-limit·session·limits
│     ├── migrations/0001_chat.sql           # 表结构 + 单开放会话唯一索引
│     ├── migrations/0002_chat_quotas.sql    # 配额触发器（50 条/128KiB/会话，
│     │                                      #   200 条/512KiB/访客）
│     └── components/chat/                   # Floating Glass Chat 前端
│
├── /media/<key> ··········· 私有 R2 媒体（fnds/ · profile/ 前缀白名单）
│     │                        ?variant=card&width=320|480|640 → Images 变体
│     app/media/[...key]/route.ts
│     ├── R2  solidays-media（MEDIA_BUCKET 绑定）
│     └── lib/media.ts                       # key 校验 + 宽度契约
│
├── middleware.ts ·········· www.solidays.win → solidays.win 308 跳转
│
└── Cron 0 3 * * * ········· custom-worker.ts 清理过期会话
                              （closed 30 天 / stale open 90 天）

全局挂载（app/layout.tsx）：
site/Header · site/MusicDock · chat/floating-chat · magicui/meteors
状态：contexts/SongContext.tsx（卡片歌曲 → MusicDock 播放队列）
```

组件分组约定：`components/site/` 是项目自己写的页面组件；
`components/chat/` 是聊天前端；`components/ui/` 是 shadcn 来源、
`components/magicui/` 是 Magic UI 来源的复制源码组件；`components/lib/` 是
shadcn 约定的 `cn()` 工具。

## 文档地图

| 文档 | 内容 |
| --- | --- |
| `docs/overview/project.md` | 项目概况、页面、域名、主要目录与约定 |
| `docs/cloudflare/resources-and-bindings.md` | wrangler.jsonc 资源与绑定、D1 存储规划 |
| `docs/cloudflare/media-storage.md` | R2 媒体前缀、/media 路由、变体与上传流程 |
| `docs/development/local-development.md` | 本地开发命令、环境变量、检查与常见坑 |
| `docs/deployment/release-process.md` | 分支模型、发布流程、核验与手工回退 |
| `docs/features/anonymous-chat/backend-implementation.md` | 匿名留言后端实施记录与当前状态 |
| `docs/features/anonymous-chat/frontend-plan.md` | 聊天前端实施方案 |
| `docs/incidents/` | 生产事故报告 |

## 通用工作规则

1. 工具链：统一用项目自带 Yarn（`node .yarn/releases/yarn-3.6.1.cjs <command>`），
   不生成 `package-lock.json`。
2. 分支：日常开发只在 `cloudflare-worker-DEV`；生产分支 `cloudflare-worker` 只接受
   DEV 合并，不直接在其上开发或提交；DEV 推送不会发布生产。详细流程见
   `docs/deployment/release-process.md`。
3. 凭据：`.env.local`、`.dev.vars`、Token、Secret 不提交、不打印；账单只读 Token
   不能代替 Worker/R2 部署权限。
4. Cloudflare：Cloudflare 相关操作优先用 Wrangler CLI 完成，不要通过 Cloudflare
   Dashboard/浏览器 UI 执行 Cloudflare 操作；推送后用 `deployments list` 核验，
   "GitHub 已推送"不等于"线上已发布"。
5. 远程绑定：`wrangler.jsonc` 中 R2/AI/Images 为 `remote: true`，本地调试会触真实
   资源；未经确认不做上传、删除文件或模型调用。
6. 构建互斥：`build`/`worker:build` 会重写 `.next`/`.open-next`，不要和 dev server
   同时运行；`.next/`、`.open-next/`、`.wrangler/` 等生成目录不提交。
7. 每次改动后检查本地浏览器控制台和终端输出，Error 和 Warning 都要定位处理，不能
   默认忽略；涉及行为取舍或无法安全判断时，先明确告诉用户再继续。
8. 保留用户已有改动，先看 `git status --short --branch` 再操作，不使用破坏性重置命令。
