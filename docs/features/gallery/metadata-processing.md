# Gallery 页面元数据处理方案

> 建立于 2026-08-17。状态：方案已确认，页面与转码尚未实施。
> 本文只约定源片处理、Web 成品、R2 key 和 Gallery 元数据；不覆盖页面 UI。
> 首批素材是 `xbox录屏精选` 的 82 个 Xbox 短片。后续手机拍摄可走同一套结构。

## 1. 目标与范围

**做**：

- 原片永久保留，不覆盖、不回写。
- 为网站生成一份 Web 优化版：H.264 + AAC + faststart MP4，以及一张 poster。
- 按码率决定 remux 还是重新编码，不把 82 个文件一律压成固定码率。
- 展示名称与存储 key 分离；key 用 ASCII slug，标题写在元数据里。
- 元数据一次写好，游戏短片和以后的手机视频共用同一类型。

**不做**：

- 不上 Cloudflare Stream，不做 HLS / DASH / 多码率自适应。
- 不把原片或成品放进 Git。
- 不为了 metadata 好看强制 CFR 60fps。
- 不因为颜色字段为空就批量写入 BT.709。
- 不在未做 A/B 前批量转 82 个文件。

## 2. 为什么用 R2 + 一次性 Web 版，不用 Stream

这批素材的上限只有 87 秒，绝大多数是 30–60 秒。它们适合：

```text
短 MP4 + R2 + Cloudflare Cache + HTML5 <video>
```

理由：

- 编解码已经统一：H.264 Main + AAC-LC + yuv420p，浏览器原生可播。
- 单文件体积远低于 Cloudflare Cache 的 512 MB 上限（Free / Pro / Business）。
- 没有一小时长片，不需要自适应码率打包。
- Stream 会多一层转码、播放器和计费，对这批短片没有对应收益。

生产分发走 R2 custom domain，例如 `media.solidays.win`，不要用 `*.r2.dev`。
`r2.dev` 是开发入口，可能被限流；custom domain 才能稳定使用 Cache / WAF。

当前站点图片仍走私有桶 + `/media/<key>`。视频不要默认复用这条 Worker 读通路：

- `app/media/[...key]/route.ts` 现在只放行 `fnds/`、`profile/`，且 key 只能是 ASCII。
- `custom-worker.ts` 只把 `/media/*` 的 `image/*` 响应交给 Workers Caching；
  非图片会被改成 `no-store`。
- 100 MB 级 MP4 经 Worker 读出会浪费 CPU，也拿不到现成的 CDN 文件缓存。

因此 Gallery 视频的生产路径是 **R2 custom domain 直出**；`/media` 继续只服务现有私有图片。

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
Xbox / 手机原片
      │  永久保留，不改
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
R2 Web 成品
  gallery/gaming/<id>.mp4
  gallery/gaming/<id>.webp
```

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

R2 key:
gallery/gaming/rainbow-six-siege-20221208-071037.mp4
gallery/gaming/rainbow-six-siege-20221208-071037.webp
```

R2 没有真正的文件夹；`gallery/gaming/...` 只是扁平 object key 的前缀。

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
    video: '/gallery/gaming/atomic-heart-20230226-064348.mp4',
    poster: '/gallery/gaming/atomic-heart-20230226-064348.webp',
    width: 1920,
    height: 1080,
    duration: 59.4,
  },
]
```

约定：

- `video` / `poster` 写相对 `media.solidays.win` 的路径，页面里再拼成绝对 URL。
- `duration` 用秒，保留一位小数，取处理后文件的真实时长。
- `width` / `height` 取处理后文件，不写死后再和片子不一致。
- `title` 给 Gallery 卡片看；`game` 留给筛选。手机视频可以没有 `game`。
- 处理方式（remux / transcode）只留在本地决策表和处理报告里，不进页面数据。

### 5.4 域名与引用

```text
https://media.solidays.win/gallery/gaming/<id>.mp4
https://media.solidays.win/gallery/gaming/<id>.webp
```

上传用 Wrangler，key 必须和 `data/gallery.ts` 一致：

```bash
wrangler r2 object put solidays-media/gallery/gaming/<id>.mp4 --file ./<id>.mp4
wrangler r2 object put solidays-media/gallery/gaming/<id>.webp --file ./<id>.webp
```

自定义域名未接好之前，不要用 `r2.dev` 写进页面。

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

1. **本文确认后**，先对第 4.3 节三个样本做 CRF 20 / 21 / 22 A/B，锁参数。
2. 按第 6 节决策表批量产出 Web MP4 + poster，并生成 `data/gallery.ts` 初稿。
3. 给 `solidays-media` 接上生产 custom domain `media.solidays.win`（Wrangler / 区 DNS，不走 Dashboard 手工点）。
4. 上传 `gallery/gaming/*`，核对 key 与元数据一致。
5. 再做 Gallery 页面。页面方案另开文档；元数据契约以本文第 5.3 节为准。

A/B 或批量转码改变 CRF / maxrate 之后，回写本节和第 4.2 节的实际采用值。
