# Desk Mode：3D 桌面互动体验方案

- 状态：第一版 Graybox 已实现，正在 DEV 验收
- 日期：2026-08-29
- 目标分支：`cloudflare-worker-DEV`
- Feature 名称：Desk Mode / The Desk
- 实施状态：Phase 0–4 的首版已落地；桌面与交互继续使用现有实现，外部模型通过 Blender CLI 统一处理后再接入。模型源文件保留在 `assets/3d/`，页面只加载 `public/desk/models/` 下自包含的 GLB；未上传模型到 R2。

### 资产处理约定

外部模型不直接在浏览器中加载 FBX。统一使用仓库内的 Blender CLI wrapper：

```bash
node .yarn/releases/yarn-3.6.1.cjs desk:process-model \
  --source assets/3d/2026-08-30/models/PC+MODEL+MINGTU.fbx \
  --output public/desk/models/pc-mingtu.glb
```

处理器会保留原始文件不变，导入 FBX/GLB，应用源模型变换，将原点归到模型底部中心，
并导出内嵌材质的 GLB。`--scale` 与 `--rotation X Y Z` 只在新模型的源单位或朝向不同
时显式指定；页面代码只负责把标准化模型放到桌面场景中的落点，不再修正模型自身的
单位、坐标轴或原点。默认输出会被页面直接加载，避免运行时 FBX 解析和不同浏览器的
坐标差异。

## 1. 一句话概念

Desk Mode 是 Solidays 的一个独立 3D 空间。用户先看到一张完整的、深夜电影感的个人桌面；桌面中央是电脑，两侧和前景分别放置收音机、相框与便签纸。点击某件物品后，镜头从全局桌面推进到该物品，用户完成操作后必须先退出并回到全局桌面，才能选择另一件物品。

Desk Mode 不替换当前首页、Gallery、FNDS 或 About，也不把网站改成自由漫游游戏。它是一个可以直接进入和退出的第二空间，复用现有媒体资源，但拥有独立的场景交互和局部媒体生命周期。

```text
Solidays 首页
    ↓ Enter the Desk
静态 Desk Preview / 3D 资源加载
    ↓
完整桌面 Overview
    ├─ 电脑：随机 Gallery 视频
    ├─ 收音机：四首站内歌曲
    ├─ 相框：FNDS 图片
    └─ 便签纸：现有匿名留言
```

## 2. 已确认的产品边界

### 2.1 Goals

1. 给 Solidays 增加一个具有记忆点的沉浸式入口，不替换现有站点结构。
2. Overview 首屏必须能同时看到完整桌面和四件核心功能物品。
3. 每件物品都有明确的镜头推进、操作和退出过程。
4. 电脑使用现有 Gallery inventory，提供最简单的随机视频体验。
5. 收音机、相框和便签分别承载音乐、FNDS 与匿名留言，不把功能做成普通菜单卡片。
6. 桌面端保留完整镜头体验；移动端使用固定镜头、简化光影和 HTML 辅助控制。
7. WebGL 不可用、资源失败或上下文丢失时仍可使用 2D fallback。
8. 模型、热点、镜头目标和业务逻辑解耦，后续可以逐件替换模型。

### 2.2 Non-goals

- 不做第一人称或自由漫游。
- 不允许用户自由 Orbit、Pan 或把镜头移动到不可恢复的位置。
- 不允许从一件物品直接横移到另一件物品。
- 不做物理引擎、多人互动、复杂任务或可任意搬动物件。
- 不在电脑中复制完整 Gallery 页面、搜索、年份筛选或 Grid/Index。
- 不一次创建或预加载 82 个视频元素。
- 不使用 VideoTexture 作为首版视频方案。
- 不让 Canvas 成为唯一操作路径；核心功能必须有 HTML/键盘入口。
- 不新增 D1、聊天 API、Durable Object 或 Realtime 协议。
- 不重写现有 Floating Chat 的 conversation、Turnstile、滚动与 realtime 状态机。
- 不要求 Desk 局部音乐与全站 MusicDock 共享播放状态。
- 不在第一版加入后处理、复杂 shader、体积雾或 Web Audio 频谱灯光。

## 3. 路由与页面外壳

### 3.1 独立 `/desk` 路由

Desk Mode 使用独立 `/desk` 路由，可直接分享、收藏和通过浏览器后退退出。

第一版入口只放在首页：

- 首页提供低调但明确的 `Enter the Desk`；
- Desk 稳定后再决定是否加入 Header；
- `/desk` 发布时加入 sitemap，并提供独立 Metadata；
- 明确的 `Back to Solidays` 按钮固定返回 `/`；
- 浏览器后退保留浏览器原生语义。

### 3.2 全视口语义

`/desk` 是全视口体验，不嵌在普通内容列中显示：

- `app/desk/page.tsx` 仍是 Server Component；
- Client Desk island 使用 `fixed inset-0` 覆盖普通 Header、SectionContainer 和 Meteors；
- 不把根 `app/layout.tsx` 改成 Client Component；
- Desk Canvas 建议位于 `z-10`，Desk HTML 控制和媒体层位于 `z-20` 至 `z-40`；
- Floating Chat 面板仍使用现有高层级，但 `/desk` 不显示原来的圆形 Chat Launcher；
- MusicDock 组件保持挂载以维持全站能力，但 `/desk` 隐藏 Dock UI；
- Desk mount 时锁定页面滚动，unmount 时可靠恢复。

## 4. 核心镜头与交互状态机

### 4.1 状态

```text
loading
  ↓
overview
  ├─ entering(computer) → focused(computer)
  ├─ entering(radio)    → focused(radio)
  ├─ entering(frame)    → focused(frame)
  └─ entering(note)     → focused(note)

focused(target)
  ↓ exit
leaving(target)
  ↓
overview
```

核心不变量：

1. 只有 `overview` 可以选择物品。
2. `entering` 和 `leaving` 期间关闭热点，避免重复触发。
3. `focused(computer)` 不能直接进入 `focused(radio)`。
4. 必须先退出到 `overview`，再选择下一件物品。
5. 快速连续点击只接受第一个合法 command，不重启动画。
6. reduced motion 下保留同样状态机，只把镜头动画改为即时或极短淡入。

### 4.2 镜头

- Overview 使用固定透视相机，完整展示桌面与四个核心物件；
- 不使用自由 OrbitControls；
- 每件物品都有独立 `cameraPosition` 和 `lookAtTarget`；
- 镜头推进和退出使用一条确定轨迹；
- 桌面端可增加极轻的鼠标视差，但不能改变业务相机状态；
- 移动端不做鼠标视差，不允许双指缩放和自由旋转；
- Escape 优先关闭当前媒体/聊天浮层，其次退出物品焦点；Overview 再按 Escape 返回 `/`；
- 输入框、视频控件获得焦点时，Escape 不得覆盖其必要键盘语义。

### 4.3 HTML 辅助控制

Canvas 不是唯一入口。页面同时提供一个可访问的 Desk 控制条：

- Computer；
- Radio；
- Photos；
- Message；
- Exit。

控制条与 3D 热点调用同一组 `focusObject(target)` / `exitFocus()` command，不能维护第二套状态。

## 5. 电脑：随机 Gallery 视频

### 5.1 产品行为

电脑位于桌面中央，是视觉主物件。

进入电脑模式：

1. Overview 中电脑屏幕先显示一个随机 poster；
2. 用户点击电脑后，镜头推进到固定电脑景位；
3. 同一个用户手势尝试播放当前随机视频；
4. 如果浏览器阻止播放，屏幕显示一个明确的 Play；
5. 用户可以播放/暂停、随机下一条、退出；
6. 退出电脑后暂停并卸载活动视频，镜头回到 Overview。

首版不提供：

- 视频列表；
- 上一条历史；
- 游戏筛选；
- 年份筛选；
- 搜索；
- 时间轴之外的复杂播放器功能。

### 5.2 随机袋算法

使用全部 `galleryItems`，但采用 shuffle bag，避免连续随机造成重复：

1. 进入 Desk 时对全部 Gallery ID 执行 Fisher–Yates shuffle；
2. 第一条作为电脑 Overview poster；
3. 每次“随机下一个”从袋中取下一条；
4. 一轮内不重复；
5. 全部播放完后重新洗牌；
6. 新一轮第一条不能与上一轮最后一条相同；
7. 在同一次 `/desk` 生命周期中，退出再进入电脑不会重置随机袋。

### 5.3 视频实现

首版不把 `<video>` 作为 Three.js `VideoTexture`，也不使用带透视变换的 Drei `Html` 视频控件。

实现边界：

- 3D 屏幕在 Overview 和镜头移动期间显示 poster texture；
- 到达固定电脑景位后，使用一个普通 DOM `<video playsInline>` 精确覆盖显示器区域；
- `<video>` 可提前以 `preload="metadata"` 挂载，但只允许一个实例；
- 视频控件使用 Desk 自己的最小 HTML UI：播放/暂停、随机下一个、退出；
- 切换下一条由点击手势设置新 src 并尝试播放；
- 当前视频播放时暂停 Desk Radio 和全局 MusicDock 音频；
- 退出或离开 `/desk` 时暂停、清空 src 并释放媒体资源；
- 可提供普通链接进入 `/gallery?clip=<id>`，但不是首版主要路径。

Gallery 文件继续使用 `data/gallery.ts`、`galleryUrl()` 和公开 `media.solidays.win`，不复制到私有媒体桶。

## 6. 收音机：Desk 独立音乐播放器

### 6.1 已确认边界

Desk Radio 复用音乐资源和元数据，不复用 MusicDock 的 UI 状态与播放队列。

- 曲目仍来自 `data/cards.ts`；
- URL 仍来自每张卡的 `audioKey` 和 `/media/music/`；
- Desk 内创建一个局部 `HTMLAudioElement`；
- 不重构现有 MusicDock 的上一首、下一首和持久化逻辑；
- Desk Radio 不写入 `musicPlayerState` 或 `musicQueue`；
- 退出 `/desk` 时暂停并销毁 Desk audio；
- 再次进入 Desk 是新的局部播放会话。

### 6.2 控制与生命周期

收音机提供：

- 播放/暂停；
- 上一首/下一首；
- 当前歌曲名称；
- 当前进度与总时长；
- 加载与错误状态；
- 退出到 Overview。

媒体互斥：

```text
Radio 开始播放
→ pause() 全局 MusicDock 音频

Radio Focus → Overview
→ Desk Radio 继续播放

Overview → Frame / Note
→ Desk Radio 继续播放

Computer 视频开始播放
→ 暂停 Desk Radio + 暂停全局 MusicDock

离开 /desk
→ 暂停并销毁 Desk Radio，不自动恢复全局音乐
```

浏览器自动播放规则不变：进入 Desk、加载模型或镜头推进本身不能自动发声。首次播放必须来自用户点击收音机或 HTML 播放按钮。

## 7. 相框：FNDS 图片

### 7.1 数据边界

图片二进制继续存储在私有 R2 `fnds/` 前缀。代码只维护媒体 catalog，不复制图片文件。

实施前把 `app/fnds/page.tsx` 内联的七项数据抽取为 `data/fnds.ts`，由 `/fnds` 与 `/desk` 共同读取。Catalog 至少包含：

- 稳定 ID；
- 标题/alt；
- R2 media key；
- `/fnds` 页面需要的初始布局 class（如仍保留）。

私有 R2 不向浏览器开放列目录能力，因此 catalog 是资源索引，不是媒体副本。

### 7.2 产品行为

- Overview 显示当前照片；
- 点击相框后镜头推进；
- 提供上一张、下一张和退出；
- 只预加载当前和下一张；
- 不默认自动轮播；
- 当前图片索引在同一次 `/desk` 生命周期中保留；
- 可提供进入 `/fnds` 的普通链接；
- 离开 Desk 后不需要持久化相框索引。

## 8. 便签纸：Floating Chat 入口

### 8.1 产品行为

在 `/desk` 中，右下角圆形 Chat Launcher 被桌面上的便签纸取代：

1. Overview 中可以看到黄色或米白色便签；
2. 便签上显示简短的 `Leave a message`；
3. 点击后镜头推进到便签；
4. 镜头到位后打开现有 ChatPanel；
5. 关闭 ChatPanel 后镜头退出并回到 Overview。

移动端同时在 HTML 辅助控制条中提供 `Message`，与 3D 便签调用同一 command。

### 8.2 技术边界

- 继续使用现有 Floating Chat 单一实例；
- 不复制 conversation、messages、input、Turnstile、realtime 或滚动逻辑；
- `/desk` 只替换 launcher，不复制 ChatPanel；
- Desk 通过一个很小的显式 open/close command 边界控制现有 FloatingChat；
- 首版 ChatPanel 仍保持现有玻璃视觉，不改成纸张面板；
- 便签焦点与 ChatPanel 关闭事件需要双向同步；
- 路由离开时沿用现有聊天清理和状态保留语义。

后续若要把展开面板也改为纸张皮肤，应作为独立视觉改造，不与 Desk 首版绑定。

## 9. 视觉方向与模型替换

### 9.1 已确认视觉

- 深夜、低饱和、偏电影感的个人桌面；
- 木质、黑色或深灰桌面；
- 电脑屏幕光和单一台灯作为主要光源；
- 黄色、粉色作为 Solidays 指示灯和热点强调色；
- 收音机使用黑色小型桌面收音机造型；
- 桌面应像被真实使用过，而不是电商产品展示；
- 首版不让台灯切换全站主题；
- 同一套夜间场景用于站点 light/dark theme，不制作双主题 3D 资产。

### 9.2 模型与交互解耦

```text
DeskScene
├─ DeskShell
├─ ComputerSlot
│   ├─ ComputerModel
│   ├─ ComputerHotspot
│   └─ ComputerCameraTarget
├─ RadioSlot
├─ PhotoFrameSlot
└─ NoteSlot
```

约束：

- Hotspot、CameraTarget 与视觉 mesh 分开；
- 业务逻辑只引用稳定 object ID，不引用模型导出的随机 mesh 名；
- 模型替换不能改变 `computer | radio | frame | note` 状态值；
- 第一阶段使用 primitives/Graybox 验证比例和镜头；
- 正式模型通过后再替换 `*Model`，不重写媒体逻辑。

建议资产拆分：

```text
desk/v1/preview.webp
desk/v1/shell.glb
desk/v1/computer.glb
desk/v1/radio.glb
desk/v1/frame.glb
desk/v1/note.glb
desk/v1/textures/...
```

R2 使用 immutable cache；发布新模型或纹理时使用 `v2` 或内容版本路径，不覆盖既有 `v1` key。所有第三方模型和纹理必须记录来源与授权。

## 10. 进入、加载与退出

### 10.1 进入 Desk

首版不在来源页面等待完整 GLB，也不保留旧页面 DOM 直到模型 ready。

采用连续 preview：

```text
点击 Enter the Desk
→ 全屏 preview 快速覆盖当前首页
→ router 进入 /desk
→ /desk 继续显示同一张 preview
→ Canvas / Graybox / GLB ready
→ preview crossfade 到 3D Overview
```

这样直接访问 `/desk` 也能立即看到有效画面，不出现空 Canvas。入口过渡使用 Framer Motion DOM 层，不使用 `document.startViewTransition()`，避免再次触发 Safari 玻璃合成问题。

### 10.2 退出 Desk

- 退出当前物品只回到 Overview；
- `Back to Solidays` 从 Overview 返回 `/`；
- 浏览器后退保持原生行为；
- 离开 route 时停止视频、Desk Radio、相机循环和资源监听；
- 不自动恢复进入 Desk 前暂停的全局音乐；
- Canvas unmount 后恢复 body scroll。

## 11. 技术架构

### 11.1 组件边界

```text
app/desk/page.tsx                         Server Component + metadata
└── components/desk/DeskExperience.tsx   Client route shell
    ├── DeskTransition.tsx                preview/loading/crossfade
    ├── DeskCanvasClient.tsx              dynamic({ ssr: false })
    │   └── <Canvas frameloop="demand">
    │       ├── DeskEnvironment
    │       ├── DeskCameraRig
    │       ├── DeskComputer
    │       ├── DeskRadio
    │       ├── DeskPhotoFrame
    │       └── DeskNote
    ├── DeskControls.tsx                  accessible object/exit controls
    ├── DeskComputerOverlay.tsx           one DOM video + minimal controls
    ├── DeskRadioControls.tsx             local audio controls
    └── DeskFallback.tsx                  2D equivalent
```

### 11.2 依赖

实施 Phase 1 时一次性增加：

- `three`；
- `@react-three/fiber` v9（React 19）；
- 与其兼容的 `@react-three/drei`；
- 如 TypeScript 构建需要则增加 `@types/three`。

Next 配置按 R3F 官方要求加入 `three` 的 `transpilePackages`。`ssr: false` 必须位于 Client Component 中，不能写在 Server `page.tsx`。第一版不增加 GSAP、物理、postprocessing 或 shader 库。

- [R3F Installation](https://r3f.docs.pmnd.rs/getting-started/installation)
- [Next.js Lazy Loading](https://nextjs.org/docs/app/guides/lazy-loading)

### 11.3 渲染策略

- 一个 route 只创建一个 Canvas/WebGL context；
- 默认 `frameloop="demand"`；
- 相机 tween 和必要状态动画期间主动 invalidate；
- 不保留持续运行的装饰性 `useFrame`；
- Desktop DPR 为 1–1.5；Mobile DPR 为 1；
- 只有一个活动视频和一个 Desk audio；
- Context lost、GL 初始化失败和 GLB 加载失败都必须进入可退出的 2D fallback。

[R3F Canvas](https://r3f.docs.pmnd.rs/api/canvas) 与 [R3F Performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance) 提供了 fallback、DPR 与按需渲染能力。

## 12. 媒体与 R2 契约

### Gallery

- 数据：`data/gallery.ts`；
- URL：`galleryUrl()` / `media.solidays.win`；
- 运行时只挂载当前 `<video>`；
- 不复制进 `solidays-media`；
- 不新增 Gallery API。

### Music

- 数据：`data/cards.ts`；
- 文件：私有 `solidays-media/music/`；
- Desk Radio 使用自己的局部 audio 和 state；
- 不复制歌曲文件，不改 MusicDock 存储契约。

### FNDS

- 数据：共享 `data/fnds.ts`；
- 文件：私有 `solidays-media/fnds/`；
- 相框只预加载当前和下一张。

### Desk 资产

- 文件：私有 `solidays-media/desk/vN/`；
- `/media/[...key]` 白名单只增加明确的 `desk/` 前缀；
- 不放宽通用正则；
- GLB 与 preview 使用长期 immutable cache 和版本化 key。

## 13. 移动端与降级

移动端采用简化 3D，不是桌面场景原样缩小：

- 固定 Overview 和四个 focus camera preset；
- 不允许自由旋转、缩放和 pan；
- 不做实时阴影、后处理、粒子和鼠标视差；
- DPR 固定为 1；
- 3D hotspot 与底部 HTML 控制条同时存在；
- 点击目标至少满足合理触控面积；
- 视频使用 `playsInline` DOM overlay；
- safe-area 下 Exit、控制条和 ChatPanel 不能互相遮挡；
- orientation change 后重新计算 overlay rect 和 camera aspect，但不重置媒体 catalog；
- WebGL 初始化失败、context lost 或用户主动选择简化模式时进入 2D Desk。

`prefers-reduced-motion: reduce`：

- 不强制取消 3D；
- 取消镜头飞入、idle motion 和 crossfade 长动画；
- 保留即时状态切换、媒体控制和 2D fallback。

## 14. 可访问性

- Tab 可到达 Computer、Radio、Photos、Message、Exit；
- Enter/Space 与点击物品调用同一 command；
- 不依赖 hover 才能发现核心功能；
- 屏幕阅读器可以读出当前焦点物品、视频、歌曲和照片；
- 视频、音乐和图片状态变化使用适度的文本反馈；
- 装饰物不进入 Tab 顺序；
- 2D fallback 提供与四个 3D 物件等价的操作和页面链接；
- ChatPanel 继续沿用现有可访问性、焦点和键盘逻辑。

## 15. 首版性能预算

| 项目 | 首版预算 |
| --- | ---: |
| Desk 专属 JavaScript gzip | ≤ 300 KB |
| Preview 图片 | ≤ 250 KB |
| 初始模型与纹理传输 | Desktop ≤ 4 MB；Mobile ≤ 2.5 MB |
| 三角形 | Desktop ≤ 150k；Mobile ≤ 80k |
| Draw calls | ≤ 80 |
| 最大纹理 | Desktop 2K；Mobile 1K |
| DPR | Desktop 1–1.5；Mobile 1 |
| 运行目标 | Desktop ≥ 50 FPS；Mobile ≥ 30 FPS |

基础版本先使用普通 GLB/纹理。只有真实资产超过预算或测试证明解码收益明确时，再决定 Draco/KTX2，避免首版同时引入解码器、额外 Worker 路径和 CSP 变量。

## 16. 分阶段实施计划

### Phase 0：共享数据与 Graybox 规格

1. 抽取 `data/fnds.ts`，保证现有 `/fnds` UI 与拖拽行为不变。
2. 新增 Desk object ID、camera preset、随机袋和媒体生命周期的纯函数/类型。
3. 确认 Overview 构图、电脑/收音机/相框/便签位置和点击区域。
4. 用 primitives 作为模型合同，不等待正式 GLB。
5. 记录性能预算和测试 viewport。

### Phase 1：全屏 Desk Shell

1. 安装 Three.js、R3F、Drei 并配置 Next transpilation。
2. 新增 `/desk`、preview、dynamic client-only Canvas 和 2D fallback。
3. 实现 `overview / entering / focused / leaving` 状态机。
4. 实现四个 Graybox 物件、独立热点、camera target 和 HTML 控制条。
5. 实现移动端固定镜头、reduced-motion 与 context-loss fallback。
6. 验证 Header/Meteors 被覆盖，MusicDock UI 隐藏，页面滚动与 route cleanup 正确。

### Phase 2：电脑与随机视频

1. 接入 `galleryItems` 和 shuffle bag。
2. Overview 显示当前随机 poster。
3. 实现电脑镜头、单个 DOM video、播放/暂停与随机下一条。
4. 实现视频与 Desk Radio/全局音乐互斥。
5. 验证 iOS/微信内置浏览器 playsInline、用户手势和失败退路。

### Phase 3：独立 Desk Radio

1. 接入四张歌词卡的 `audioKey`。
2. 创建 Desk 局部 audio、上一首/下一首、进度、时长和错误状态。
3. 隐藏 `/desk` 的 MusicDock UI，但不改 MusicDock 现有状态机。
4. 验证退出 focus 继续播放、视频开始暂停、离开 route 销毁。

### Phase 4：相框与便签聊天

1. 相框接入共享 FNDS catalog 和当前/下一张预加载。
2. 实现相框镜头、上一张/下一张和 `/fnds` 链接。
3. `/desk` 隐藏圆形 Chat Launcher，便签成为唯一场景入口。
4. 建立最小 chat open/close command 边界，复用现有 ChatPanel 实例。
5. 验证草稿、历史、realtime、Turnstile、滚动和 route close 无回归。

### Phase 5：正式模型与视觉深化

1. 逐件替换 DeskShell、Computer、Radio、Frame、Note 模型。
2. 保留稳定 hotspot 与 camera target，不改业务状态机。
3. 加入有限屏幕光、收音机指示灯和相框反光。
4. 根据真实性能决定纹理变体、压缩和阴影等级。
5. 最多增加 1–2 个纯装饰物或彩蛋，不扩展核心功能。

### Phase 6：验收与发布

1. 本地 Worker + Chrome DevTools 验证桌面端所有状态转换。
2. 真机验证 iPhone Safari、微信内置浏览器、Android Chrome 和横竖屏。
3. 检查 Network、Console、Worker terminal、R2 媒体响应与缓存头。
4. 检查 WebGL context cleanup、route cleanup、音视频互斥和 Chat 状态。
5. 运行 lint、build、worker build、生产配置门禁与 Wrangler dry-run。
6. 只在 DEV 验证通过后提交；生产发布继续按现有 release process。

## 17. 验收标准

### 核心体验

- Overview 第一帧能看到完整桌面和电脑、收音机、相框、便签；
- 电脑位于视觉中心；
- 每件物品从 Overview 单独推进；
- 任何 focus 都必须退出到 Overview 后才能选择另一件物品；
- 快速点击不会重启或叠加相机动画；
- 正式模型替换不会要求重写镜头与媒体逻辑。

### 电脑

- 首个视频随机；
- 随机下一条在一轮内不重复；
- 只有一个 video 元素；
- 播放、暂停、下一条和退出可用；
- 退出时视频停止并释放；
- 视频开始时 Desk Radio 与全局音乐都暂停。

### 收音机

- 四首歌均可循环切换；
- 播放、暂停、上一首、下一首、进度和总时长正确；
- 从 Radio 退回 Overview 后继续播放；
- 进入 Frame/Note 不打断；
- 视频开始时暂停；
- 离开 `/desk` 后停止且不自动恢复全局音乐。

### 相框

- 七张 FNDS 图来自共享 catalog；
- 手动上一张/下一张，不自动轮播；
- 图片索引在同一次 Desk 生命周期中保留；
- 不一次请求全部原图。

### 便签与聊天

- `/desk` 不显示原圆形 Chat Launcher；
- 便签和 HTML Message 控制都能打开同一个 ChatPanel；
- 关闭 ChatPanel 后镜头退回 Overview；
- conversation、messages、input draft、Turnstile、realtime 与滚动无回归。

### 移动端与降级

- 固定镜头和四个触控入口可用；
- 无横向滚动，safe-area 正确；
- orientation change 后 overlay 和相机恢复正确；
- WebGL 失败/context lost 后显示等价 2D Desk；
- reduced-motion 下没有长镜头动画；
- 页面退出后没有残留音视频、render loop 或事件监听。

## 18. 主要风险与约束

### 媒体自动播放

电脑和收音机必须在点击手势内尝试播放；异步镜头完成后再调用 `play()` 可能失去用户激活。视频和 audio 需要在进入前准备好引用，并为 iOS 提供明确 Play fallback。

### Desk 与全局音频出现双播放

Desk Radio 是独立实例，但第一次播放前必须暂停 `window.globalAudioPlayer`；电脑视频播放前同时暂停两个音频来源。任何媒体错误都不能自动恢复另一个播放器。

### Chat 入口物件化导致业务复制

便签只能作为现有 FloatingChat 的外部 trigger。不得在 Desk 中复制请求、Realtime、消息 merge 或 Turnstile 逻辑。

### DOM video 与 3D 屏幕错位

只有固定 computer camera 到位后才显示 DOM video；resize/orientation change 必须重新测量 screen overlay。镜头移动期间显示 3D poster，不让 DOM video 跟随任意透视变换。

### 模型替换破坏热点

热点和 camera target 归 Slot 管理，不由 GLB mesh 名称隐式决定。正式模型需要符合 Slot 的坐标、尺寸和朝向合同。

### Safari 合成问题

Desk 入口不使用 View Transition，不把 ChatSurface、MusicDock 和 Canvas 放进同一个 shared-layout。iOS Safari 和微信内置浏览器必须单独验证 overlay、backdrop 与视频层级。

## 19. 首版明确不做

- 自由 OrbitControls 或第一人称移动；
- 物品到物品的直接镜头横移；
- 电脑内完整 Gallery UI；
- VideoTexture 和带透视变换的原生视频控件；
- 相框自动轮播；
- Desk 音乐与 MusicDock 播放状态持久同步；
- 展开 ChatPanel 的纸张皮肤；
- 真实黑胶物理、频谱驱动灯光、物理碰撞；
- postprocessing、复杂 shader、实时体积雾；
- 多人同步桌面；
- 自动根据设备型号判断性能等级；
- 从任意来源页面保留完整 DOM 等待 GLB 加载。

## 20. 最终首版定义

```text
/desk（全视口）
├─ 深夜电影感的完整个人桌面 Overview
├─ 电脑：82 条 Gallery 的无重复随机袋 + 单视频播放器
├─ 黑色收音机：四首歌的 Desk 独立播放器
├─ 相框：七张 FNDS 图片手动切换
├─ 便签纸：现有 Floating Chat 的场景入口
├─ 每件物品独立推进，退出后回 Overview
├─ 普通 HTML 辅助控制条
└─ Mobile 简化 3D + 等价 2D fallback
```

这个范围足以验证 Solidays 的内容是否适合聚集在一个可操作的个人桌面中，同时把模型制作、媒体业务和现有聊天系统隔离开。首版成立后，再逐步增加装饰物、彩蛋和更精细的材质，不反向扩张核心状态机。

## 21. 参考资料

- [Three.js 创建场景](https://threejs.org/manual/en/creating-a-scene.html)
- [React Three Fiber 安装与 Next.js](https://r3f.docs.pmnd.rs/getting-started/installation)
- [React Three Fiber Canvas](https://r3f.docs.pmnd.rs/api/canvas)
- [React Three Fiber 性能缩放](https://r3f.docs.pmnd.rs/advanced/scaling-performance)
- [Drei Html](https://drei.docs.pmnd.rs/misc/html)
- [Next.js Lazy Loading](https://nextjs.org/docs/app/guides/lazy-loading)
