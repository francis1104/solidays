# 媒体存储约定（R2）

> 原 AGENTS.md「R2 媒体约定」一节与 `docs/cloudflare-storage.md` 上传部分合并至此
> （2026-08-16）。

## Object key 约定

- FNDs 图片放在 `fnds/` 前缀下。
- 头像放在 `profile/` 前缀下，例如 `profile/avatar.jpg`。
- `/media/[...key]` 只允许 `fnds/` 和 `profile/` 前缀，并拒绝包含 `..` 的路径；
  不要为了绕过 404 放宽路径校验。
- 当前生产站通过 Worker 读取私有 R2 对象，不依赖 `r2.dev` 公共地址。

## 卡片图片变体

- FNDS 卡片通过 `variant=card` 请求 320/480/640 宽度的 WebP 变体，Worker 使用
  Images Binding 从 R2 原图按 `fit=cover` 生成并缓存；不要把原图直接重新写入页面。
- 前端 loader 见 `lib/media-image-loader.ts`，宽度契约在 `lib/media.ts` 的
  `CARD_WIDTHS`。

## 新增图片流程

上传对象时使用与页面代码一致的 key，例如：

```bash
wrangler r2 object put solidays-media/fnds/01-zhi-ming-ri-de-wu.jpg --file ./01.jpg
```

如果配置了 R2 公共域名，把 `NEXT_PUBLIC_R2_PUBLIC_URL` 设置为该域名；否则生产
Worker 会通过 `/media/<key>` 读取私有桶。`app/fnds/page.tsx` 会请求
`fnds/01-zhi-ming-ri-de-wu.jpg` 等 key。

新增图片时，先上传到 R2，再在页面中引用对应 object key；不要把同一批生产图片重新
放回 Git。
