# Floating Glass Chat Widget 实施方案

## 1. 本期目标

在全站右下角加入一个 Floating Glass Chat Widget，并推进为匿名留言 V1：

- 圆形 launcher 与聊天面板之间使用 shared-layout morph 动画。
- 提供 header、消息列表、输入框和匿名留言交互；不伪造 owner/assistant 回复。
- 支持桌面端、移动端、明暗主题、键盘操作和 reduced-motion。
- 留言通过同源 API 进入 Cloudflare Worker，使用 D1 持久化、访客 Cookie、Turnstile 和 Workers
  Rate Limiting；不接 Workers AI、OpenAI、登录、文件上传或语音功能。

## 2. 已确认的项目现状与决策

- 项目是 Next.js 15 App Router、TypeScript、Tailwind CSS 4、next-themes。
- lucide-react 已安装，直接复用。
- framer-motion 已安装且已有组件使用；本期直接复用，不另装 motion，避免两套动画库并存。
- cn() 已存在于 components/lib/utils.ts。
- 已有部分 shadcn 风格 UI，但没有 components.json；只引入聊天所需的源码，不重新初始化整套 shadcn。
- app/layout.tsx 保持服务端组件，只挂载一个独立的 use client 聊天组件。
- MusicDock 固定在底部中央并使用 z-50；聊天层使用 z-60，移动端打开聊天时可能覆盖它，必要时通过状态隐藏 MusicDock。

## 3. 第三方组件策略

### Cult UI FloatingPanel

本期先参考 Cult UI FloatingPanel 的官方 API 和实现，不直接安装或复制它的默认浮层源码。
原因是当前项目已经使用 framer-motion，而 Cult UI 默认实现同时包含自己的 transform、外部点击
关闭和 modal 语义；直接叠加会增加 shared-layout 冲突和行为偏差。当前实现用项目内的轻量
open/close 状态和定位层承接需求，后续如果需要拖拽、可调整尺寸或更完整的 panel primitive，
再单独评估接入 Cult UI。

动画职责明确分工：

- floating-chat.tsx：open/close 状态、键盘行为和焦点回退。
- framer-motion：launcher 与 panel 的几何 morph、内容淡入淡出。
- ChatSurface：CSS glass 视觉层；不把高成本 filter 动画带入交互状态。

### shadcn Chat Components

只采用聊天滚动和消息展示所需的源码组件：

- MessageScroller
- Message
- Bubble

不引入 AI SDK、附件、tool calls、reasoning 或 markdown renderer。消息状态由本项目自己的
ChatMessage[] 管理。

### Glass Surface

通过 ChatSurface 封装玻璃视觉层。优先使用轻量 CSS glass：半透明背景、backdrop blur、
细边框和受控阴影。如果 React Bits Glass Surface 的 filter 成本高、Safari 表现差或与主题
冲突，直接切换到 Tailwind fallback，不让聊天逻辑依赖视觉组件。

## 4. 目标文件结构

components/chat/

- floating-chat.tsx：open 状态、LayoutGroup、surface 切换和真实匿名留言提交
- chat-launcher.tsx：圆形入口按钮
- chat-panel.tsx：panel、header、messages、composer 布局
- chat-header.tsx：标题、状态和关闭按钮
- chat-messages.tsx：MessageScroller、Message、Bubble
- chat-composer.tsx：textarea、Enter/Shift+Enter、发送按钮
- chat-surface.tsx：glass 视觉层和 fallback
- chat-types.ts：ChatMessage 类型

如采用 shadcn registry，则将必要源码放到 components/ui/message-scroller.tsx、
components/ui/message.tsx 和 components/ui/bubble.tsx。

## 5. 具体实施步骤

### Step 1：基础组件与类型

1. 创建 `components/chat/`，并定义前端展示所需的 `ChatMessage` 类型；服务端 DTO 另见
   `components/chat/chat-types.ts`。
2. 复用现有 framer-motion、lucide-react、cn()，不重复安装动画库。
3. 通过 `app/api/chat/`、`lib/chat/` 和 `migrations/0001_chat.sql` 接入匿名留言 V1 的服务端链路。
4. 通过 `wrangler.jsonc` 绑定 D1、Rate Limiting、Turnstile Secret、R2 和 Workers AI；后两者不是本期聊天
   运行时依赖。

### Step 2：Launcher 与 shared-layout morph

1. launcher 使用 fixed right-4 bottom-4，桌面端使用 sm:right-6 sm:bottom-6，并为移动端
   预留 safe area。
2. desktop 约 56px，mobile 约 52px。
3. 使用 LayoutGroup id="floating-chat"，避免全站 layoutId 冲突。
4. launcher 和 panel surface 共享 layoutId="floating-chat-surface"。
5. hover 使用轻微 scale/glow，tap 使用短 spring；不使用持续 bounce、旋转或高频 pulse。
6. surface 几何动画只由 framer-motion 负责。

### Step 3：Panel、Header 与消息区

1. desktop 尺寸约 380px × 560px，最大不超过约 420px 宽。
2. mobile 在 640px 以下使用左右 12px 边距，高度使用 min(72dvh, 620px)，并考虑
   env(safe-area-inset-bottom)。
3. panel 不锁定 body 滚动，也不默认点击外部关闭。
4. header 只保留一个明确的 close control，使用 X 图标。
5. 消息区使用 flex-1、min-h-0、overflow-hidden。
6. assistant 左对齐，user 右对齐；消息宽度不超过 80–85%，不使用尖角气泡。
7. 初始只放一条简短 greeting，保持空白和层次感。

### Step 4：Composer 与真实匿名留言提交

1. 使用 textarea，最小高度约 48px，最大高度约 120px，随内容增长。
2. Enter 提交，Shift+Enter 换行。
3. 空内容时禁用发送按钮。
4. 提交时 trim，先获取 Turnstile token，再 POST `/api/chat/messages`；只把服务端返回的留言追加到列表，
   不追加本地假 assistant 回复。
5. 使用 `chat_visitor` Cookie 维持当前匿名会话；历史通过 GET `/api/chat/conversation` 恢复。

### Step 5：滚动与焦点

1. 优先使用 MessageScroller 自身的滚动能力。
2. 新消息进入时滚动到底部；用户阅读旧消息时不因每次更新强行拉回。
3. 桌面端打开后延迟 100–200ms 聚焦 textarea；移动端不自动 autofocus。
4. 关闭后将焦点返回 launcher。

### Step 6：主题、可访问性与性能

1. 复用 next-themes 的 class dark mode，不新增主题状态。
2. launcher 添加 aria-label、aria-expanded、aria-controls；textarea 添加可见或屏幕阅读器 label。
3. 消息区域使用合适的 live announcement，避免重复朗读整段历史。
4. 支持 Esc、键盘可达、focus-visible 和按钮语义。
5. 使用 reduced-motion 检测，降低为简单 fade/scale。
6. 不做持续大面积 blur 动画、WebGL、shader、鼠标跟随 distortion 或每帧 box-shadow 修改。

### Step 7：全局集成

在 `app/layout.tsx` 的 ThemeProviders 内挂载 FloatingChat，但不把 root layout 改为 client
component。聊天层使用 z-[60]，并验证与 Header、MobileNav、MusicDock 的层级关系；服务端接口统一
通过当前 Worker 同源访问。

## 6. 需要特别验证的风险

1. Cult UI 默认内容动画和 layoutId 同时生效时是否产生双重 transform；如有问题，以 Motion
   为唯一几何动画 owner。
2. AnimatePresence mode="wait" 只用于内部内容，不能阻断 launcher/panel 的 shared-layout。
3. 移动端系统键盘打开时，dvh 和 safe-area 是否让 composer 保持可见。
4. 移动端聊天面板覆盖 MusicDock 是否影响使用；打开聊天时可暂时隐藏 MusicDock。
5. backdrop blur 在 Safari 中是否可用；确保半透明背景仍有可读性。
6. 第三方源码若做了必要修改，必须在最终说明中列出，不直接修改依赖包目录。

## 7. 验证清单

实现后执行：

- node .yarn/releases/yarn-3.6.1.cjs lint
- node .yarn/releases/yarn-3.6.1.cjs build
- npx tsc --noEmit（项目当前没有 typecheck script）

浏览器验证：

- launcher 在 /、/fnds、/about 均可见。
- desktop 展开/关闭无闪烁，约 380×560。
- mobile 不超屏、不自动弹键盘、composer 可见。
- Enter、Shift+Enter、真实留言提交、历史读取和滚动正常。
- Esc、关闭按钮、焦点回退和键盘导航正常。
- light/dark/reduced-motion 均可用。
- body 仍可滚动，聊天不影响 R2 图片和现有音乐功能。

## 8. 完成后的交付说明

最终说明列出：修改文件、依赖变化、组件职责、动画 owner、第三方源码来源/是否修改、
移动端方案、遗留 TODO、启动方式和 Glass Surface fallback。

## 9. 当前实施状态

- [x] 在 `components/chat/` 完成 launcher、panel、header、消息区、composer、glass surface 和类型定义。
- [x] 接入官方 shadcn MessageScroller runtime，并将 Message/Bubble 源码按当前项目的 alias 和 Radix 依赖适配到 `components/ui/`。
- [x] 使用现有 `framer-motion` 完成 `LayoutGroup` + `layoutId` shared-layout morph；未重复安装 `motion`。
- [x] 在 `app/layout.tsx` 全局挂载聊天组件，并接入三个匿名留言 API；不调用 Workers AI。
- [x] 完成历史读取、真实留言提交、结束留言、Enter/Shift+Enter、发送禁用态、Escape 关闭和
      关闭后焦点回退；前端不再追加假回复。
- [x] 完成桌面端和 390px 移动端浏览器验证。
- [x] `node .yarn/releases/yarn-3.6.1.cjs lint`、`node .yarn/releases/yarn-3.6.1.cjs build` 和
      `node .yarn/releases/yarn-3.6.1.cjs worker:build` 通过；现有 `MusicDock` hook warning 未在本期扩大处理范围。
- [x] 接入 D1 migration、访客 Cookie、Turnstile 校验和 Rate Limiting；保留 owner/system 角色供后续回复扩展。
- [x] 配置正式 Turnstile widget 的 site key/secret，并完成 Worker 部署；手机端真实 token 留言写入已验证。
- [ ] 可选回归：重复 token、429、关闭幂等和关闭后新会话；不阻塞当前匿名留言 V1。

说明：直接执行 `npx tsc --noEmit` 仍会被项目生成的 `cloudflare-env.d.ts` 对 `.open-next/worker` 的类型引用触发 TS6307；Next/ OpenNext 的正式构建类型检查已通过，这个生成配置问题应在单独的 Worker 类型配置任务中处理。
