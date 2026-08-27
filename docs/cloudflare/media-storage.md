# 媒体存储约定（R2）

> 原 AGENTS.md「R2 媒体约定」一节与 `docs/cloudflare-storage.md` 上传部分合并至此
> （2026-08-16）。

## Object key 约定

- FNDs 图片放在 `fnds/` 前缀下。
- 头像放在 `profile/` 前缀下，例如 `profile/avatar.jpg`。
- 音频放在 `music/` 前缀下，例如 `music/ge-song.mp3`。
- `/media/[...key]` 允许 `fnds/`、`profile/` 和 `music/` 前缀，并拒绝包含 `..`
  的路径；不要为了绕过 404 放宽路径校验。白名单在 `app/media/[...key]/route.ts`，
  `lib/media.ts` 只做 URL 拼接。
- `music/` 对象按音频 `Content-Type` 返回，并支持浏览器的 `Range` 请求；音频和图片
  都使用版本化/不可变缓存策略。不要给私有媒体桶接公开域名。
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

# 上传首页音乐（对象不进入 Git）
wrangler r2 object put solidays-media/music/ge-song.mp3 --file ./ge-song.mp3 \
  --content-type audio/mpeg
```

如果配置了 R2 公共域名，把 `NEXT_PUBLIC_R2_PUBLIC_URL` 设置为该域名；否则生产
Worker 会通过 `/media/<key>` 读取私有桶。`app/fnds/page.tsx` 会请求
`fnds/01-zhi-ming-ri-de-wu.jpg` 等 key。

首页歌词卡通过 `Card.audioKey` 引用 `solidays-media/music/` 下的音频，播放 URL 由
`privateMediaUrl()` 固定生成同源 `/media/music/<key>`，不受
`NEXT_PUBLIC_R2_PUBLIC_URL` 影响。这可避免本地 Worker 误请求尚未发布的生产
`/media/music/` 路由，也不需要为私有音频开放跨源 CORS。有 R2 音频时不会再请求
过渡期音乐 API。

新增图片时，先上传到 R2，再在页面中引用对应 object key；不要把同一批生产图片重新
放回 Git。

## Gallery 视频

Gallery 成品不进 `solidays-media`。公开桶 `solidays-gallery` 已创建，
`media.solidays.win` 只绑这个桶；现有私有桶和 `/media` 白名单不变，
Worker 不绑定 Gallery 桶。处理规则、上传契约和元数据见
`docs/features/gallery/metadata-processing.md`。`data/gallery.ts` 已按成品写入，
对象在 `https://media.solidays.win/gaming/<id>.mp4`。`/gallery` 页面已上线；
首页入口预览只使用 poster / 480w WebP，不得请求 preview mp4 或原片。
