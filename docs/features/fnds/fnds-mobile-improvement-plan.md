# FNDS 页面移动端改进方案

- 目标分支：cloudflare-worker-DEV
- 页面：/fnds
- 改动类型：移动端布局 + 拖拽边界优化
- 核心交互：底层文案保持被照片覆盖，用户拖开照片后才逐步看到 NOW IS / THE ONLY / REALITY

## 1. 页面目标

FNDS 不做成普通图片列表，也不把移动端改成纵向 Gallery。

页面核心仍然是：

进入页面
↓
看到一叠互相覆盖的演出 / 现场照片
↓
照片可自由拖动
↓
逐张拨开照片
↓
底层文案逐渐露出
↓
NOW IS
THE ONLY
REALITY

移动端改造的目标不是把当前桌面布局等比缩小，而是让照片的遮挡和散落看起来是“有意设计的照片堆”，而不是因为 viewport 太窄产生的随机溢出。

核心目标：

- 保留“拖开照片才能看到最后一句话”的 reveal 交互。
- 手机首屏中 7 张卡片形成稳定、集中的 photo deck。
- 初始状态下底层文案不能完整阅读。
- 用户拖开卡片后，文案能够自然、逐步出现。
- 卡片拖动后仍保持在可操作区域内，不因为一次甩动永久消失到 clipping 区域。
- Desktop 保留当前自由散落的大尺寸 draggable card 体验。
- 第一阶段不修改全站 Header / SectionContainer 的视觉规则，避免 FNDS 优化影响其他页面。
- 不增加新的动画或手势依赖，继续使用现有 Framer Motion + Tailwind CSS。

## 2. 当前实现

当前页面：

    app/fnds/page.tsx

使用：

    DraggableCardContainer
    └─ DraggableCardBody × 7

卡片数据直接在页面中定义：

    const items = [
      {
        title: '致明日的舞',
        image: ...,
        className: 'absolute top-10 left-[20%] rotate-[-5deg]',
      },
      ...
    ]

当前每张图片固定为 320 × 320。

DraggableCardBody 默认：

- w-80
- min-h-96
- p-6

也就是说，在约 375～430px 宽的手机 viewport 中，一张卡片本身已经占据大部分可用宽度，再叠加：

- left-[20%]
- left-[40%]
- left-[55%]
- right-[35%]

这类桌面百分比定位后，卡片很容易大面积跑出可视区域。

## 3. 当前移动端主要问题

### 3.1 卡片尺寸和位置使用同一套桌面逻辑

当前 7 张卡片使用固定 320px 图片尺寸以及桌面绝对定位。

在 Desktop 上：

    大画布 + 大卡片 + 大范围散布

是合理的。

但在 Mobile 上会变成：

    窄画布 + 大卡片 + 仍然大范围散布

因此视觉结果不是“照片堆”，而是：

- 卡片大量截断
- 页面视觉重心偏左 / 偏右
- 多张卡片只有一部分留在 viewport
- 用户难以判断哪些卡片还可以继续拖
- 底层文案的 reveal 关系不稳定

### 3.2 文案层级逻辑正确，但移动端位置缺少专门设计

底层文案：

    FEAR and DREAMS
    NOW IS
    THE ONLY
    REALITY

本来就应该被卡片遮挡。

移动端不应该把这段文案移到顶部，也不应该为了“可读性”让它初始完整出现。

需要调整的是照片如何盖住文字，而不是如何让文字避开照片。

### 3.3 Drag constraints 与实际可视容器不一致

当前 DraggableCardBody 根据：

- window.innerWidth
- window.innerHeight

构造相对 drag constraints。

但真正能显示卡片的区域是：

    DraggableCardContainer
    + overflow-clip

两者不是同一个边界。

结果是：

    拖拽允许范围
        ≠
    真正可见范围

在手机上尤其容易出现卡片被拖到 clipping 区域后很难重新找回。

## 4. 移动端最终构图

Mobile 不采用列表，而采用集中式 photo deck。

初始结构：

                 FEAR and DREAMS

              ╱────────────────╲
           ╱────────────────╲   │
         ╱────────────────╲  │  │
        │                  │ │  │
        │      PHOTO       │ │  │
        │                  │ │  │
        │       TITLE      │ │  │
        ╲──────────────────╱ │  │
          ╲──────────────────╱  │
            ╲───────────────────╱

                  NOW IS
                 THE ONLY
                  REALITY

         ↑ 实际位于照片堆最底层

这里的文字不是放在照片下方。真正的 stacking 关系应该是：

    z-10  photo card
    z-10  photo card
    z-10  photo card
    ...
    z-0   NOW IS / THE ONLY / REALITY

进入页面时允许露出少量黄色笔画或边缘，但不能直接完整阅读整句话。

拖开第一两张照片后开始看到局部文字；继续拖开后：

    NOW IS
    THE ONLY
    REALITY

逐渐完整出现。

## 5. 响应式策略

第一阶段以 Tailwind sm 作为 FNDS 构图区分点。

### Mobile < 640px or short viewport

使用专门 photo deck：

- 卡片宽度约 80vw
- 最大约 300px
- 横向位置集中
- rotation 控制在约 ±2°～±6°
- 纵向轻微错层
- 底层文字放在 deck 几何中心附近

短屏（`max-height: 520px`，例如手机横屏）也进入这套移动布局判断，避免
`sm` 宽度样式在高度不足时启用大卡片。

### Desktop / Tablet >= 640px（且高度充足）

继续使用当前散落布局：

- w-80
- 320 × 320 image
- 现有 absolute positions
- 现有 rotation
- 现有大范围拖拽体验

原则：

    mobile = intentional deck
    sm+    = existing scattered canvas

不因为这次移动端改造重新设计 Desktop。

## 6. 卡片尺寸

### 6.1 Mobile

推荐卡片外层：

    w-[80vw]
    max-w-[300px]
    min-h-0
    p-3

图片：

    aspect-square
    h-auto
    w-full
    object-cover

标题：

    mt-2
    text-lg

图片 sizes：

    sizes="(max-width: 639px) 80vw, 320px"

### 6.2 sm+

恢复：

    sm:w-80
    sm:max-w-none
    sm:min-h-96
    sm:p-6

图片恢复：

    sm:h-80
    sm:w-80

标题恢复：

    sm:mt-4
    sm:text-2xl

### 6.3 原因

不建议把 Mobile 卡片缩到 60vw 左右。

FNDS 的核心需要照片真正盖住底层文案，因此卡片仍然需要较大。

推荐区间：

    75vw ~ 82vw

第一版以 80vw / max 300px 作为基准。

## 7. Mobile 卡片位置

移动端不继续使用 Desktop 的大范围百分比位置。

建议把 7 张卡片的横向起点限制在约 6%～16%，纵向位置限制在约 18%～32%。

推荐第一版参数：

| Card | Mobile Top | Mobile Left | Rotation |
| --- | ---: | ---: | ---: |
| 致明日的舞 | 18% | 8% | -4° |
| Melody | 27% | 13% | -6° |
| 我们 | 20% | 16% | +5° |
| 杭州站 | 30% | 10% | +6° |
| 任我行 | 24% | 6% | +2° |
| 澳门8.3 | 32% | 15% | -5° |
| 忽然007 | 22% | 12% | +3° |

这些值不是最终视觉常量，实际需要在真实 iPhone viewport 中微调。

代码继续保持静态 Tailwind class，不生成动态 class name。

示例：

    {
      title: '忽然007',
      image: mediaUrl('fnds/07-hu-ran-007.jpg'),
      className:
        'absolute top-[22%] left-[12%] rotate-[3deg] sm:top-8 sm:left-[30%] sm:rotate-[4deg]',
    }

Desktop 值直接保留现有设置。

## 8. 底层文案

### 8.1 不改变 reveal 设计

明确不做：

- 把文字移到顶部
- 把文字移到照片外面
- 让文字默认完整可见

底层文字必须继续是照片后的隐藏内容。

### 8.2 明确 z-index

文案容器：

- pointer-events-none
- z-0
- select-none

卡片：

- z-10

不要只依赖 DOM 顺序表达设计意图。

### 8.3 Mobile 文字位置

建议：

    top-[48%]
    -translate-y-1/2

sm+ 恢复当前：

    sm:top-1/2
    sm:-translate-y-3/4

目的不是让文字更容易看到，而是让文字中心和移动端 photo deck 中心对齐。

### 8.4 Mobile 字号

推荐使用 clamp()，避免 375px 和 430px 设备差异过大：

    text-[clamp(2.7rem,13vw,3.4rem)]
    leading-[0.92]

sm+ 恢复：

    sm:text-7xl
    sm:leading-tight
    lg:text-[6rem]

继续保留：

- Oswald
- #FBF050
- uppercase
- SquigglyText REALITY

## 9. 拖拽边界

这是本次移动端改进里除了布局之外最重要的部分。

### 9.1 目标

卡片应该：

- 可以明显被拨开
- 可以移动到文字两侧
- 可以部分叠在其他卡片上
- 不能轻易永久飞出页面
- orientation / viewport resize 后仍使用新的实际边界

### 9.2 推荐方案

移动端使用 FNDS 内部的扩展约束区域作为 Framer Motion constraints。这个区域不参与
视觉渲染，且比可视容器向外扩展，因此卡片允许部分出界，但仍会保留可再次抓取的区域；
不能把卡片强制完整限制在 `overflow-clip` 的可视框内，否则 375×667 无法清空文案中心。

约束区域的扩展量按卡片实际尺寸计算，而不是按容器百分比计算：普通 Mobile 以约
300px 卡片和 72px 抓取尺寸计算，短屏/横屏以约 220px 卡片和 68px 抓取尺寸计算。
72px / 68px 包含旋转、缩放和边缘弹性造成的视觉余量，实际边缘仍保留约 64px 的
可抓取区域，因此卡片不会因为宽容器而完全滑出 clipping 区域。

结构：

    DraggableCardContainer
    ├─ expanded mobile constraints (invisible)
       ├─ background copy
       ├─ card
       ├─ card
       └─ ...

DraggableCardBody 增加一个可选约束 ref：

    type DraggableCardBodyProps = {
      className?: string
      children?: React.ReactNode
      constraintsRef?: React.RefObject<HTMLElement | null>
    }

Motion：

    <motion.div
      drag
      dragConstraints={constraintsRef}
    />

如果共享组件还需要保留旧行为，则：

- 移动端 → 使用扩展的 FNDS 约束区域
- sm+ 且高度充足 → 不传 constraintsRef，保留原来的 window-based fallback

这样 FNDS 可以修正边界，同时避免无意改变其他潜在调用方。

当布局模式在 Mobile 与 Desktop 之间切换时，FNDS 会重新挂载卡片以清除旧布局的
Framer Motion transform；这样桌面端已经拖到视口外的卡片切回手机后不会落在新的
不可抓取区域。普通手机横竖屏切换仍保留卡片 transform，因为实测其新约束区域会
保留抓取区，不需要额外的方向状态系统。

### 9.3 Drag momentum

第一阶段不需要新增复杂“甩牌”物理效果。

优先目标是：

    可控 > 夸张惯性

可以先使用 Framer Motion 默认 drag 行为，并通过真实 container constraints 限制范围。

如果真实设备验证后仍然容易甩到边缘，再考虑：

    dragElastic={0.05}

或关闭 / 降低 momentum。

不要第一版同时修改过多 spring 参数，否则难以判断问题来自 layout 还是 gesture physics。

## 10. 3D Tilt / Hover

当前卡片通过：

- onMouseMove
- rotateX
- rotateY
- glare

提供桌面 hover tilt。

移动端没有 mouse hover，因此：

- 不需要专门模拟 touch tilt
- 不增加 device orientation / gyroscope
- touch 只负责 drag

Desktop 继续保持现有效果。

这次改造只解决：

- layout
- stacking
- constraints

不扩大到新的 3D 手势系统。

## 11. Page Container

当前全站页面通过 SectionContainer：

    max-w-3xl
    px-4
    sm:px-6
    xl:max-w-5xl

第一阶段不修改它。

也不建议一开始就在 FNDS 使用：

    -mx-4
    w-[calc(100%+2rem)]

做 full-bleed。

原因：

- 当前主要问题来自卡片尺寸和定位，不是 16px page padding
- full-bleed 会增加 iOS 横向 overflow 风险
- 真实 constraints 更容易和现有 container 对齐

如果第一阶段完成后仍觉得两侧留白明显，再单独评估 FNDS page-level full-bleed。

## 12. Header

当前 Header 在 mobile 仍使用较大的垂直 padding。

这会占用一定首屏空间，但本次 FNDS 优化不直接修改全局 Header。

原因：

- Header 是全站组件
- FNDS 是单页视觉问题

如果后续要缩小 mobile Header：

    py-10 → py-5 sm:py-10

应该作为独立的全站响应式调整验证 Blog / Gallery / About / Admin，而不是夹在 FNDS 页面改动里。

## 13. 推荐文件改动

第一阶段预计修改：

    app/fnds/page.tsx
    components/magicui/draggable-card.tsx
    css/tailwind.css

文档：

    docs/features/fnds/fnds-mobile-improvement-plan.md

### app/fnds/page.tsx

负责：

- Mobile / Desktop 两套位置 class
- Mobile card size overrides
- 图片 responsive size
- 文案 z-index
- 文案 Mobile position / font size
- 将 container ref 传给卡片

### components/magicui/draggable-card.tsx

负责：

- 支持真实 container constraints
- 保留共享组件默认行为
- 不在这里写 FNDS 专属尺寸和 breakpoint

原则：

- 通用 drag 能力 → draggable-card.tsx
- FNDS 视觉参数 → app/fnds/page.tsx

## 14. 推荐实现顺序

### Step 1：移动端卡片尺寸

只调整：

- card width
- padding
- image sizing
- title sizing

验证：

- 375px 不横向 overflow
- 390px / 393px 卡片比例正常
- Desktop 与当前一致

### Step 2：移动端 photo deck 坐标

为 7 张卡片加入：

- mobile top
- mobile left
- mobile rotation

sm+ 恢复当前坐标。

验证首屏构图。

### Step 3：底层文字位置和层级

明确：

- copy z-0
- cards z-10

微调 mobile copy center。

验证：

- 初始不可完整阅读
- 拖开后逐步出现

### Step 4：真实 drag constraints

增加 container ref。

验证：

- 上下左右拖动
- 快速甩动
- 多卡连续拖动
- viewport resize
- 横竖屏切换

### Step 5：真实设备微调

最后再调整：

- top / left / rotate

不要在 constraints 修复前过度微调位置，因为边界行为变化会影响最终位置。

## 15. Mobile 测试矩阵

至少验证以下 viewport：

- 375 × 667
- 390 × 844
- 393 × 852
- 430 × 932

并验证：

- 768px+
- 1024px+

确认 Desktop 没有 regression。

真实浏览器优先验证 iPhone Safari / Chrome iOS 的触控体验。

## 16. 验收标准

### 16.1 首屏

Mobile /fnds 打开后：

- 7 张照片看起来是一叠主动设计的卡片，而不是随机截断
- 主体视觉基本落在 viewport 中间区域
- 不产生页面级横向滚动
- 卡片允许轻微超出边缘，但主要内容仍然可识别
- NOW IS / THE ONLY / REALITY 位于卡片后方
- 初始状态下整句话不可完整读取

### 16.2 Reveal

拖开卡片：

    1~2 张
       ↓
    出现局部黄色文字
       ↓
    继续拖动
       ↓
    句子逐步完整

最终用户可以完整看到：

    NOW IS
    THE ONLY
    REALITY

这才是页面成功状态。

### 16.3 Drag

- 每张卡都可独立拖动
- touch drag 不明显卡顿
- 卡片不会轻易永久消失在 viewport 外
- 卡片拖到边缘后仍可再次抓取
- 多张卡叠在一起时仍能继续逐张整理
- orientation change 后没有明显错误边界

### 16.4 Desktop regression

sm+：

- 当前卡片尺寸保持
- 当前散落位置保持
- 当前 rotation 保持
- tilt / glare 保持
- SquigglyText 保持
- Desktop 拖拽体验不因为 Mobile CSS 被缩小或集中

## 17. Accessibility / Motion

FNDS 是强视觉交互页面，但仍需要满足基本规则。

### Reduced Motion

当前 tilt / spring 可以继续沿用项目现有行为。

如果后续发现 prefers-reduced-motion 下仍然有明显大幅 motion，再单独增加：

    reduced motion → 减少 tilt / spring

这不是本次 Mobile layout 的 blocker。

### Touch target

整张卡片本身就是大型 drag target，不需要增加额外拖拽 handle。

### 文案

底层文案使用：

    pointer-events-none

确保用户拖到文字区域时不会被文字层阻塞。

## 18. 性能

本次不增加图片数量和新媒体资源。

继续使用：

- /media/fnds/*
- mediaImageLoader
- Next Image
- Cloudflare Images card variant

图片仍按响应式 sizes 告诉浏览器实际显示宽度，避免 Mobile 按固定 320px 语义处理所有场景。

不增加：

- gesture library
- masonry library
- carousel library
- device orientation listener
- canvas / WebGL

Framer Motion 已经满足当前需要。

## 19. 暂时不做

第一阶段明确不做：

- 把 FNDS 改成移动端纵向图片列表
- 把底层文案放到照片上方
- 进入页面时直接完整显示最终文案
- Mobile carousel
- swipe 自动翻下一张
- 双指缩放
- gyroscope 3D tilt
- 卡片自动归位
- Reset 按钮
- full-bleed container
- 全站 Header 尺寸调整
- FNDS 独立 layout
- 新动画依赖

这些都不是当前“不协调”的根因。

## 20. 第一阶段完成范围

实现完成后应达到：

- Mobile card 宽度改为响应式尺寸
- Mobile image 使用 w-full + aspect-square
- Mobile title 缩小
- 7 张卡增加 Mobile 专用位置
- sm+ 保持当前 Desktop 坐标
- 底层文案显式 z-0
- 卡片显式位于文案之上
- Mobile 文案中心与照片堆中心对齐
- Mobile 使用按卡片尺寸扩展的 FNDS 约束区域作为 drag constraints：约束边界按“卡片宽/高减去带视觉变换余量的抓取尺寸”向外扩展，普通 Mobile 使用 72px 约束抓取尺寸、短屏/横屏使用 68px，实测边缘仍保留约 64px 可抓取区域；不按容器百分比扩展，避免卡片完全消失
- sm+ 且高度充足时保留原来的 window-based drag constraints fallback
- 短屏横屏使用 compact card 样式
- 无页面级横向 overflow
- 375 / 390 / 393 / 430 宽度通过
- Desktop regression 通过
- 本地 Worker + 浏览器实际拖拽验证通过

## 21. 最终产品定位

FNDS Mobile 最终不是：

    Responsive Photo Grid

也不是：

    缩小版 Desktop Canvas

而是：

    Interactive Photo Deck
    Hidden Message Reveal

核心体验必须保持：

    看到照片
       ↓
    意识到照片可以拖
       ↓
    开始拨开
       ↓
    发现下面有黄色文字
       ↓
    继续整理照片
       ↓
    NOW IS
    THE ONLY
    REALITY

移动端优化的判断标准不是“所有内容一开始都看得见”，而是：

- 初始遮挡是否有意图
- 拖动过程是否顺手
- 最终 reveal 是否足够清晰

这三个条件同时成立，FNDS 在手机上的布局才算完成。
