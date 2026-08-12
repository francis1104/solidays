# Cloudflare 存储规划

这个分支使用 OpenNext 将 Next.js 应用构建成一个 Cloudflare Worker。Worker 的 AI、R2 和 D1
绑定属于同一个部署单元，不需要把图片或结构化数据继续放进 Git 仓库。

## 当前状态

- `wrangler.jsonc` 已经预留并启用了 `AI` 绑定，Workers AI 在本地调试时仍然走远程服务。
- R2 桶 `solidays-media` 已创建，并以 `MEDIA_BUCKET` 绑定到当前 Worker；本地 Worker 调试也会使用这个远程桶。
- D1 尚未创建，也没有直接绑定 D101 的数据库，避免在没有确认资源归属时改动现有 Cloudflare 资源。
- `/fnds` 的图片通过 `NEXT_PUBLIC_R2_PUBLIC_URL` 切换到 R2；未配置时使用现有远程回退地址，因此页面不会因为迁移未完成而失图。
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

然后把 `NEXT_PUBLIC_R2_PUBLIC_URL` 设置为 R2 公共域名或自定义域名。`app/fnds/page.tsx`
会自动请求 `fnds/01-zhi-ming-ri-de-wu.jpg` 等 key。

## 结构化数据接入 D1

确认数据库后，在 `wrangler.jsonc` 增加绑定：

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "solidays-db",
    "database_id": "<真实的 D1 database id>",
    "migrations_dir": "./migrations",
    "remote": true
  }
]
```

接入顺序建议是：先写 migration，再把 `/api/cards` 的默认数组替换为 D1 查询，最后删除
`data/cards.ts` 中不再需要的回退数据。数据库连接不放在 `NEXT_PUBLIC_*` 变量中。

## Worker 命令

```bash
yarn worker:build
yarn worker:dev
yarn worker:deploy
```

首次绑定资源前先用 `wrangler deploy --dry-run` 检查配置；真正部署前需要登录 Cloudflare，
并确认 R2/D1 的生产资源名称和权限。
