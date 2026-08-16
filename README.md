# Solidays Worker

这是 Solidays 的最小展示站点，当前保留：

- `/`：卡片式首页和歌曲数据入口
- `/fnds`：Fear and Dreams 图片卡片页
- `/about`：个人介绍页
- 全局主题切换、流星背景和可选音乐 Dock

项目使用 Next.js App Router、Tailwind CSS 和 Framer Motion。`cloudflare-worker` 分支通过
[OpenNext for Cloudflare](https://opennext.js.org/cloudflare) 构建为 Cloudflare Worker。

## 本地开发

```bash
node .yarn/releases/yarn-3.6.1.cjs install
cp .env.example .env.local
node .yarn/releases/yarn-3.6.1.cjs dev --hostname 127.0.0.1 --port 3001
```

打开 <http://127.0.0.1:3001>。项目固定使用仓库内的 Yarn 3.6.1，不生成 `package-lock.json`。

## Cloudflare Worker

```bash
node .yarn/releases/yarn-3.6.1.cjs worker:build
node .yarn/releases/yarn-3.6.1.cjs worker:dev
node .yarn/releases/yarn-3.6.1.cjs worker:deploy
```

Worker 配置在 `wrangler.jsonc`，R2 的接入步骤见
[`docs/cloudflare/resources-and-bindings.md`](docs/cloudflare/resources-and-bindings.md)。当前 Worker 已绑定
`solidays-media` R2 桶、Workers AI、`solidays-chat` D1 和留言限流；匿名留言提交还接入了
Turnstile。生产环境使用 `solidays.win`，`workers.dev` 默认地址已关闭。

## 环境变量

复制 `.env.example` 后按需设置：

- `NEXT_PUBLIC_SITE_URL`：站点 URL
- `NEXT_PUBLIC_R2_PUBLIC_URL`：R2 公共域名；设置后 `/fnds` 使用 R2 对象 key
- `NEXT_PUBLIC_API_URL`：可选的外部卡片 API，不设置时使用本 Worker 的 `/api/cards`
- `NEXT_PUBLIC_MUSIC_API_URL`：可选的歌曲信息 API，不设置时隐藏音乐 Dock，避免调用失效接口
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`：匿名留言 Widget 的公开 Site Key；生产值保存在未提交的 `.env.local`

`TURNSTILE_SECRET_KEY` 是服务端 Secret：本地开发放在未提交的 `.dev.vars`，生产通过
`wrangler secret put TURNSTILE_SECRET_KEY` 写入 Worker，不要写入 Git。

聊天接口当前是匿名留言 V1：`GET /api/chat/conversation` 读取当前会话，
`POST /api/chat/messages` 提交留言，`POST /api/chat/conversation/close` 结束当前会话。
详细说明见 [`docs/features/anonymous-chat/backend-implementation.md`](docs/features/anonymous-chat/backend-implementation.md)。
