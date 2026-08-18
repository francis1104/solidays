# Gallery 页面开发方案

> 目标分支：`cloudflare-worker-DEV`
> 页面定位：个人游戏影像 Archive / Clip Gallery
> 设计版本：对应当前 Figma 中的 `Gallery / Desktop`、`Gallery / Index Hover State`、`Gallery / Lightbox Playback`

---

## 1. 页面目标

Gallery 不做成传统“视频文件列表”或普通瀑布流，而是做成一个偏沉浸式的个人游戏片段档案馆。

核心目标：

1. 让用户第一眼感受到“这是一个私人游戏影像 Archive”，而不是媒体管理后台。
2. 让 80+ 条视频仍然可以快速扫描、筛选和连续浏览。
3. 页面默认只加载 poster，真正视频按需加载，控制 Cloudflare R2 流量和浏览器资源占用。
4. 保持与当前博客视觉体系一致：
   - system-ui 字体
   - 深色主题
   - pink / primary 色作为交互强调
   - 简洁 Header
   - 轻量 Motion
5. 为后续扩展 `phone / travel / life` 等非游戏素材保留结构空间。

---

## 2. 最终页面结构

页面分成三种主要状态：

1. `Gallery / Desktop`
2. `Gallery / Index Hover State`
3. `Gallery / Lightbox Playback`

### 2.1 Gallery / Desktop

主页面结构：

```text
Header

Hero
├─ PERSONAL VIDEO ARCHIVE
├─ GALLERY
├─ Fragments from worlds I have been to.
├─ 82 CLIPS · 2022—2025
├─ Game title list
│  ├─ Atomic Heart
│  ├─ Baldur's Gate 3
│  ├─ THE FINALS
│  └─ Yakuza 0
└─ Large Featured Preview
   ├─ Poster / Preview Video
   ├─ Play
   ├─ Clip number
   ├─ Game name
   └─ Date / Duration

Divider

Archive
├─ ARCHIVE + total count
├─ Year filters
│  ├─ All
│  ├─ 2025
│  ├─ 2024
│  ├─ 2023
│  └─ 2022
├─ Search games
├─ Grid / Index switcher
└─ Gallery Cards
   └─ 3 columns desktop
```

主页面视觉关键词：

- 黑色 / 极深灰背景
- 大尺寸 `GALLERY`
- Hero 左文字、右 Preview
- Preview 保持 16:9
- Archive 卡片规整，不使用 Masonry
- Poster 作为页面主要视觉内容
- 不使用复杂 dashboard border
- 卡片只保留游戏名、日期、时长等必要信息

---

## 3. Hero 交互

### 3.1 默认状态

Hero 左侧显示：

- `PERSONAL VIDEO ARCHIVE`
- `GALLERY`
- tagline
- clip 数量
- 年份跨度
- 4~6 个代表游戏名

右侧显示一个 Featured Preview。

### 3.2 Hover Game Title

桌面端：

```text
hover 游戏名
    ↓
更新右侧 Featured Preview
    ↓
显示对应 poster
    ↓
如果已经生成 preview clip，可延迟播放 muted loop preview
```

例如：

```text
ATOMIC HEART
BALDUR'S GATE 3
THE FINALS
YAKUZA 0
```

hover `ATOMIC HEART` 后，右侧 Preview 切换成 Atomic Heart 对应素材。

### 3.3 Hero Preview 播放策略

第一版建议：

- 默认使用 poster
- 点击 Hero Preview 才进入 Lightbox
- 不直接 autoplay 原始 60 秒视频

第二阶段如果增加专用 preview：

```text
gaming/<id>.mp4
gaming/<id>.webp
gaming/<id>-preview.mp4
```

其中：

- preview 长度：3~5 秒
- muted
- loop
- 480p / 720p
- 低码率
- hover 延迟 150~250ms 后加载

这样可以避免用户鼠标快速扫动时产生大量媒体请求。

---

## 4. Archive Grid

### 4.1 Desktop

桌面：

```text
3 columns
```

中等宽度：

```text
2 columns
```

移动端：

```text
1 column
```

卡片固定为 16:9。

不做 Masonry，原因：

- 当前游戏素材绝大多数为 1920×1080
- 比例统一
- 规整 Grid 更容易快速扫描
- 视频类型内容比照片更适合固定比例

### 4.2 卡片结构

```text
┌─────────────────────────────┐
│                             │
│           POSTER            │
│                             │
│                        0:59 │
└─────────────────────────────┘
Atomic Heart          Feb 26 2023
```

信息：

- poster
- duration
- game / title
- recordedAt

Hover：

- poster scale `1.02 ~ 1.04`
- 中央 Play icon opacity 增强
- duration 保持显示
- 可选轻微暗色 overlay
- 不自动加载完整视频

点击：

```text
open Lightbox
```

---

## 5. Archive 筛选

第一版只做必要功能。

### 5.1 年份

```text
All
2025
2024
2023
2022
```

年份从 `recordedAt` 动态计算，不在 UI 中硬编码。

### 5.2 搜索

输入：

```text
Search games
```

搜索范围：

- `game`
- `title`

大小写不敏感。

### 5.3 排序

默认：

```text
Newest first
```

可在后续增加：

```text
Newest
Oldest
Game
```

首版如果视觉上不想增加额外控件，可以只保留 newest。

---

## 6. Grid / Index 双视图

Gallery 的一个核心交互是支持：

```text
Grid / Index
```

### 6.1 Grid

适合视觉浏览。

```text
poster
poster
poster
...
```

### 6.2 Index

适合快速扫描大量片段。

结构：

```text
NO.   TITLE                 YEAR   DURATION

001   Street Fighter 6      2025   00:59
002   Split Fiction         2025   00:59
003   Resident Evil 3       2025   00:59
004   Atomic Heart          2023   00:59
005   Baldur's Gate 3       2023   00:59
006   THE FINALS            2023   00:30
```

---

## 7. Index Hover Preview

这是当前设计中最重要的创意交互之一。

### 7.1 Desktop

左侧：

```text
clip index
```

右侧：

```text
large preview
```

Hover 某一行：

```text
active row
    ↓
row background highlighted
    ↓
pink active marker
    ↓
右侧 preview 更新
```

右侧 Preview 内容：

- poster / preview video
- play icon
- game initials / decorative clip number
- game name
- date
- duration

### 7.2 Preview 行为

第一版：

- poster only

后续：

- hover 后加载 `preview.mp4`
- muted
- loop
- playsInline
- mouse leave 时停止

### 7.3 Mobile

移动端不实现 hover。

Index 模式在 mobile：

- 点击 row 打开 Lightbox
- 或直接隐藏 Index，仅保留 Grid

推荐第一版：

```text
mobile only Grid
```

---

## 8. Lightbox Playback

点击任何：

- Grid card
- Hero preview
- Index row

都进入同一个 Lightbox。

### 8.1 Layout

```text
STATE 03 / PLAYBACK                  12 / 82    ×

        ←    ┌──────────────────────┐    →
             │                      │
             │        VIDEO         │
             │                      │
             └──────────────────────┘

             STREET FIGHTER 6
             JUL 08 2025 · 00:59 · GAMING
```

### 8.2 交互

必须支持：

- Esc close
- click close
- previous
- next
- keyboard Left / Right
- swipe on touch
- 保持当前筛选结果中的顺序
- close 后回到原 scroll position

### 8.3 视频加载

Lightbox 打开后才创建 `<video>`。

建议：

```html
<video
  controls
  playsInline
  preload="metadata"
  poster="..."
/>
```

不要在 Grid 里创建 80+ 个 `<video>`。

---

## 9. Lightbox 组件方案

推荐：

```text
yet-another-react-lightbox
```

配合：

```text
Video Plugin
```

原因：

- 已有成熟 keyboard / touch / carousel 行为
- 支持 video slide
- 支持 poster
- 支持 MP4 source
- 支持 previous / next
- 避免自己实现复杂的 focus / portal / escape / swipe 逻辑

数据转换示例：

```tsx
{
  type: 'video',
  width: item.width,
  height: item.height,
  poster: galleryUrl(item.poster),
  sources: [
    {
      src: galleryUrl(item.video),
      type: 'video/mp4',
    },
  ],
}
```

建议：

```tsx
carousel={{
  preload: 0,
}}
```

或者最多：

```tsx
preload: 1
```

避免 Lightbox 预加载多个几十 MB 视频。

---

## 10. Motion

项目已有 Framer Motion，因此不增加新的动画依赖。

用于：

- Grid filter reflow
- Grid / Index 切换
- Hero preview crossfade
- Hover preview fade
- Lightbox metadata transition

推荐：

```tsx
<motion.div layout />
```

配合：

```tsx
<AnimatePresence mode="popLayout">
```

动画原则：

- 快
- 轻
- 不影响浏览速度
- 不做大幅 spring bounce
- 尊重 `prefers-reduced-motion`

---

## 11. 数据来源

现有：

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
```

页面继续直接使用现有 `data/gallery.ts`。

不复制一份 Gallery 数据。

---

## 12. URL Helper

Gallery 媒体继续通过现有公开媒体域提供。

逻辑应统一集中在：

```ts
galleryUrl(path)
```

页面组件不直接拼：

```text
https://media.xxx/...
```

---

## 13. 推荐组件目录

```text
app/
└─ gallery/
   └─ page.tsx

components/
└─ gallery/
   ├─ GalleryPage.tsx
   ├─ GalleryHero.tsx
   ├─ GalleryArchive.tsx
   ├─ GalleryToolbar.tsx
   ├─ GalleryGrid.tsx
   ├─ GalleryCard.tsx
   ├─ GalleryIndex.tsx
   ├─ GalleryIndexRow.tsx
   ├─ GalleryPreview.tsx
   ├─ GalleryLightbox.tsx
   └─ GalleryPlayIcon.tsx

lib/
└─ gallery/
   ├─ filters.ts
   └─ format.ts
```

也可以控制组件数量，首版合并为：

```text
components/gallery/
├─ Gallery.tsx
├─ GalleryHero.tsx
├─ GalleryArchive.tsx
└─ GalleryLightbox.tsx
```

建议先保持简单，确认 UI 后再拆。

---

## 14. Server / Client 边界

### Server Component

```text
app/gallery/page.tsx
```

负责：

- metadata
- import galleryItems
- 静态数据准备
- 将数据传给 Client Gallery

### Client Component

```text
Gallery.tsx
```

负责：

- search
- year filter
- Grid / Index state
- active preview
- Lightbox
- Motion

不要把整个 page 都标记为 `'use client'`。

---

## 15. Header

在：

```text
data/headerNavLinks.ts
```

增加：

```ts
{
  href: '/gallery',
  title: 'Gallery',
}
```

建议导航顺序：

```text
Home
Blog
Gallery
Projects / FNDS
```

实际顺序按现有站点导航保持一致。

---

## 16. SEO / Metadata

`app/gallery/page.tsx`

增加：

```ts
export const metadata = {
  title: 'Gallery',
  description: 'Fragments from worlds I have been to.',
}
```

可后续补：

- Open Graph image
- canonical
- structured metadata

Gallery 本身没有必要为每条 clip 创建独立 URL，第一版全部通过 Lightbox 浏览。

---

## 17. MusicDock 联动

当前站点有全局音乐播放器。

Gallery 视频播放时不能出现：

```text
site music + game audio
```

同时播放。

建议完善 `SongContext`：

```ts
type SongContextValue = {
  ...
  pause: () => void
  resume?: () => void
  isPlaying: boolean
}
```

行为：

```text
video play
    ↓
pause site music
```

关闭视频后：

```text
不要自动恢复
```

避免突然出声。

如果以后需要更精细：

```text
记录视频打开前 music 是否正在播放
```

但第一版不自动 resume 最安全。

---

## 18. Poster 加载策略

Grid：

```html
<img
  loading="lazy"
  decoding="async"
/>
```

由于 poster 已经是离线处理后的 WebP，并通过媒体 CDN/R2 域提供，第一版没有必要强制通过 Next Image Optimization。

如果后续流量需要进一步优化：

离线生成：

```text
480w
768w
1280w
```

使用：

```html
srcset
sizes
```

这样更符合 Gallery 当前：

```text
offline processing
    ↓
R2 static output
    ↓
public CDN
```

的整体架构。

---

## 19. Preview 素材优化

目前：

```text
poster.webp
video.mp4
```

后续增加：

```text
preview.mp4
```

脚本输出：

```text
gallery-phase2/
├─ xxx-480.webp
├─ xxx-768.webp
├─ xxx-1280.webp
└─ xxx-preview.mp4
```

preview 参数建议：

```text
duration: 3~5 sec
resolution: 640x360 / 854x480 / 1280x720
muted: true
codec: h264
faststart: true
low bitrate
```

Preview 不需要音轨。

---

## 20. 响应式

### Desktop ≥ 1024

完整体验：

- Hero title hover preview
- 3 column Grid
- Grid / Index
- Index hover preview
- Lightbox previous / next

### Tablet 768~1023

- Hero 改上下布局
- 2 column Grid
- 只展示 Grid，Index 从 `lg`（1024px）开始开放
- Preview 继续使用 poster，避免预览掉到列表末尾

### Mobile < 768

推荐：

- Hero 简化
- 游戏 title list 不做 hover
- 1 column Grid
- 隐藏 Index 模式
- 卡片点击直接 Lightbox
- Lightbox swipe next/prev
- controls 保持足够大

---

## 21. Accessibility

必须处理：

### 卡片

```text
button / clickable semantic element
```

ARIA：

```text
Play Atomic Heart clip recorded Feb 26 2023
```

### Keyboard

- Tab 可进入 card
- Enter / Space open
- Lightbox Esc close
- Arrow Left previous
- Arrow Right next

### Motion

```css
@media (prefers-reduced-motion: reduce)
```

关闭：

- scale animation
- large movement
- preview crossfade 可缩短或取消

### Contrast

暗色背景下：

- 正文至少 gray-300
- metadata gray-400/500
- primary pink 用于 active marker，不用作长正文

---

## 22. 性能规则

### 不允许

```text
82 个 video 同时存在 DOM
```

### Grid

只加载：

```text
poster
```

### Hover Preview

仅当前 active item：

```text
最多 1 个 preview video
```

### Lightbox

仅当前：

```text
1 个 main video
```

可预加载：

```text
0~1 adjacent item
```

### 图片

使用：

```text
loading="lazy"
decoding="async"
```

首屏 Hero poster：

```text
eager
```

---

## 23. State 设计

建议：

```ts
const [year, setYear] = useState<string>('all')
const [query, setQuery] = useState('')
const [view, setView] = useState<'grid' | 'index'>('grid')
const [activePreviewId, setActivePreviewId] = useState<string | null>(null)
const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
```

派生：

```ts
const filteredItems = useMemo(...)
```

不要把：

```text
filteredItems
```

放进 state。

---

## 24. Filtering

伪代码：

```ts
const filteredItems = galleryItems
  .filter((item) => {
    if (year === 'all') return true
    return item.recordedAt.startsWith(year)
  })
  .filter((item) => {
    if (!query.trim()) return true

    const text = `${item.game ?? ''} ${item.title}`.toLowerCase()
    return text.includes(query.trim().toLowerCase())
  })
  .sort(
    (a, b) =>
      new Date(b.recordedAt).getTime() -
      new Date(a.recordedAt).getTime()
  )
```

---

## 25. Duration Format

```ts
function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)

  return `${minutes}:${secs.toString().padStart(2, '0')}`
}
```

---

## 26. Date Format

卡片：

```text
FEB 26 2023
```

或者：

```text
Feb 26, 2023
```

Lightbox：

```text
JUL 08 2025 · 00:59 · GAMING
```

统一用 `Intl.DateTimeFormat`，避免自己维护月份字符串。

---

## 27. Figma 设计对应关系

当前 Figma：

### Frame 1

```text
Gallery / Desktop
```

实现：

```text
GalleryPage
├─ GalleryHero
└─ GalleryArchive
   ├─ GalleryToolbar
   └─ GalleryGrid
```

### Frame 2

```text
Gallery / Index Hover State
```

实现：

```text
GalleryIndex
├─ GalleryIndexRow
└─ GalleryPreview
```

### Frame 3

```text
Gallery / Lightbox Playback
```

实现：

```text
GalleryLightbox
```

---

## 28. 第一阶段开发范围

首个可用版本：

- [x] `/gallery`
- [x] Header Gallery 导航
- [x] Hero
- [x] Representative game list
- [x] Featured poster
- [x] Archive
- [x] 3 / 2 / 1 columns
- [x] year filter
- [x] game search
- [x] Grid mode
- [x] Index mode desktop
- [x] Index hover poster preview
- [x] Lightbox
- [x] Video playback
- [x] previous / next
- [x] keyboard
- [x] responsive
- [x] MusicDock pause
- [x] reduced motion
- [x] lazy poster loading

---

## 29. 第二阶段

视觉与体验增强：

> 2026-08-18 状态：页面能力已在 DEV 实现并完成本地 Worker + 浏览器验收。
> 82 条 preview 视频和三档响应式 poster 已生成到独立目录并发布到 R2 的
> `gallery-phase2/` 前缀；catalog 已写入可选 asset 字段。

- [x] 生成 3~5 秒 preview mp4（82 条已生成并发布到 `gallery-phase2/`）
- [x] Hero hover video preview（有 preview 时延迟 200ms、muted、loop、playsInline；无 preview 回退 poster）
- [x] Index hover video preview（同上，离开列表行停止并卸载）
- [x] smoother preview crossfade（poster、preview video 和筛选预览均使用轻量 opacity 过渡）
- [x] mobile swipe（由 YARL carousel 提供，显式保留 `touchAction: 'none'` 和循环滑动）
- [x] URL hash / query 保存当前 Lightbox clip（兼容 `#clip=`，新状态使用 `?clip=`）
- [x] filter state 写入 URL（`year`、`q`、`view` 使用 replaceState，不污染历史记录）
- [x] poster responsive srcset（82 条 `posterSrcSet` 已写入 catalog，三档 poster 已发布到 `gallery-phase2/`）
- [x] skeleton / blur placeholder（poster 加载时 skeleton + blur，加载后平滑清晰）

---

## 30. 暂时不做

第一版明确不做：

- Masonry
- infinite scroll
- pagination
- 82 个 autoplay video
- full HLS pipeline
- Cloudflare Stream
- likes
- favorites
- comments
- share system
- per-clip detail page
- phone category UI
- complicated tag facet
- complex dashboard cards

这些功能目前都会增加复杂度，但不会明显提高 Gallery 第一版体验。

---

## 31. 推荐依赖

新增：

```bash
yarn add yet-another-react-lightbox
```

使用：

```ts
import Lightbox from 'yet-another-react-lightbox'
import Video from 'yet-another-react-lightbox/plugins/video'
```

已有依赖继续使用：

```text
framer-motion
lucide-react
tailwindcss
```

不引入：

```text
React Photo Album
Masonry library
新的 animation library
新的 full design system
```

---

## 32. 文件级实施顺序

### Step 1

```text
app/gallery/page.tsx
data/headerNavLinks.ts
```

建立 route 和导航。

### Step 2

```text
components/gallery/Gallery.tsx
components/gallery/GalleryHero.tsx
```

完成 Hero + static preview。

### Step 3

```text
components/gallery/GalleryArchive.tsx
components/gallery/GalleryCard.tsx
```

完成 Grid + filter + search。

### Step 4

```text
components/gallery/GalleryIndex.tsx
```

完成 Grid / Index 双视图。

### Step 5

```text
components/gallery/GalleryLightbox.tsx
```

接入 video Lightbox。

### Step 6

MusicDock：

```text
SongContext
MusicDock
GalleryLightbox
```

处理音频互斥。

### Step 7

- mobile
- keyboard
- reduced motion
- performance audit

---

## 33. 验收标准

### Desktop

- Hero 与 Figma 结构一致
- 3-column card grid
- Grid / Index 可切换
- Index hover preview 正常
- Lightbox 可连续前后浏览
- 关闭后保持 scroll position

### Mobile

- 页面无横向溢出
- 1-column
- 视频 controls 可点击
- poster 不拉伸
- Lightbox swipe / controls 可用

### Performance

初次打开 `/gallery`：

```text
不下载 82 条原始 MP4
```

只下载首屏必要 poster。

### Audio

播放 Gallery 视频：

```text
MusicDock 自动暂停
```

### Dark / Light

如果保留网站全局 light mode：

第一版至少保证：

- dark 完整设计
- light 不出现不可读文字

如果 Gallery 希望定义为“始终 dark experience”，需要另外决定是否在页面级锁定 dark theme；第一版建议仍然跟随全站 theme。

---

## 34. 最终产品定位

Gallery 最终不是：

```text
Video Manager
```

也不是：

```text
Photo Masonry
```

而是：

```text
Personal Video Archive
Game Memory Library
Interactive Clip Index
```

核心体验顺序：

```text
进入
 ↓
Hero 建立氛围
 ↓
看到代表游戏
 ↓
进入 Archive
 ↓
Grid 视觉浏览 / Index 快速扫描
 ↓
Hover 预览
 ↓
Lightbox 连续观看
 ↓
关闭后继续浏览
```

这就是当前 Figma 版本建议对应的开发实现。
