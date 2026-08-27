# 项目概况

> 原 AGENTS.md「项目概况」「主要目录与当前约定」两节拆分至此（2026-08-16）。
> 本文描述的是 `cloudflare-worker-DEV` 开发分支的实际状态。

## 基本信息

- 项目：`solidays-worker`，Next.js App Router + Tailwind CSS + Framer Motion。
- 构建方式：OpenNext for Cloudflare，把 Next.js 应用构建为 Cloudflare Worker。
- 当前维护分支：`cloudflare-worker-DEV`；生产分支：`cloudflare-worker`
  （分支与发布规则见 `docs/deployment/release-process.md`）。
- 当前展示页：`/`、`/gallery`、`/fnds`、`/about`；卡片接口是 `/api/cards`。
- 首页使用 `data/cards.ts` 硬编码歌词卡：用户手势循环正面卡，点 Play 才出声。
  禁止 auto-rotate，禁止客户端 fetch `/api/cards`。该接口暂时保留作为以后接入
  D1 的数据边界。首页下方是 Gallery / FNDS 入口预览（poster / 静帧，不加载视频）。
- 当前生产域名：`https://solidays.win`；`https://www.solidays.win` 会跳转到主域名。
- `workers.dev` 默认地址已经关闭，不要把它当作生产入口。

## 主要目录与当前约定

- `app/`：页面、API 路由和 App Router 入口；`fnds`、`about` 的图片/头像以及首页音乐通过 R2
  object key 访问，`app/media/[...key]/route.ts` 负责私有媒体读取。
- `components/`：按来源与职责分组——`site/`（项目自己的页面组件）、`gallery/`（Gallery
  页面）、`chat/`（聊天前端）、`ui/`（shadcn 来源）、`magicui/`（Magic UI 来源）、
  `lib/`（shadcn 约定的 `cn()` 工具）。`contexts/`：主题和交互状态；`lib/media.ts`
  负责私有媒体 URL；`lib/gallery.ts` 负责公开 Gallery 基址。
- `data/cards.ts`：首页四张歌词卡与私有 R2 `audioKey` 数据源。`app/page.tsx` 经
  `HomeLyricStack` 使用它，不要恢复客户端 fetch `/api/cards` 或自动轮播。用户手势
  循环是允许的。
- `components/magicui/CardStack.tsx`：3 层堆叠 primitive（正面歌词区循环，Play
  独立按钮，后层 `pointer-events-none`）。`lib/music.ts` 的共享 `audioCache`
  给卡片 Play 和 MusicDock 预解析使用。
- `app/api/cards/route.ts`：当前不是首页运行时依赖，作为未来 D1 数据边界保留；
  修改前确认没有外部调用方。
- `components/chat/`：Floating Glass Chat；全局挂载于 `app/layout.tsx`，前端展示为
  “匿名留言”，已接入 `/api/chat/*`，不调用 Workers AI，也不伪造 owner/assistant 回复。
- `app/api/chat/`、`lib/chat/`：匿名留言 V1 的同源接口、安全校验、访客 Cookie、
  Turnstile、限流和 D1 访问层。后端保留 `owner`/`system` 消息角色，便于后续回复扩展。
- `migrations/0001_chat.sql`、`migrations/0002_chat_quotas.sql`：D1 的留言表结构、
  配额计数/触发器、历史游标索引和每个访客只能有一个 open conversation 的唯一部分索引。
- `custom-worker.ts`：复用 OpenNext fetch handler，并通过每天 UTC 03:00 的 Cron 清理
  30 天前 closed 和 90 天未活跃的 open 会话。
- `wrangler.jsonc`、`open-next.config.ts`：Worker、域名、R2、AI 和 OpenNext 构建配置。

## 聊天技术约束

- 聊天使用现有 `framer-motion` 的 `LayoutGroup`/`layoutId` 和 `@shadcn/react` 的
  消息滚动 runtime；不要再安装第二套 `motion`。玻璃效果使用本项目 CSS fallback。
- 二期已按“匿名留言 V1”实施：接入 D1、Turnstile、Rate Limiting、访客 Cookie 和
  三个留言 API；保留 `owner` 消息角色和后续回复扩展，但本期不做 owner 登录、后台、
  实时通信、邮件或 AI。详见 `docs/features/anonymous-chat/backend-implementation.md`。
