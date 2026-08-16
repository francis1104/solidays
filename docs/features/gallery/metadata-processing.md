# Gallery 页面元数据处理方案

> 建立于 2026-08-17。状态：已评审（2026-08-17），**Approved — implementation ready**。
> 可进入第 4.3 节 A/B 与 `solidays-gallery` 建桶。新桶、域名、A/B 和页面均未实施。
> 评审记录见第 9 节。
> 本文只约定源片处理、Web 成品、R2 发布和 Gallery 元数据；不覆盖页面 UI。
> 首批素材是 `xbox录屏精选` 的 82 个 Xbox 短片。

## 1. 目标与范围

**做**：

- 原片永久保留，不覆盖、不回写。
- 为网站生成一份 Web 优化版：H.264 + AAC + faststart MP4，以及一张 poster。
- 按码率决定 remux 还是重新编码，不把 82 个文件一律压成固定码率。
- 展示名称与存储 key 分离；key 用 ASCII slug，标题写在元数据里。
- 页面数据共用 `GalleryItem` 契约；Xbox 处理流水线只服务本批游戏录屏。
- 新建独立公开桶承载 Gallery 成品；`solidays-media` 保持私有，边界不变。

**不做**：

- 不上 Cloudflare Stream，不做 HLS / DASH / 多码率自适应。
- 不把原片或成品放进 Git。
- 不为了 metadata 好看强制 CFR 60fps。
- 不因为颜色字段为空就批量写入 BT.709。
- 不在未做 A/B 前批量转 82 个文件。
- 不给 `solidays-media` 接 custom domain，也不把 Gallery 对象写入该桶。
- 不默认把 Xbox 转码判断表套到以后的手机视频上。

## 2. 发布架构

这批素材最长 87 秒，绝大多数 30–60 秒，适合：

```text
短 MP4 + 独立公开 R2 + custom domain Cache + HTML5 <video>
```

不上 Stream：编解码已经统一（H.264 Main + AAC-LC + yuv420p），没有长片，不需要自适应码率；Stream 多一层转码、播放器和计费，没有对应收益。单文件也远低于 Cloudflare Cache 在 Free / Pro / Business 上的 512 MB 上限。`.mp4` / `.webp` 属于默认可缓存扩展名。

### 2.1 两个桶，两条边界

| 桶 | 角色 | 访问 | 对象 |
| --- | --- | --- | --- |
| `solidays-media` | 现有私有媒体 | Worker `MEDIA_BUCKET` → `/media/<key>`，只放行 `fnds/`、`profile/` | FNDS 原图、头像 |
| `solidays-gallery` | **新建**公开 Gallery 成品 | 只绑 `media.solidays.win`，不绑 Worker | `gaming/<id>.mp4`、`gaming/<id>.webp` |

R2 桶接上 custom domain 后，该桶内对象都可通过这个域名公开读取。若把 `media.solidays.win` 接到 `solidays-media`，现有 `fnds/*`、`profile/*` 只要知道 key 就能绕过 `/media` Worker。这是一次安全边界变化，本文不采用。

因此：

- `solidays-media` 维持现状：私有、只经 Worker、不接自定义域名、不启用 `r2.dev`。
- `solidays-gallery` 是唯一公开桶。`media.solidays.win` **只**绑这个桶。
- Worker **不**增加 Gallery 桶绑定。成品用 Wrangler CLI 上传，页面用绝对 URL 直读自定义域名，不经过 OpenNext / `/media`。
- 生产不用 `*.r2.dev`。`r2.dev` 是开发入口，会限流，也没有 Cache / WAF。这个新桶默认也不启用 Public Development URL。
- Gallery 公开基址写在 `lib/gallery.ts` 常量里，值为 `https://media.solidays.win`。不要复用 `NEXT_PUBLIC_R2_PUBLIC_URL`，也不要为此再加一条 `NEXT_PUBLIC_*`。生产域名已经固定，常量少一个构建配置点。

### 2.2 为什么不走 `/media`

结论仍然是 custom domain 直出，但理由不是「100 MB 会按体积浪费 Worker CPU」。Cloudflare 的 CPU time 只统计实际执行 Worker JS 的时间，等待 R2 / 网络 I/O 不计入。

真正成立的理由是：

- 走 `/media` 会多经过 OpenNext 和一次 Worker invocation。
- `custom-worker.ts` 只允许 `GET/HEAD /media/*` 且响应为 `200`、`image/*`、无 `Set-Cookie` 时保留 Cache-Control；视频会被改成 `no-store`。
- custom domain 让对象走 R2 自己的 CDN 缓存，不依赖这条只为图片设计的出口策略。

### 2.3 创建与绑域（尚未执行）

用 Wrangler 建桶和绑域，不走 Dashboard。`--location wnam` 是 Western North America 的 **Location Hint**，best-effort，不是强制数据驻留；这里用它只是与当前部署地域策略保持一致，不声称对象一定落在同一区域。

```bash
wrangler r2 bucket create solidays-gallery --location wnam
wrangler r2 bucket domain add solidays-gallery \
  --domain media.solidays.win \
  --zone-id <solidays.win 的 zone id>
```

`--zone-id` 在实施时用 `wrangler` 查，不要写进仓库。绑域后确认 DNS CNAME 生效，再用 `wrangler r2 bucket domain list solidays-gallery` 核验。不要对这个桶执行 `wrangler r2 bucket dev-url enable`。

普通 `<video src>` / `<img src>` 跨子域播放不需要 CORS。以后如果要 `crossorigin`、canvas 抽帧或 `fetch` 视频，再给 `https://solidays.win` 配只读 CORS，不提前做。

## 3. 源片盘点（2026-08-17）

本地目录：`/Users/francis/Movies/xbox录屏精选`。82 个 MP4，合计约 9.8 GB，总时长约 75 分钟。

### 3.1 统一的部分

| 项 | 值 |
| --- | --- |
| 容器 | MP4（`mp42` / `mp41isom`） |
| 视频 | H.264 / AVC，Main Profile，yuv420p，逐行 |
| 音频 | AAC-LC，立体声，48 kHz，约 157 kbps |
| 流结构 | 1 路视频 + 1 路音频，无字幕 |
| Encoder | `AVC Coding`（Xbox 录屏） |
| 原子顺序 | 全部 `ftyp → uuid → mdat → moov` |
| 颜色元数据 | `color_space` / `primaries` / `transfer` 全空 |

### 3.2 不统一、但接受的部分

| 项 | 现状 |
| --- | --- |
| 分辨率 | 81 × 1920×1080（Level 4.2）；1 × 1280×720（Level 3.1） |
| 声明帧率 | 多为 60 或 59.94；少数声明 44 / 54 / 55 / 57 / 58 / 120 |
| 实际平均帧率 | 几乎都在 51–59 fps，没有真 120fps |
| 时长 | 66 条约 1 分钟；10 条约 30 秒；2 条短于 20 秒 |
| 容器码率 | 7.7–31.5 Mbps，平均 17.3 Mbps |
| B 帧 | 76 个 `has_b_frames=1`；6 个为 16 |

720p 那条是 `Tom Clancy's Rainbow Six Siege-2022_12_08-07_10_37.mp4`，也是唯一超过 1 分钟的片子。保持 720p，不放大到 1080p。

### 3.3 关于 moov 和 Range

`moov` 全部在文件末尾。HTTP Range 可以先读尾部索引再取媒体区间，R2 和 Cloudflare Cache 都支持客户端 Range，因此**不是**“必须下完整文件才能播”。

即便如此，这批片子约 100 MB，先跳到文件尾再回来仍然多一次往返。上传前一律做 faststart，让浏览器从文件头就能读到索引。

## 4. 处理规范

原片与 Web 成品分开存放。原片只读。

```text
Xbox 原片（本批；只读）
      │
      ▼
  处理脚本扫描元数据
      │
      ├── 容器码率 ≤ 12 Mbps
      │      → remux：-c copy -movflags +faststart
      │
      └── 容器码率 > 12 Mbps
             → transcode：H.264 CRF + maxrate + AAC + faststart
             （先 A/B，再批量）
      ▼
solidays-gallery（公开桶）
  gaming/<id>.mp4
  gaming/<id>.webp
```

这张分流图只适用于已盘点的 Xbox H.264 Main + AAC SDR 短片。手机视频见第 5.3 节。

### 4.1 remux

已经落在网页目标码率附近的文件，只搬 `moov`，不重编码：

```bash
ffmpeg -i input.mp4 \
  -c copy \
  -movflags +faststart \
  output.mp4
```

本批只有 2 个文件走这条路径，见第 6 节。

### 4.2 transcode

游戏画面是 1080p、接近 60fps、高运动、粒子/草地/烟雾多，H.264 不好压。不要把全部文件固定成 6–8 Mbps。

质量目标：大多数片段看起来接近 **8–12 Mbps** 的观感。用 CRF 控质量，用 `maxrate` 卡住峰值：

```bash
ffmpeg -i input.mp4 \
  -c:v libx264 \
  -preset slow \
  -crf 21 \
  -maxrate 12M \
  -bufsize 24M \
  -c:a aac \
  -b:a 160k \
  -movflags +faststart \
  output.mp4
```

含义：

- `-crf 21`：按视觉质量编码，不锁死平均码率。
- `-maxrate 12M -bufsize 24M`：高运动场面不要再冲回 20–30 Mbps。
- 不写 `-r 60`，不写 `-vsync cfr`。保留源片时间戳。
- 不补颜色 metadata。

### 4.3 批量前必须先做 A/B

不要一上来转 82 个。先拿三类各一条，分别试 CRF 20 / 21 / 22，在 Gallery 实际展示尺寸下看方块、糊草地、烟雾色带：

| 类型 | 建议样本 | 原容器码率 | 理由 |
| --- | --- | --- | --- |
| 相对静态 | `女神异闻录５ 皇家版-2022_11_12-16_43_07.mp4` | 9.3 Mbps | 本批唯一 1080p remux 候选 |
| 高运动 | `Atomic Heart-2023_02_28-12_35_15.mp4` | 30.5 Mbps | 动作、转镜、高码率峰值 |
| 粒子 / 爆炸 | `RESIDENT EVIL 3-2025_07_09-13-18-58.mp4` | 30.1 Mbps | 雾、粒子、快速切镜 |

肉眼对比顺序：Xbox 原片 → 本机播放器 → 浏览器播放转码结果。确认黑位正常、没有明显发灰、没有 HDR→SDR 错觉后，再锁 CRF 批量。

### 4.4 明确不处理的偏差

**不要强制 CFR 60fps。** 声明帧率乱，实际平均帧率在 51–59。把 54fps 补成 60fps 只是插帧：画质不增加，体积可能变大。除非某个浏览器出现明显 timing 问题，否则保持原时间关系。

**不要批量写颜色标签。** 字段为空值得记进处理报告，但这些是 Xbox SDR、H.264 Main、yuv420p，不像手机 HDR / Dolby Vision 那样容易踩颜色管理。没有播放证据前不动。

**不要统一分辨率。** 那条 720p 保持 720p。

### 4.5 poster

每个视频出一张同 id 的 WebP，供 Gallery 封面和 `<video poster>`：

```bash
ffmpeg -ss 1 -i output.mp4 -frames:v 1 -c:v libwebp -quality 80 poster.webp
```

片头若是黑场或 Xbox UI，把 `-ss` 调到 1–3 秒之间能看清内容的一帧。poster 跟视频一起上传，不进 Git。

## 5. 存储 key 与元数据

### 5.1 展示名和 key 分开

R2 能存中文 key，这不是限制。麻烦的是 URL、代码引用、CLI 和以后手工管理。因此：

```text
原文件:
Tom Clancy's Rainbow Six Siege-2022_12_08-07_10_37.mp4

R2 key（桶 `solidays-gallery`）:
gaming/rainbow-six-siege-20221208-071037.mp4
gaming/rainbow-six-siege-20221208-071037.webp
```

R2 没有真正的文件夹；`gaming/...` 只是扁平 object key 的前缀。桶本身已经把 Gallery 和私有媒体隔开，key 里不必再重复 `gallery/`。

### 5.2 id 规则

```text
<game-slug>-<YYYYMMDD>-<HHmmss>
```

游戏 slug 用英文小写连字符。时间取自 Xbox 文件名，不取文件系统 mtime。Rainbow Six 新旧文件名都映射到同一个 slug `rainbow-six-siege`。

首批游戏 slug：

| Xbox 文件名前缀 | slug | 展示 title |
| --- | --- | --- |
| Atomic Heart | `atomic-heart` | Atomic Heart |
| Baldur's Gate 3 | `baldurs-gate-3` | Baldur's Gate 3 |
| Call of Duty® | `call-of-duty` | Call of Duty |
| Hellblade_ Senua's Sacrifice | `hellblade-senuas-sacrifice` | Hellblade: Senua's Sacrifice |
| Hi-Fi RUSH | `hi-fi-rush` | Hi-Fi RUSH |
| JOJO的奇妙冒险 群星之战 重制版 | `jojo-all-star-battle-r` | JoJo's Bizarre Adventure: All-Star Battle R |
| Monster Train 2 | `monster-train-2` | Monster Train 2 |
| RESIDENT EVIL 2 | `resident-evil-2` | Resident Evil 2 |
| RESIDENT EVIL 3 | `resident-evil-3` | Resident Evil 3 |
| Street Fighter 6 | `street-fighter-6` | Street Fighter 6 |
| Superliminal | `superliminal` | Superliminal |
| THE FINALS | `the-finals` | THE FINALS |
| Tom Clancy's Rainbow Six Siege | `rainbow-six-siege` | Rainbow Six Siege |
| Tom Clancy's Rainbow Six® Siege | `rainbow-six-siege` | Rainbow Six Siege |
| Yakuza 0 | `yakuza-0` | Yakuza 0 |
| 《战地风云™ 2042》Xbox Series X_S | `battlefield-2042` | Battlefield 2042 |
| 《極惡戰線》：Closed Beta | `evil-west` | Evil West |
| 光与影：33号远征队 | `clair-obscur-expedition-33` | Clair Obscur: Expedition 33 |
| 双人成行 | `it-takes-two` | It Takes Two |
| 双影奇境 | `split-fiction` | Split Fiction |
| 女神异闻录３ Reload | `persona-3-reload` | Persona 3 Reload |
| 女神异闻录５ 皇家版 | `persona-5-royal` | Persona 5 Royal |
| 猛兽派对 | `party-animals` | Party Animals |
| 精灵与萤火意志 | `ori-and-the-will-of-the-wisps` | Ori and the Will of the Wisps |

### 5.3 Gallery 条目类型

页面数据放 `data/gallery.ts`，和 `data/cards.ts` 一样是静态源，不进 D1。

```ts
export type GalleryItemType = 'gaming' | 'phone'

// `phone` 只表示可以进入同一份数组。phone 源片必须先重新做
// codec / color / rotation / frame-timing intake，再单独决定
// Web 转码参数；不默认复用 Xbox 的决策表或 CRF/maxrate。

export type GalleryItem = {
  id: string
  type: GalleryItemType
  title: string
  game?: string
  recordedAt: string
  video: string
  poster: string
  width: number
  height: number
  duration: number
}

export const galleryItems: GalleryItem[] = [
  {
    id: 'atomic-heart-20230226-064348',
    type: 'gaming',
    title: 'Atomic Heart',
    game: 'Atomic Heart',
    recordedAt: '2023-02-26',
    video: '/gaming/atomic-heart-20230226-064348.mp4',
    poster: '/gaming/atomic-heart-20230226-064348.webp',
    width: 1920,
    height: 1080,
    duration: 59.4,
  },
]
```

约定：

- `video` / `poster` 写相对路径（`/gaming/<id>.mp4`）。页面用 `lib/gallery.ts` 的常量
  `GALLERY_BASE_URL = 'https://media.solidays.win'` 拼绝对 URL。不要引入
  `NEXT_PUBLIC_GALLERY_BASE_URL`：本仓库先 `opennextjs-cloudflare build` 再
  `wrangler deploy`，`NEXT_PUBLIC_*` 在 Next/OpenNext 构建时被 inline 进浏览器
  bundle，事后改 `wrangler.jsonc` `vars` 不会生效。域名已经固定，常量更合适。
- `duration` 用秒，保留一位小数，取处理后文件的真实时长。
- `width` / `height` 取处理后文件，不写死后再和片子不一致。
- `title` 给 Gallery 卡片看；`game` 留给筛选。手机视频可以没有 `game`。
- 处理方式（remux / transcode）只留在本地决策表和处理报告里，不进页面数据。
- `type: 'phone'` 只复用这份数据契约。未来 phone 素材先重新做 codec / color / rotation / frame-timing intake，再决定 Web 转码参数；不默认复用第 4、6 节的 Xbox 流水线和决策表。

### 5.4 上传契约（HTTP metadata + write-once）

```text
https://media.solidays.win/gaming/<id>.mp4
https://media.solidays.win/gaming/<id>.webp
```

上传写到 `solidays-gallery`，并显式带上 MIME 和 Cache-Control。长期缓存行为不能留给平台默认值。

Wrangler 的 `r2 object` 只有 `get` / `put` / `delete`，没有 object list；`get` 会下载整段视频，不能当存在性探测。更关键的是「先检查再 put」是 check-then-write，并发时两个进程都可能判定不存在然后都写入。因此 **write-once 必须落在存储层**：用 R2 的 S3 兼容 API 做条件 `PutObject`，带 `If-None-Match: *`。对象已存在则返回 `412 Precondition Failed`，请求失败，不覆盖。

HTTP metadata 仍要写上。上传脚本走 R2 S3 兼容 endpoint。凭证使用 R2 S3 API credentials（Access Key ID / Secret Access Key，由 R2 API Token 生成），仅从本地环境变量或凭证存储读取，不进仓库、不进命令历史。每个对象一次条件 PUT：

| 对象 | Key | `Content-Type` | `Cache-Control` | 条件头 |
| --- | --- | --- | --- | --- |
| 视频 | `gaming/<id>.mp4` | `video/mp4` | `public, max-age=31536000, immutable` | `If-None-Match: *` |
| poster | `gaming/<id>.webp` | `image/webp` | `public, max-age=31536000, immutable` | `If-None-Match: *` |

已存在 → `412 Precondition Failed`，脚本失败退出。使用 AWS SDK for JavaScript v3 的 `PutObjectCommand.IfNoneMatch: '*'`，无需先 HEAD/GET，也无需自定义 middleware 手工注入条件头：

```ts
new PutObjectCommand({
  Bucket: 'solidays-gallery',
  Key: key,
  Body: body,
  ContentType: 'video/mp4',
  CacheControl: 'public, max-age=31536000, immutable',
  IfNoneMatch: '*',
})
```

写上传脚本时把 `@aws-sdk/client-s3` 加为 **devDependency**，只属于开发/媒体处理工具链，不进网站运行时依赖。S3Client 配置 `accessKeyId` / `secretAccessKey`（由 R2 API Token 生成），从本地环境变量（如 `AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`）或凭证存储读取，不把 Cloudflare API token 字符串直接塞进 SDK，也不进仓库。

不要用 `wrangler r2 object put` 做首次发布。它没有条件写入，会静默覆盖。该命令只适合对照 MIME / Cache-Control 字段，或在已经决定覆盖并准备 purge 的例外路径。

其余约定：

- 重转码换新 key，例如 `gaming/<id>-v2.mp4`，并改 `data/gallery.ts` 的 `video` / `poster`。旧对象可保留，或确认新 URL 可播后再删。
- 只有必须复用同一 URL 时才覆盖同 key：此时去掉 `If-None-Match`，覆盖后必须按 URL purge `media.solidays.win` 上对应对象。未 purge 前，客户端可能一直拿到旧的 `immutable` 副本。
- 自定义域名未接好、未写入 `data/gallery.ts` 之前，不要上传，也不要把 `r2.dev` 写进页面。

## 6. 转码决策表

规则（按容器码率，含音频约 0.16 Mbps）：

| 容器码率 | 动作强度 | 处理 |
| --- | --- | --- |
| ≤ 12 Mbps | medium | remux（copy + faststart） |
| 12–20 Mbps | typical | transcode（先 A/B，再批量） |
| > 20 Mbps | high | transcode |

实测结果：**remux 2，transcode 80**。先前举例里的「8 Mbps 只 remux」仍然成立，但这批 Xbox 原片平均 17.3 Mbps，绝大多数都超过 12 Mbps 上限。不是「必须全压」，是这批素材恰好几乎都该压。

码率是容器平均码率，单位 Mbps；时长秒；fps 是实际平均帧率，不是声明值。

| 处理 | Mbps | 秒 | 分辨率 | fps | id | 原文件 |
| --- | ---: | ---: | --- | ---: | --- | --- |
| transcode | 19.0 | 59.4 | 1920×1080 | 59.0 | `atomic-heart-20230226-064348` | Atomic Heart-2023_02_26-06_43_48.mp4 |
| transcode | 30.5 | 59.1 | 1920×1080 | 59.0 | `atomic-heart-20230228-123515` | Atomic Heart-2023_02_28-12_35_15.mp4 |
| transcode | 18.7 | 59.9 | 1920×1080 | 56.8 | `atomic-heart-20230228-132237` | Atomic Heart-2023_02_28-13_22_37.mp4 |
| transcode | 17.6 | 59.3 | 1920×1080 | 58.9 | `atomic-heart-20230301-113928` | Atomic Heart-2023_03_01-11_39_28.mp4 |
| transcode | 16.9 | 59.7 | 1920×1080 | 58.5 | `baldurs-gate-3-20231215-152600` | Baldur's Gate 3-2023_12_15-15-26-00.mp4 |
| transcode | 18.4 | 59.6 | 1920×1080 | 58.7 | `baldurs-gate-3-20231216-112915` | Baldur's Gate 3-2023_12_16-11-29-15.mp4 |
| transcode | 15.3 | 59.7 | 1920×1080 | 57.9 | `baldurs-gate-3-20231217-125648` | Baldur's Gate 3-2023_12_17-12-56-48.mp4 |
| transcode | 16.0 | 60.0 | 1920×1080 | 53.8 | `baldurs-gate-3-20240127-122408` | Baldur's Gate 3-2024_01_27-12-24-08.mp4 |
| transcode | 18.5 | 59.7 | 1920×1080 | 57.7 | `call-of-duty-20241120-122512` | Call of Duty®-2024_11_20-12-25-12.mp4 |
| transcode | 19.0 | 59.2 | 1920×1080 | 57.5 | `call-of-duty-20241130-050326` | Call of Duty®-2024_11_30-05-03-26.mp4 |
| transcode | 17.6 | 59.9 | 1920×1080 | 59.0 | `hellblade-senuas-sacrifice-20230323-115648` | Hellblade_ Senua's Sacrifice-2023_03_23-11_56_48.mp4 |
| transcode | 16.8 | 59.2 | 1920×1080 | 59.0 | `hi-fi-rush-20230312-044718` | Hi-Fi RUSH-2023_03_12-04_47_18.mp4 |
| transcode | 17.6 | 59.6 | 1920×1080 | 58.8 | `jojo-all-star-battle-r-20230201-133331` | JOJO的奇妙冒险 群星之战 重制版-2023_02_01-13_33_31.mp4 |
| transcode | 17.7 | 60.0 | 1920×1080 | 59.0 | `monster-train-2-20250602-095200` | Monster Train 2-2025_06_02-09-52-00.mp4 |
| transcode | 15.7 | 59.4 | 1920×1080 | 57.2 | `resident-evil-2-20240922-091917` | RESIDENT EVIL 2-2024_09_22-09-19-17.mp4 |
| transcode | 15.6 | 59.0 | 1920×1080 | 51.0 | `resident-evil-2-20240928-074711` | RESIDENT EVIL 2-2024_09_28-07-47-11.mp4 |
| transcode | 30.1 | 54.3 | 1920×1080 | 58.8 | `resident-evil-3-20250709-131858` | RESIDENT EVIL 3-2025_07_09-13-18-58.mp4 |
| transcode | 16.3 | 59.5 | 1920×1080 | 55.8 | `resident-evil-3-20250709-132200` | RESIDENT EVIL 3-2025_07_09-13-22-00.mp4 |
| transcode | 18.0 | 59.4 | 1920×1080 | 59.0 | `resident-evil-3-20250719-104612` | RESIDENT EVIL 3-2025_07_19-10-46-12.mp4 |
| transcode | 19.5 | 59.6 | 1920×1080 | 59.0 | `street-fighter-6-20230821-123555` | Street Fighter 6-2023_08_21-12_35_55.mp4 |
| transcode | 17.4 | 59.6 | 1920×1080 | 59.0 | `street-fighter-6-20231031-135715` | Street Fighter 6-2023_10_31-13-57-15.mp4 |
| transcode | 17.8 | 60.0 | 1920×1080 | 59.0 | `street-fighter-6-20240713-020300` | Street Fighter 6-2024_07_13-02-03-00.mp4 |
| transcode | 17.5 | 59.7 | 1920×1080 | 59.0 | `street-fighter-6-20240714-024928` | Street Fighter 6-2024_07_14-02-49-28.mp4 |
| transcode | 18.6 | 59.2 | 1920×1080 | 59.0 | `street-fighter-6-20240806-130911` | Street Fighter 6-2024_08_06-13-09-11.mp4 |
| transcode | 18.6 | 60.0 | 1920×1080 | 58.9 | `street-fighter-6-20240817-014503` | Street Fighter 6-2024_08_17-01-45-03.mp4 |
| transcode | 18.1 | 59.2 | 1920×1080 | 59.0 | `street-fighter-6-20250315-041842` | Street Fighter 6-2025_03_15-04-18-42.mp4 |
| transcode | 18.4 | 60.1 | 1920×1080 | 59.0 | `street-fighter-6-20250522-124819` | Street Fighter 6-2025_05_22-12-48-19.mp4 |
| transcode | 17.9 | 59.6 | 1920×1080 | 58.9 | `street-fighter-6-20250601-121210` | Street Fighter 6-2025_06_01-12-12-10.mp4 |
| transcode | 18.8 | 59.8 | 1920×1080 | 59.0 | `street-fighter-6-20250601-124326` | Street Fighter 6-2025_06_01-12-43-26.mp4 |
| transcode | 17.3 | 59.6 | 1920×1080 | 59.0 | `street-fighter-6-20250628-134850` | Street Fighter 6-2025_06_28-13-48-50.mp4 |
| transcode | 19.7 | 59.1 | 1920×1080 | 59.0 | `street-fighter-6-20250708-150434` | Street Fighter 6-2025_07_08-15-04-34.mp4 |
| transcode | 17.4 | 59.3 | 1920×1080 | 58.0 | `superliminal-20221222-085858` | Superliminal-2022_12_22-08_58_58.mp4 |
| transcode | 16.5 | 59.8 | 1920×1080 | 59.0 | `superliminal-20221222-093137` | Superliminal-2022_12_22-09_31_37.mp4 |
| transcode | 18.0 | 59.6 | 1920×1080 | 59.0 | `the-finals-20231209-132933` | THE FINALS-2023_12_09-13-29-33.mp4 |
| transcode | 17.8 | 59.7 | 1920×1080 | 59.0 | `the-finals-20231210-005723` | THE FINALS-2023_12_10-00-57-23.mp4 |
| transcode | 17.6 | 60.0 | 1920×1080 | 59.0 | `the-finals-20231213-143719` | THE FINALS-2023_12_13-14-37-19.mp4 |
| transcode | 17.8 | 59.6 | 1920×1080 | 59.0 | `the-finals-20231213-145125` | THE FINALS-2023_12_13-14-51-25.mp4 |
| transcode | 19.0 | 6.2 | 1920×1080 | 59.0 | `the-finals-20231223-060254` | THE FINALS-2023_12_23-06_02_54.mp4 |
| transcode | 18.5 | 59.9 | 1920×1080 | 59.0 | `the-finals-20231230-125718` | THE FINALS-2023_12_30-12-57-18.mp4 |
| remux | 8.8 | 87.3 | 1280×720 | 58.9 | `rainbow-six-siege-20221208-071037` | Tom Clancy's Rainbow Six Siege-2022_12_08-07_10_37.mp4 |
| transcode | 30.2 | 56.7 | 1920×1080 | 59.0 | `rainbow-six-siege-20230708-030849` | Tom Clancy's Rainbow Six Siege-2023_07_08-03_08_49.mp4 |
| transcode | 17.9 | 59.7 | 1920×1080 | 59.0 | `rainbow-six-siege-20250620-120734` | Tom Clancy's Rainbow Six® Siege-2025_06_20-12-07-34.mp4 |
| transcode | 19.4 | 59.1 | 1920×1080 | 59.0 | `rainbow-six-siege-20250626-122220` | Tom Clancy's Rainbow Six® Siege-2025_06_26-12-22-20.mp4 |
| transcode | 30.6 | 54.2 | 1920×1080 | 59.0 | `yakuza-0-20230613-123853` | Yakuza 0-2023_06_13-12_38_53.mp4 |
| transcode | 31.5 | 53.5 | 1920×1080 | 59.0 | `yakuza-0-20230613-135127` | Yakuza 0-2023_06_13-13_51_27.mp4 |
| transcode | 18.3 | 59.0 | 1920×1080 | 59.0 | `yakuza-0-20230701-114059` | Yakuza 0-2023_07_01-11_40_59.mp4 |
| transcode | 19.0 | 59.2 | 1920×1080 | 59.0 | `battlefield-2042-20221213-052935` | 《战地风云™ 2042》Xbox Series X_S-2022_12_13-05_29_35.mp4 |
| transcode | 17.1 | 59.3 | 1920×1080 | 58.8 | `evil-west-20230420-132802` | 《極惡戰線》：Closed Beta-2023_04_20-13_28_02.mp4 |
| transcode | 19.6 | 14.3 | 1920×1080 | 59.0 | `evil-west-20230425-133740` | 《極惡戰線》：Closed Beta-2023_04_25-13_37_40.mp4 |
| transcode | 16.0 | 59.2 | 1920×1080 | 59.0 | `clair-obscur-expedition-33-20250426-012328` | 光与影：33号远征队-2025_04_26-01-23-28.mp4 |
| transcode | 17.4 | 59.2 | 1920×1080 | 58.7 | `clair-obscur-expedition-33-20250426-014248` | 光与影：33号远征队-2025_04_26-01-42-48.mp4 |
| transcode | 18.2 | 29.1 | 1920×1080 | 57.9 | `it-takes-two-20221119-063644` | 双人成行-2022_11_19-06_36_44.mp4 |
| transcode | 18.3 | 29.7 | 1920×1080 | 56.6 | `it-takes-two-20221119-130410` | 双人成行-2022_11_19-13_04_10.mp4 |
| transcode | 19.4 | 29.4 | 1920×1080 | 59.0 | `it-takes-two-20221120-033357` | 双人成行-2022_11_20-03_33_57.mp4 |
| transcode | 17.8 | 29.9 | 1920×1080 | 55.7 | `it-takes-two-20221120-061729` | 双人成行-2022_11_20-06_17_29.mp4 |
| transcode | 17.3 | 29.5 | 1920×1080 | 55.9 | `it-takes-two-20221120-061833` | 双人成行-2022_11_20-06_18_33.mp4 |
| transcode | 17.5 | 30.0 | 1920×1080 | 57.7 | `it-takes-two-20221120-130604` | 双人成行-2022_11_20-13_06_04.mp4 |
| transcode | 17.9 | 59.4 | 1920×1080 | 59.0 | `split-fiction-20250417-133759` | 双影奇境-2025_04_17-13-37-59.mp4 |
| transcode | 17.9 | 57.4 | 1920×1080 | 58.9 | `split-fiction-20250417-143545` | 双影奇境-2025_04_17-14-35-45.mp4 |
| transcode | 18.2 | 59.2 | 1920×1080 | 59.0 | `split-fiction-20250417-143919` | 双影奇境-2025_04_17-14-39-19.mp4 |
| transcode | 18.8 | 59.7 | 1920×1080 | 58.5 | `split-fiction-20250417-144134` | 双影奇境-2025_04_17-14-41-34.mp4 |
| transcode | 18.3 | 59.6 | 1920×1080 | 59.0 | `split-fiction-20250418-155741` | 双影奇境-2025_04_18-15-57-41.mp4 |
| transcode | 18.2 | 59.6 | 1920×1080 | 59.0 | `split-fiction-20250424-125516` | 双影奇境-2025_04_24-12-55-16.mp4 |
| transcode | 19.9 | 58.9 | 1920×1080 | 59.0 | `split-fiction-20250424-135427` | 双影奇境-2025_04_24-13-54-27.mp4 |
| transcode | 19.1 | 58.7 | 1920×1080 | 59.0 | `split-fiction-20250424-141037` | 双影奇境-2025_04_24-14-10-37.mp4 |
| transcode | 16.3 | 59.7 | 1920×1080 | 58.7 | `split-fiction-20250425-134052` | 双影奇境-2025_04_25-13-40-52.mp4 |
| transcode | 19.5 | 59.0 | 1920×1080 | 59.0 | `split-fiction-20250507-132649` | 双影奇境-2025_05_07-13-26-49.mp4 |
| transcode | 17.8 | 59.4 | 1920×1080 | 58.0 | `split-fiction-20250508-123545` | 双影奇境-2025_05_08-12-35-45.mp4 |
| transcode | 17.8 | 59.4 | 1920×1080 | 59.0 | `split-fiction-20250508-130153` | 双影奇境-2025_05_08-13-01-53.mp4 |
| transcode | 15.4 | 59.3 | 1920×1080 | 59.0 | `split-fiction-20250508-130721` | 双影奇境-2025_05_08-13-07-21.mp4 |
| transcode | 20.0 | 59.6 | 1920×1080 | 59.0 | `split-fiction-20250508-134813` | 双影奇境-2025_05_08-13-48-13.mp4 |
| transcode | 17.1 | 59.7 | 1920×1080 | 59.0 | `persona-3-reload-20240331-093019` | 女神异闻录３ Reload-2024_03_31-09-30-19.mp4 |
| transcode | 17.2 | 59.3 | 1920×1080 | 59.0 | `persona-3-reload-20240406-050656` | 女神异闻录３ Reload-2024_04_06-05-06-56.mp4 |
| transcode | 16.3 | 59.1 | 1920×1080 | 59.0 | `persona-3-reload-20240707-075903` | 女神异闻录３ Reload-2024_07_07-07-59-03.mp4 |
| transcode | 14.6 | 29.1 | 1920×1080 | 59.0 | `persona-5-royal-20221111-162441` | 女神异闻录５ 皇家版-2022_11_11-16_24_41.mp4 |
| transcode | 14.9 | 29.5 | 1920×1080 | 59.0 | `persona-5-royal-20221111-162814` | 女神异闻录５ 皇家版-2022_11_11-16_28_14.mp4 |
| transcode | 15.3 | 29.2 | 1920×1080 | 59.0 | `persona-5-royal-20221112-065504` | 女神异闻录５ 皇家版-2022_11_12-06_55_04.mp4 |
| remux | 9.3 | 29.5 | 1920×1080 | 59.0 | `persona-5-royal-20221112-164307` | 女神异闻录５ 皇家版-2022_11_12-16_43_07.mp4 |
| transcode | 17.6 | 59.8 | 1920×1080 | 59.0 | `party-animals-20231013-135006` | 猛兽派对-2023_10_13-13_50_06.mp4 |
| transcode | 16.4 | 59.1 | 1920×1080 | 58.7 | `ori-and-the-will-of-the-wisps-20221223-053656` | 精灵与萤火意志-2022_12_23-05_36_56.mp4 |
| transcode | 16.8 | 59.5 | 1920×1080 | 59.0 | `ori-and-the-will-of-the-wisps-20221224-085132` | 精灵与萤火意志-2022_12_24-08_51_32.mp4 |
| transcode | 19.2 | 59.6 | 1920×1080 | 58.9 | `ori-and-the-will-of-the-wisps-20221224-085609` | 精灵与萤火意志-2022_12_24-08_56_09.mp4 |

> 高码率优先看：Atomic Heart 30.5、RE3 30.1、R6 30.2、Yakuza 0 30.6 / 31.5。

两条短片也进表，不因为短就丢：`the-finals-20231223-060254`（6.2 秒）和 `evil-west-20230425-133740`（14.3 秒）。页面要不要展出，之后做 Gallery UI 时再定。

## 7. 处理报告应记录的字段

本地跑处理脚本时，除了产出 mp4 / webp，再写一份不上线的报告（JSON 即可），方便以后复盘：

```text
source_name
id
decision          remux | transcode
source_width / source_height
source_bitrate_mbps
source_avg_fps
source_r_frame_rate
source_duration
source_has_b_frames
source_color_space / primaries / transfer   （本批全空，只记录）
source_moov_position                        （本批全在文件尾）
output_bitrate_mbps
output_duration
output_faststart                            必须为 true
crf                                         remux 则为空
```

报告不进仓库。页面只消费 `data/gallery.ts`。

## 8. 实施顺序

1. 对第 4.3 节三个样本做 CRF 20 / 21 / 22 A/B，锁参数。可与建桶并行。
2. 创建 `solidays-gallery`（`--location wnam` hint），**不要**启用 `r2.dev`。
3. 用 Wrangler 把 `media.solidays.win` 接到 **新桶**，核验 DNS 与 `domain list`。不要改 `solidays-media`。
4. 按第 6 节决策表批量产出 Web MP4 + poster，生成 `data/gallery.ts` 初稿。
5. 按第 5.4 节用 S3 条件 `PutObject`（`If-None-Match: *`）带 HTTP metadata 上传；已存在 key 必须 412 失败。核对 URL 与元数据一致。
6. 再做 Gallery 页面。页面方案另开文档；元数据契约以本文第 5.3 节为准。

A/B 或批量转码改变 CRF / maxrate 之后，回写第 4.2 节的实际采用值。

## 9. 评审记录

### 2026-08-17 第一轮：Changes Required

转码方案可保留，要重写的是 R2 发布层。已写进第 2、5、8 节。

| 项 | 初版问题 | 现行约定 |
| --- | --- | --- |
| 必须 | 给 `solidays-media` 挂 `media.solidays.win`，会把 `fnds/*`、`profile/*` 一并公开 | 新建公开桶 `solidays-gallery`；自定义域名只绑新桶；私有桶与 `/media` 白名单不变；Worker 不绑定新桶 |
| 必须 | 上传只有 `--file`，长期缓存依赖默认值 | 条件 `PutObject` 写 `Content-Type` + `Cache-Control: public, max-age=31536000, immutable` |
| 建议 | 「100 MB 经 Worker 浪费 CPU」不准确 | 改为：避开 OpenNext / Worker 路径，并直接使用 R2 custom-domain CDN；现有出口策略只缓存 `image/*` |
| 建议 | 「手机视频共用同一套结构」容易被理解成共用转码流水线 | 只共用 `GalleryItem`；phone 必须重新 intake，不套用 Xbox 决策表 |

### 2026-08-17 第二轮：Approved with minor changes

三处小改已写进正文：条件 `PutObject`、`lib/gallery.ts` 常量、`wnam` 只是 Location Hint。

### 2026-08-17 第三轮：Approved — implementation ready

不阻塞实施。一处准确性已改：条件头用 AWS SDK v3 `PutObjectCommand.IfNoneMatch: '*'`，不需要自定义 middleware。上传脚本落地时再把 `@aws-sdk/client-s3` 加为 devDependency。

初版里应保留的部分未改：82 条 inventory、remux 2 / transcode 80、三类 A/B、不强制 CFR 60、720p 不放大、faststart、原片与 Web 成品分离、key 与展示名分离、`data/gallery.ts` 静态源、生产不用 `r2.dev`。
