# 匿名留言 V2:Admin 回复与后台(实施方案)

> 建立于 2026-08-16,状态:待评审。目标:访客留言可由 Admin 回复;后台页面仅
> Admin 可见;会话列表、消息查看、回复、分页。组件以集成现成库为主,风格与
> 站内玻璃拟态 + Framer Motion 调性一致。

## 1. 目标与范围

**做**:

- Admin 回复访客留言,回复直接出现在访客的悬浮聊天流中
- `/admin` 独立页面:锁屏 → 控制台(会话列表 / 会话详情 / 回复 / 分页)
- 密钥存 Cloudflare KV(Key=`Admin`,Value=自设密钥),密钥输入在锁屏页完成
- 可选:留言量统计图表

**不做(留待 V3)**:实时推送(WebSocket/SSE,先用访客端重新打开聊天即拉取)、
富文本/图片留言、多管理员、留言星标/备注。

## 2. 现状基础(改动量比预期小)

- `messages.role` 的 CHECK 约束已含 **`'owner'`**(`migrations/0001_chat.sql:20`),
  访客前端 `mapApiMessage` 把非 visitor 消息统一渲染为助手气泡
  (`components/chat/floating-chat.tsx:20-27`)——**Admin 回复零迁移、访客端零改动**
- 游标分页机制现成(`lib/chat/repository.ts` 的 `encode/decodeMessageCursor`)
- `idx_conversations_status_updated` 索引直接支持后台列表排序

## 3. 认证方案(KV 密钥门禁)

### 3.1 资源与密钥

- 新建 KV namespace `solidays-admin`,binding `ADMIN_KV`:
  `wrangler kv namespace create solidays-admin` → 写入 `wrangler.jsonc` →
  `worker:types` 重新生成类型
- 密钥写入(仅 KV,不进仓库、不进命令历史):
  `wrangler kv key put Admin --namespace-id <id>` 交互式输入,本地调试加 `--local`
  后本地写入(`.wrangler/state`,可用单独的本地测试密钥)

### 3.2 会话机制(推荐:签名 Cookie,备选:KV session)

- 登录:`POST /api/admin/session` body `{ key }`
  - 从 `ADMIN_KV` 读 `Admin` 值,**常数时间比较**(不匹配统一 401)
  - 通过后签发 Cookie:`token(32B 随机).HMAC-SHA256(token, secret)`,
    `secret = SHA-256(Admin 密钥值)`,**免新增 Secret、改密钥即全体会话失效**
  - Cookie 属性:`HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=7d`
- 每次请求校验:重算 HMAC 比对(Admin 密钥值用模块级内存缓存,60s TTL,
  避免每请求读 KV,也规避 KV 最终一致性问题)
- 退出:`DELETE /api/admin/session`(前端清 Cookie 即可,签名方案无需服务端状态)
- 备选(需要"服务端踢下线"能力时):KV 存 `session:<sha256(token)>` + TTL,
  缺点是 KV 跨 PoP 最终一致(最长约 60s)可能造成刚登录偶发 401

### 3.3 防护

- 登录接口限流:新增 Workers Rate Limiting binding `ADMIN_LOGIN_LIMITER`
  (5 requests/60s,local 模式本地可测),失败响应与成功响应格式一致防枚举
- 所有 `/api/admin/*` 路由:Origin 校验(复用 `lib/chat/security.ts`)+
  会话校验,统一 401 `ADMIN_UNAUTHORIZED`
- `/admin` 页面本身是静态壳(不含任何数据),数据全部走鉴权 API,无 SSR 泄露;
  `middleware.ts` 可选加一条:无 admin Cookie 访问 `/admin` 时 308 回首页(纯装饰,
  真校验在 API)

## 4. 密钥输入与页面切换(交互设计)

### 4.1 锁屏态(`/admin` 未登录)

居中玻璃卡片(复用聊天面板的 `bg-white/70 dark:bg-white/5` 玻璃质感),背景延续
meteors 流星:

```
┌──────────────────────────────┐
│  (F)  Francis · Admin        │
│  ─────────────────────────── │
│  [ 密钥输入框(password 型) ]  │
│  [ 解锁 → ]  ← Click Spark   │
└──────────────────────────────┘
        ✦ meteors 背景 ✦
```

- 输入框:Enter 或按钮提交;错误时卡片 shake(Framer Motion)+ 红色提示,不区分
  "密钥错误/限流"文案
- 解锁成功:整屏 **Canvas Reveal**(点阵揭示,Aceternity)过渡到控制台,替代生硬跳转

### 4.2 控制台态(已登录)

```
┌ Dynamic Island:Francis · 12 个会话 · ● 3 个有新留言 ┐   ← 顶部吸顶
├──────────────────────────────────────────────────┤
│ [留言趋势 mini chart]  [开放/关闭会话数]            │   ← 可选,shadcn charts
├──────────────────────────────────────────────────┤
│ ┌会话卡片(Tilt Card)┐ ┌会话卡片┐ ┌会话卡片┐        │   ← 悬停 3D 倾斜
│ │访客 #a3f2 · 最后一条预览… 2h│ │…      │ │…     │   │
│ └───────────────────┘ └───────┘ └───────┘        │
│ [ ← 上一页  1/5  下一页 → ]                       │   ← 游标分页
└──────────────────────────────────────────────────┘
```

点击会话卡片 → **AnimatePresence + shared layout** 切到会话详情:

```
[← 返回]  访客 #a3f2 · open · 2026-08-16
┌────────────────────────────┐
│ 消息气泡流(复用 chat 气泡样式, │
│ owner 消息 = 黄色 #FBF050 右侧)│
│ …加载更多(向上分页)…          │
├────────────────────────────┤
│ [回复输入框(复用 ChatComposer │
│  风格)] [发送 ● Click Spark]  │
│ [关闭此会话]                  │
└────────────────────────────┘
```

- 列表 ↔ 详情:桌面端 shared layout 过渡(卡片展开成详情),移动端(单列)用
  slide-in push 过渡
- Dynamic Island 扩展态:点击岛体展示快捷菜单(登出 / 仅看 open / 刷新),
  收起态显示新留言红点
- 回复发送成功:Click Spark 粒子 + 气泡 spring 弹入(与访客端一致)

## 5. API 设计

| 方法与路径 | 作用 | 要点 |
| --- | --- | --- |
| `POST /api/admin/session` | 登录 | 限流 5/60s;常数时间比较;签发 Cookie |
| `DELETE /api/admin/session` | 退出 | 清 Cookie |
| `GET /api/admin/conversations?status=&cursor=` | 会话列表分页 | 每项含访客短 ID、最后一条消息预览、留言数、状态、更新时间;游标 `updated_at:id` |
| `GET /api/admin/conversations/[id]/messages?cursor=` | 会话消息分页 | 直接复用 `listMessages` |
| `POST /api/admin/conversations/[id]/messages` | 回复 | 写入 `role='owner'`,长度 1..2000(同访客校验),更新会话 `updated_at` |
| `POST /api/admin/conversations/[id]/close` | 关闭会话 | 复用现有幂等关闭逻辑 |
| `GET /api/admin/stats`(可选) | 图表数据 | 近 30 天留言量按日聚合 |

列表 SQL 骨架(利用现有索引):

```sql
SELECT c.id, c.visitor_id, c.status, c.updated_at,
       (SELECT content FROM messages m WHERE m.conversation_id = c.id
        ORDER BY created_at DESC LIMIT 1) AS last_message,
       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
FROM conversations c
WHERE (?status IS NULL OR c.status = ?status)
  AND (?cursor_updated_at IS NULL
       OR (c.updated_at, c.id) < (?cursor_updated_at, ?cursor_id))
ORDER BY c.updated_at DESC, c.id DESC
LIMIT ?limit + 1
```

新代码组织:`app/api/admin/**/route.ts`(路由)、`lib/admin/auth.ts`(会话签名与
校验)、`lib/admin/session.ts`(登录/登出 + 限流);repository 扩展
`listConversations` / `persistOwnerMessage`(与访客写入共用事务模式)。

## 6. 组件选型与集成策略

| 库 | 用途 | 集成方式 | 评估 |
| --- | --- | --- | --- |
| Magic UI(已在用) | meteors 锁屏背景 | 已有 `components/magicui/meteors.tsx` | 零成本延续调性 |
| [Aceternity canvas-reveal-effect](https://ui.aceternity.com/components/canvas-reveal-effect) | 解锁成功的整屏点阵揭示过渡 | `npx shadcn@latest add @aceternity/canvas-reveal-effect`(复制源码) | WebGL/three.js 依赖,约 +150KB gzip,**只在锁屏→控制台一次性播放**,首屏内静态化;若包体敏感,降级为普通 AnimatePresence 淡入 |
| [cult-ui dynamic-island](https://www.cult-ui.com/docs/components/dynamic-island) | 控制台顶部信息岛(统计/新留言/菜单) | 复制源码(framer-motion) | 与 iPhone 灵动岛一致的展开/收起动效;站点抓取被限流时从其 GitHub 取源码 |
| [motion.dev tilt-card](https://examples.motion.dev/react/tilt-card) | 会话卡片悬停 3D 倾斜 | 纯模式代码(useMotionValue/spring) | 项目已有 framer-motion 12(即 motion),零新依赖 |
| [shadcn charts](https://ui.shadcn.com/charts) | 留言趋势统计 | 复制 `chart.tsx` + `recharts` 依赖 | Recharts 封装,主题变量与 shadcn 一致,自动适配暗色 |
| [reactbits click-spark](https://reactbits.dev/animations/click-spark) | 解锁/回复发送按钮的点击粒子 | 复制源码(canvas,无依赖) | 包在按钮 onClick,与 squiggly-text 的"轻量复制"模式相同 |
| [HeroUI Form](https://www.heroui.com/en/docs/react/components/form) | ——**评估后不引入** | (Tailwind v4 需 `hero.ts` 插件 + Provider + `@source` 扫描,整库 npm 依赖) | 与现有 shadcn 栈重叠度高,集成成本大于收益;仅借鉴其表单交互模式(内联校验、helper text、提交态)用现有 primitives 实现 |

**风格统一约定**(所有新组件遵守):

- 新目录 `components/admin/`(自研组装)与 `components/magicui/`(复制源码)分组,
  沿用现有目录约定
- 色板:主色 `primary`、点缀 `#FBF050`(黄)/`#DD345E`(粉),owner 气泡 = 黄系
- 玻璃拟态:`bg-white/70 dark:bg-white/5` + `border-gray-200/80 dark:border-white/10`
  + `rounded-2xl`(与聊天面板同款)
- 动效:spring 型缓动为主,过渡 150~250ms,与 chat-panel 的 AnimatePresence 参数
  对齐;尊重 `useReducedMotion`
- 明暗主题:全部走 next-themes 的 `dark:` 变体,不写死颜色

## 7. 访客端影响

- **零改动**:owner 消息已被渲染为助手气泡;访客重新打开聊天(或刷新)即可看到回复
- 可选小优化(Phase 2):访客聊天面板打开期间 60s 轻轮询拉新消息

## 8. 安全清单

- 密钥仅存 KV;比较用常数时间;登录限流 5/60s;错误响应统一防枚举
- Cookie:HttpOnly + Secure + SameSite=Strict;签名密钥派生自 Admin 密钥值,
  改密钥 = 全体会话即时失效
- API 全鉴权 + Origin 校验;`/admin` 静态壳不含数据
- 回复内容渲染走 React 文本转义(现状即为文本气泡,无 HTML 注入面)
- 无 CSRF 面:SameSite=Strict + JSON POST + Origin 三重;无 Turnstile 依赖
  (单管理员场景,限流即可,而且这让 admin 链路可以完全自动化测试)

## 9. 实施步骤(按可提交粒度)

1. `wrangler kv namespace create` + `wrangler.jsonc` 绑定 + `worker:types` +
   密钥写入(本地 `--local` 与远程各一次)
2. `lib/admin/`(auth/session)+ `POST/DELETE /api/admin/session` + 登录限流
   binding → curl 回归(成功/失败/限流/Origin)
3. repository 扩展(`listConversations`、`persistOwnerMessage`)+
   `/api/admin/conversations*` 全部路由 → curl 回归(分页、回复、关闭、401)
4. `/admin` 锁屏页(密钥输入 + meteors + click-spark + shake)
5. 控制台:会话列表 + 分页 + tilt 卡片 + dynamic island
6. 会话详情:气泡流 + 回复框 + 关闭;canvas-reveal 解锁过渡
7. (可选)stats 接口 + shadcn chart 卡片
8. 按 `docs/testing/pre-commit-verification.md` 本地全流程(admin API 走 curl
   自动化,无 Turnstile 依赖;UI 走 MCP 浏览器)→ 发布 → 按
   `docs/testing/post-deployment-verification.md` 线上验证
9. 更新 `AGENTS.md`(路由图加 `/admin`、`/api/admin`)与文档地图

## 10. 工作量与风险

- 估计:后端 + KV 半天;UI(锁屏/列表/详情/动效)1~1.5 天;验证与发布半天
- 风险:
  - three.js 体积(canvas-reveal):仅在解锁动画使用,控制台正常使用不加载;
    包体超预期则换降级方案
  - KV 写入需远程操作:按规则用 Wrangler CLI 完成,密钥经交互输入不落日志
  - D1 单查询分页深度:游标分页无 OFFSET 问题,索引已覆盖
