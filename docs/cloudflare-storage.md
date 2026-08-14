# Cloudflare 存储规划

这个分支使用 OpenNext 将 Next.js 应用构建成一个 Cloudflare Worker。Worker 的 AI、R2 和未来
D1 绑定属于同一个部署单元，不需要把生产图片或结构化数据继续放进 Git 仓库。

## 当前状态

- `wrangler.jsonc` 已经预留并启用了 `AI` 绑定，Workers AI 在本地调试时仍然走远程服务。
- R2 桶 `solidays-media` 已创建，并以 `MEDIA_BUCKET` 绑定到当前 Worker；本地 Worker 调试也会使用这个远程桶。
- `/fnds` 使用的 7 个图片对象已经上传到 `solidays-media/fnds/`。
- About 页使用的头像已上传到 `solidays-media/profile/avatar.jpg`。
- Worker 已部署到 `https://solidays.win`，`www.solidays.win` 跳转到主域名；生产环境通过 `/media/<key>` 读取私有 R2 图片。
- `workers.dev` 默认地址已关闭，后续部署必须保留 `"workers_dev": false`。
- 已创建独立 D1 `solidays-chat`，只承载匿名留言 V1；没有直接绑定 D101，也没有把卡片数据混入留言库。
- `migrations/0001_chat.sql` 已应用到本地和远程 D1；后续卡片等内容数据应先单独设计 schema，再决定是否
  创建独立数据库或增加明确的 migration。
- `/fnds` 的图片优先使用 `NEXT_PUBLIC_R2_PUBLIC_URL`；当前本地配置和生产 Worker 都通过 `/media/<key>` 读取 R2。
- `/api/cards` 当前返回 `data/cards.ts` 中的最小默认数据，是将来接入 D1 的明确入口。

## 图片迁移到 R2

媒体桶已经创建并在 `wrangler.jsonc` 中绑定：

```jsonc
"r2_buckets": [
  {
    "binding": "MEDIA_BUCKET",
    "bucket_name": "solidays-media",
    "remote": true
  }
]
```

上传对象时使用与页面代码一致的 key，例如：

```bash
wrangler r2 object put solidays-media/fnds/01-zhi-ming-ri-de-wu.jpg --file ./01.jpg
```

如果配置了 R2 公共域名，把 `NEXT_PUBLIC_R2_PUBLIC_URL` 设置为该域名；否则生产 Worker
会通过 `/media/<key>` 读取私有桶。`app/fnds/page.tsx` 会请求
`fnds/01-zhi-ming-ri-de-wu.jpg` 等 key。

## 结构化数据接入 D1

当前 `CHAT_DB` 只用于聊天，不要直接把首页卡片数据写入 `solidays-chat`。如果以后要把卡片等结构化内容
迁移到 D1，先确认数据归属并写 migration，再增加独立绑定，例如：

```jsonc
"d1_databases": [
  {
    "binding": "CONTENT_DB",
    "database_name": "solidays-content",
    "database_id": "<真实的 D1 database id>",
    "migrations_dir": "./migrations",
    "remote": true
  }
]
```

接入顺序建议是：先写 migration，再把 `/api/cards` 的默认数组替换为 D1 查询，确认线上读取稳定后再删除
`data/cards.ts` 中不再需要的回退数据。数据库连接和绑定不放在 `NEXT_PUBLIC_*` 变量中。

## Worker 命令

```bash
node .yarn/releases/yarn-3.6.1.cjs worker:build
node .yarn/releases/yarn-3.6.1.cjs worker:dev
node .yarn/releases/yarn-3.6.1.cjs worker:deploy
```

首次绑定资源或修改 `wrangler.jsonc` 后先用 `wrangler deploy --dry-run` 检查配置；真正部署前需要登录
Cloudflare，并确认 R2/D1 的生产资源名称和权限。当前机器的 Wrangler OAuth 凭据保存在 macOS 钥匙串。
