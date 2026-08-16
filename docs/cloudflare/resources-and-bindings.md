# Cloudflare 资源与绑定

> 原 AGENTS.md「当前 Cloudflare 资源」一节与 `docs/cloudflare-storage.md` 合并至此
> （2026-08-16）。媒体上传与 `/media` 路由细节见 `media-storage.md`。

## `wrangler.jsonc` 当前配置

- Worker：`solidays-worker`。
- Custom Domains：`solidays.win`、`www.solidays.win`。
- `workers_dev: false`：关闭默认 `workers.dev` 地址；如果只在 Dashboard 里关闭而不
  保留这个配置，下次部署可能重新启用。
- `ASSETS`：OpenNext 静态资源绑定。
- `cache.enabled: true`：打开 Workers Caching，不加 `cross_version_cache`。
  `custom-worker.ts` 只允许 `GET/HEAD /media/*` 且响应为 `200`、`image/*`、无
  `Set-Cookie` 的结果保留原 Cache-Control；其余动态 Worker 响应改为 `no-store`。
  `/_next/static/*` 仍由 Static Assets 服务，不靠这层出口。区级 purge 清不掉
  Workers Caching。`open-next.config.ts` 使用 `defineCloudflareConfig({})`，增量缓存
  是 dummy，没有 R2 incremental cache。
- `MEDIA_BUCKET`：R2 桶 `solidays-media`，当前为远程绑定。
- `AI`：Workers AI 远程绑定，当前配置已预留；代码中暂未接入具体模型调用。
- `IMAGES`：Cloudflare Images Binding，负责从 R2 原图生成 FNDS 卡片图片变体；原图
  仍保存在 `MEDIA_BUCKET`，不迁移到 Images 存储。
- Observability：已启用。
- `CHAT_DB`：独立 D1 `solidays-chat`，database ID 已写入 `wrangler.jsonc`；远程已应用
  `migrations/0001_chat.sql`，`migrations/0002_chat_quotas.sql` 已在本地应用，生产
  部署前由 CI 迁移。
- `CHAT_RATE_LIMITER`：Workers Rate Limiting binding，匿名留言、结束留言和历史读取
  均按可信 IP/已验证访客 Cookie 限制为每 60 秒 10 次。
- `TURNSTILE_SECRET_KEY`：已写入 `solidays-worker` 的 Worker Secret；正式 Turnstile
  widget `solidays-chat-turnstile` 为 Invisible，已覆盖 `solidays.win`、`localhost`、
  `127.0.0.1`，前端公开 Site Key 通过版本化的 `.env.production` 注入生产构建；
  Site Key 本身是公开值，真正的 Secret 仍只放在 Worker Secret 或本地未提交的
  `.dev.vars` 中。

## Worker 命令

```bash
node .yarn/releases/yarn-3.6.1.cjs worker:build
node .yarn/releases/yarn-3.6.1.cjs worker:dev
node .yarn/releases/yarn-3.6.1.cjs worker:deploy
```

首次绑定资源或修改 `wrangler.jsonc` 后先用 `wrangler deploy --dry-run` 检查配置；
真正部署前需要登录 Cloudflare，并确认 R2/D1 的生产资源名称和权限。当前机器的
Wrangler OAuth 凭据保存在 macOS 钥匙串。

## 存储规划

- Worker 的 AI、R2 和未来 D1 绑定属于同一个部署单元，不需要把生产图片或结构化
  数据继续放进 Git 仓库。
- `/fnds` 使用的 7 个图片对象已上传到 `solidays-media/fnds/`；About 页头像已上传到
  `solidays-media/profile/avatar.jpg`。
- 已创建独立 D1 `solidays-chat`，只承载匿名留言 V1；没有把卡片数据混入留言库。
- `/fnds` 的图片优先使用 `NEXT_PUBLIC_R2_PUBLIC_URL`；当前本地配置和生产 Worker 都
  通过 `/media/<key>` 读取 R2。
- `/api/cards` 当前返回 `data/cards.ts` 中的最小默认数据，是将来接入 D1 的明确入口。

## 结构化数据接入 D1（未来）

当前 `CHAT_DB` 只用于聊天，不要直接把首页卡片数据写入 `solidays-chat`。如果以后
要把卡片等结构化内容迁移到 D1，先确认数据归属并写 migration，再增加独立绑定，例如：

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

接入顺序建议：先写 migration，再把 `/api/cards` 的默认数组替换为 D1 查询，确认线上
读取稳定后再删除 `data/cards.ts` 中不再需要的回退数据。数据库连接和绑定不放在
`NEXT_PUBLIC_*` 变量中。
