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
yarn
cp .env.example .env.local
yarn dev
```

打开 <http://localhost:3000>。

## Cloudflare Worker

```bash
yarn worker:build
yarn worker:dev
yarn worker:deploy
```

Worker 配置在 `wrangler.jsonc`，R2/D1 的接入步骤见
[`docs/cloudflare-storage.md`](docs/cloudflare-storage.md)。当前 AI 绑定已预留；R2 和 D1
需要先确认真实资源后再绑定。

## 环境变量

复制 `.env.example` 后按需设置：

- `NEXT_PUBLIC_SITE_URL`：站点 URL
- `NEXT_PUBLIC_R2_PUBLIC_URL`：R2 公共域名；设置后 `/fnds` 使用 R2 对象 key
- `NEXT_PUBLIC_API_URL`：可选的外部卡片 API，不设置时使用本 Worker 的 `/api/cards`
- `NEXT_PUBLIC_MUSIC_API_URL`：可选的歌曲信息 API，不设置时隐藏音乐 Dock，避免调用失效接口
