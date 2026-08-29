# Music Dock 与聊天按钮视觉统一改造方案

- 状态：已在 `cloudflare-worker-DEV` 实施
- 目标分支：`cloudflare-worker-DEV`
- 范围：全局 Music Dock 与 Floating Chat Launcher 的视觉层
- 不包含：聊天面板内容、Realtime、Turnstile、D1、音频播放逻辑与路由行为

## 1. 背景

当前页面右下角的聊天按钮和底部中央的 Music Dock 都属于全局浮动控件，但它们使用了两套不完全一致的玻璃样式：

- Music Dock 使用 `bg-white/80`、`backdrop-blur-md`、`rounded-2xl`，外层还有 `scale-75`。
- Chat Launcher 复用了 `chatSurfaceClassName`，在支持 `backdrop-filter` 时使用 `bg-white/60`、`backdrop-blur-2xl`，形状是圆形。
- 两者的 border、shadow、背景 alpha、blur 半径和尺寸体系没有统一定义。
- Chat Launcher 还需要兼容主题切换期间的 opaque workaround，不能简单把聊天面板的样式直接复制到所有控件。

因此视觉上会出现三种感受不一致：

1. Music Dock 更像一块有雾的浮动面板。
2. Chat Launcher 更像一块透明玻璃按钮。
3. Dock 的胶囊形与 Launcher 的圆形属于不同的几何体系，边框和阴影强度也不完全匹配。

## 2. 先区分两个容易混淆的概念

### 2.1 透明度决定“能看见多少背景”

`background-color` 的 alpha 越低，控件后面的页面内容越容易透出来。比如 `bg-white/60` 比 `bg-white/80` 更透明。

### 2.2 模糊决定“背景透出来时有多清楚”

`backdrop-filter: blur(...)` 只处理控件后面的内容，不会改变控件自身背景的 alpha。模糊半径越大，透出的背景轮廓越柔和，但不代表控件一定更不透明。

当前 Chat Launcher 的 blur 半径比 Dock 大，但背景 alpha 更低；Music Dock 的背景 alpha 更高，且 Dock 自身经过 `scale-75`，再叠加页面背景和阴影后，肉眼可能会感觉它更“糊”。改造时必须把 alpha、blur、border 和 shadow 分开校准，不能只调一个 `backdrop-blur-*` 类名。

## 3. 改造目标

### 3.1 统一视觉语言，而不是强行统一形状

两个控件的职责不同，推荐保留：

- Chat Launcher：圆形单功能入口。
- Music Dock：胶囊形多功能控制条。

它们不需要变成相同的外形，但应该属于同一个“浮动玻璃控件”家族：

- 相同的背景透明度层级；
- 相同的 border 色阶和亮度；
- 相同的 shadow 方向与扩散逻辑；
- 相同的 hover、active、focus-visible 反馈；
- 相同的圆角几何规则。

### 3.2 保留现有功能

本次只调整视觉和浮动控件的动效协调，不改变：

- Music Dock 默认关闭；
- 播放、暂停、上一首、下一首、关闭按钮和四首歌循环；
- 关闭 Music Dock 时暂停音乐；
- Chat Launcher 打开聊天面板；
- Chat 面板的 route close、manual close、focus restore 和 shared-layout 行为；
- Chat 面板的主题切换防穿透逻辑；
- Music Dock 与 Gallery 视频播放之间的暂停联动；
- z-index 层级和响应式布局语义。

## 4. 推荐的统一设计 Token

第一版建议把浮动控件的共同视觉值集中定义为应用级 token，可以放在 `css/tailwind.css`，也可以在 `components/site/` 下抽成只负责 class/style 的小型共享常量。不要把这些值散落在两个组件里。

建议先以以下区间作为视觉校准起点，最终数值以浏览器实测为准：

| Token | Light | Dark | 说明 |
| --- | --- | --- | --- |
| surface background | white / 70–76% | gray-950 / 64–72% | 两个控件使用同一透明度层级 |
| backdrop blur | 20–24px | 20–24px | 统一为 `backdrop-blur-xl` 附近，不让一个明显更“雾” |
| border | gray-200 / 60–70% | white / 10–14% | 细而可辨，不形成额外方框 |
| shadow | black / 10–14% | black / 30–40% | 阴影颜色随主题变化，扩散保持接近 |
| hover surface | 比默认亮一档 | 比默认亮一档 | 不靠突然增加透明度制造 hover |
| focus ring | primary 色 | primary 色 | 两个入口控件保持相同可见度 |

这里的百分比是设计起始值，不是必须机械照抄的 Tailwind 类名。最终要同时检查浅色、深色、纯色背景和有流星/卡片内容的背景。

### 4.1 不要把 ChatSurface 面板直接当成公共 token 样本

聊天面板目前有 Safari / iOS 主题切换防穿透逻辑：`html.theme-transitioning [data-chat-surface]` 会临时改成 opaque 背景并关闭 backdrop filter。这个行为必须继续保留。

所以推荐分两层：

- `floating-control`：供 Chat Launcher 和 Music Dock 使用的视觉 token。
- `chat-surface`：聊天面板继续保留自己的内容面板语义和主题切换 workaround，可共享颜色变量，但不能无条件共享透明度行为。

## 5. 形状与尺寸方案

### 5.1 Chat Launcher

- 继续使用圆形：`border-radius: 9999px`。
- 继续使用当前移动端约 44px、桌面端约 48px 的尺寸，除非视觉校准证明需要微调。
- 圆形按钮的 border、background、shadow 与 Dock 外层统一。
- 图标和状态圆点不参与外层玻璃 token 的计算。
- 必须保留明确的 inline `borderRadius` 或等效 Motion style，避免 Framer Motion projection / WebKit 下出现方形边框。

### 5.2 Music Dock

推荐保留胶囊形，但把圆角改为“高度的一半”规则：

- Dock 外层使用 `border-radius: 9999px` 或等效的 `rounded-full`。
- Dock 的可见高度由 padding 和 control size 决定，不再依赖外层 `scale-75` 缩放整个 border surface。
- 内部每个播放控制按钮仍可使用圆形 hit area。
- 信息区、分隔线和控制按钮沿同一垂直中心线对齐。

去掉 `scale-75` 是推荐方向，因为 transform scale 会同时缩放 border、圆角、阴影和 focus ring，使 Dock 与 48px Launcher 难以建立稳定的尺寸关系。若现有布局必须保留视觉宽度，应改为直接控制 Dock 的 padding、gap、字体和控制区尺寸，而不是缩放完整 surface。

### 5.3 几何关系

推荐建立一组简单关系，而不是让两个控件使用互不相关的数值：

```text
Chat Launcher：圆形，直径 = control size
Music Dock：胶囊形，高度 ≈ control size
Dock 内部按钮：直径 ≤ Dock 高度 - 8px
外层 border-radius：始终 >= 外层高度 / 2
```

这样 Dock 虽然是横向胶囊，仍会和圆形 Launcher 共享同一套端点曲率和视觉重量。

## 6. 位置与层级

两个控件仍保持现在的职责位置：

- Music Dock：底部居中，`z-50`。
- Chat Launcher：右下角，`z-[60]`，移动端继续考虑 safe-area inset。

可以统一使用同一个底部安全区变量，例如：

```css
--floating-control-bottom: max(1rem, env(safe-area-inset-bottom));
```

但不应因此改变两者的相对位置或让 Dock 覆盖聊天按钮。移动端需要确认：

- Dock 展开时不会贴住或遮住 Chat Launcher；
- Chat 打开后现有覆盖/隐藏语义不变；
- iOS Safari 和微信内置浏览器不会出现额外的透明方框。

## 7. 动效统一方案

### 7.1 共同的出现/消失节奏

两个浮动控件可以共享同一组基础动效参数：

- 普通状态：约 160–220ms，`ease-out`；
- 初始出现：轻微 `opacity + translate/scale`，不要使用明显弹跳；
- reduced motion：去掉位移和缩放，只保留即时显示或极短透明度变化。

### 7.2 保留各自的交互动效

- Chat Launcher 保留点击打开、hover 和 tap 的反馈，以及 Chat Panel 的 shared-layout 动画。
- Music Dock 保留播放条展开/收起和 DockIcon 的 hover magnification；但外层出现、内部内容进入应使用同一节奏。
- 不要让两个控件共享同一个 `layoutId`，也不要把 Music Dock 纳入聊天面板的 shared-layout。
- 不要用全局 `scroll-behavior`、全局 transition 或全局 opacity 规则影响页面其他元素。

### 7.3 关闭 Music Dock

关闭按钮的语义保持不变：

1. 先暂停全局 audio；
2. 更新播放状态；
3. 播放条按统一的 exit 动效收起；
4. 再次播放时重新出现。

动画期间不能出现“Dock 已透明但音频仍在播放”的状态错觉，也不能因为统一 token 把关闭按钮做得不易发现。

## 8. 推荐实施步骤

### Phase 1：建立视觉基线

1. 截取当前桌面、手机、浅色、深色四组基线。
2. 记录两个控件的实际 computed style：background、backdrop-filter、border、shadow、border-radius、width、height 和 transform。
3. 分开记录“背景透出程度”和“透出内容清晰度”，不要用“看起来糊”作为唯一指标。

### Phase 2：抽取公共浮动控件 token

1. 在应用级 CSS 或共享常量中定义公共 surface token。
2. 让 Music Dock 外层和 Chat Launcher 使用同一组 surface、border、shadow、focus 规则。
3. ChatSurface 面板只复用安全的颜色变量，保留现有 `theme-transitioning` opaque workaround。

### Phase 3：修正几何与外层缩放

1. Chat Launcher 继续使用圆形和当前响应式尺寸。
2. Music Dock 改为直接控制尺寸，移除或替代外层 `scale-75`。
3. Dock 改为与高度匹配的胶囊圆角。
4. 检查内部 icon hit area、信息区和分隔线不会因为尺寸调整而拥挤。

### Phase 4：对齐动效

1. 统一浮动控件的 enter/exit 时长和 easing。
2. 保留 Chat Launcher ↔ Chat Panel 的原生 shared-layout 行为。
3. 保留 Music Dock 的 magnification 和播放状态转换。
4. 对 reduced-motion 单独验证，确保没有残留缩放或位移。

### Phase 5：回归验证

1. 先在本地 Worker 观察首页、Gallery、FNDS、About。
2. 检查浅色/深色主题、桌面/移动端和 safe-area。
3. 检查 Chat Launcher 打开/关闭、Music Dock 播放/暂停/关闭。
4. 检查主题切换时聊天面板仍不会穿透。
5. 检查页面导航、Gallery 视频播放、聊天 Realtime 和音频播放没有行为回归。

## 9. 验收标准

### 9.1 视觉

- Music Dock 与 Chat Launcher 看起来属于同一套玻璃控件系统。
- 两者的背景透出程度接近，不再出现一个明显“实”、另一个明显“空”的感觉。
- 两者的模糊强度接近，背景内容的清晰度差异不应成为视觉焦点。
- border 的亮度、粗细和 shadow 扩散基本一致。
- Dock 胶囊端点与 Launcher 圆形具有相同的圆润程度。
- Chat Launcher 在 iOS Safari / 微信内置浏览器下仍是圆形，没有方形玻璃边框。

### 9.2 行为

- Music Dock 初始仍保持关闭。
- 播放后 Dock 正常出现，四首歌循环不变。
- 关闭 Dock 会暂停音乐，再次播放可以重新打开。
- Chat Launcher 的打开、手动关闭、Escape、route close 和焦点行为不变。
- Chat 面板主题切换期间仍不会出现背景穿透。
- Gallery 播放视频时 Music Dock 仍按现有逻辑暂停。

### 9.3 响应式与可访问性

- 至少验证 375×667、390×844、430×932、667×375、768px+ 和 1024px+。
- 移动端考虑 safe-area，控件不被底部手势区域遮挡。
- 两个控件都有清晰的 `focus-visible` 状态。
- reduced-motion 下不出现不必要的缩放、位移或延迟。
- 不产生页面级横向滚动。

## 10. 代码范围建议

首选修改：

- `components/site/MusicDock.tsx`
- `components/chat/chat-launcher.tsx`
- `components/chat/chat-surface.tsx`（只有在需要抽取安全共享 token 时）
- `css/tailwind.css`（如果采用 CSS token）

不应修改：

- `contexts/SongContext.tsx` 的播放队列语义；
- `components/chat/floating-chat.tsx` 的 conversation / realtime / route close 状态机；
- `components/chat/chat-panel.tsx` 的消息、发送和滚动逻辑；
- Turnstile、D1、Durable Object、API 和迁移；
- 第三方 UI 源码或新增依赖。

## 11. 风险与回滚

主要风险：

- backdrop-filter 在 Safari / 微信内置浏览器中的合成结果与 Chromium 不同；
- 去掉 Music Dock 的 `scale-75` 可能改变其占用宽度，需要通过内部 spacing 校准；
- 统一 surface token 可能影响主题切换期间的 ChatSurface，如果误把 control token 直接套到面板上，可能重新引入透明穿透；
- Motion projection、border-radius 和 transform 叠加可能再次产生方形边框或残留 transform。

回滚方式：按阶段回退公共 token、Dock 外层尺寸和动效修改即可，不涉及数据或数据库变更。本改造不需要新增 migration，也不需要修改 Cloudflare 绑定。

## 12. 最终交付物

- 一套可复用的浮动玻璃控件视觉 token；
- 统一后的 Music Dock 与 Chat Launcher 形状、透明度、模糊、border 和 shadow；
- 保留各自职责的胶囊 Dock 与圆形聊天入口；
- 桌面、移动端、浅色、深色及 reduced-motion 验证记录；
- 主题切换、聊天状态、音频播放和页面导航回归结果。
