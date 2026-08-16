# 匿名留言 V2:Admin 回复与后台(实施方案)

> 建立于 2026-08-16,状态:已评审(2026-08-16),**Changes Required**,结论与
> 阻塞项见第 11 节;第 1~10 节为原始提案,与第 11 节冲突处以第 11 节为准。
> 目标:访客留言可由 Admin 回复;后台页面仅 Admin 可见;会话列表、消息查看、
> 回复、分页。组件以集成现成库为主,风格与站内玻璃拟态 + Framer Motion 调性一致。

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

---

## 11. 评审结果(2026-08-16)

**评审结论:Changes Required。总体方向可行,但当前方案不建议直接进入实现;先修正下面的阻塞项。**

本次评审按 `cloudflare-worker-DEV` 当前代码、D1 migration、Worker 配置和发布约定逐项核对,并复核了当前 Cloudflare Workers 的相关行为。现有项目已经具备 `owner` role、D1、OpenNext、Origin helper、Rate Limiting 和消息游标等基础,因此 Admin V2 不需要推倒现有聊天实现;问题主要集中在回复可达性、关闭语义、quota、认证和列表数据模型。

### 11.1 阻塞项

#### A. 访客端不是"零改动":重新打开聊天当前不会重新拉取 Admin 回复

`components/chat/floating-chat.tsx` 使用 `historyRequestedRef` 保证历史消息在一次页面生命周期内只加载一次。聊天面板关闭后再次打开,ref 仍为 `true`,不会再次请求 `/api/chat/conversation`。

因此当前文档所写"访客重新打开聊天即可看到回复"不成立:**刷新整个页面可以看到,但同一页面内关掉再打开看不到新 owner 消息。**

V2 Phase 1 必须包含一个访客端最小改动:每次从关闭态切换为打开态时重新拉取最新一页,并按 message id 去重合并。60s 轮询仍可留在 Phase 2,但"重新打开即刷新"必须进入 MVP。

#### B. Admin close 与现有访客读取模型冲突

现有 `/api/chat/conversation` 调用 `loadOpenConversation()`,最终只查询 `status='open'` 的 conversation;现有关闭函数也会把当前 open conversation 置为 closed。

所以如果 Admin **先回复再立即关闭**,访客下一次读取时该 conversation 已经不在现有读取路径中,刚刚的 owner 回复可能永远不会展示给访客。

此外,方案写"复用现有幂等关闭逻辑"也不准确:现有 `closeOpenConversation(db, visitorId)` 的主键语义是 visitor,而 Admin API 的资源路径是 conversation id。

建议 V2 MVP **暂不交付 Admin close**。如果必须保留,则需要先重新定义 closed conversation 的访客读取/展示语义,并新增:

```ts
closeConversationById(db, conversationId)
```

使用:

```sql
WHERE id = ? AND status = 'open'
```

做幂等更新。不能直接拿 visitor 维度的函数套到 Admin `[id]/close`。

#### C. owner 回复会被现有 D1 quota 当成访客留言计数,甚至可能被禁止写入

`migrations/0002_chat_quotas.sql` 的 quota enforce / increment / decrement trigger 都没有限定 role,对所有 `messages` 生效。因此直接实现 `persistOwnerMessage()` 会产生:

1. 访客已经达到 conversation/visitor quota 时,Admin 的 owner INSERT 同样会触发 `CHAT_QUOTA_EXCEEDED`;
2. Admin 每次回复会继续增加 visitor 的 `message_count/message_bytes`,可能因为 Admin 回复把访客推到配额上限。

所以"Admin 回复零迁移"只在 **`messages.role` 已有 owner** 这一点上成立,V2 整体仍需要 migration。

建议重建相关 trigger,使 visitor quota 只在:

```sql
NEW.role = 'visitor'
```

时 enforce / increment,在:

```sql
OLD.role = 'visitor'
```

时 decrement,并按 visitor role 重算已有 quota counter。

若要限制 Admin 回复,应建立独立 Admin 限制,而不是消费访客 quota。

#### D. Admin 密码应使用 Worker Secret,不建议存 KV

当前仓库已经通过 `wrangler.jsonc -> secrets.required` 管理 `TURNSTILE_SECRET_KEY`。Admin 密码本质上也是 credential,更适合沿用 Worker Secret,而不是额外拿 KV 当 secret store。

建议改成:

* `ADMIN_PASSWORD`:Worker Secret;
* `ADMIN_SESSION_SECRET`:独立生成的高熵 Worker Secret,至少 32 random bytes;
* 两者加入 `wrangler.jsonc` 的 `secrets.required`;
* 重新生成 `CloudflareEnv`;
* 本地值放 `.dev.vars` 等已忽略的本地 secret 文件。

**不要使用 `SHA-256(Admin 密钥)` 直接作为 session HMAC key。**

如果 Admin 密钥是人类可记忆口令,拿到一个合法的 `token + HMAC` 后,会形成一个离线密码猜测校验器。独立随机 `ADMIN_SESSION_SECRET` 可以切断 session MAC 与登录口令之间的关系。

如果坚持 KV 方案,则文档也不能再承诺:

> 改密钥即全体会话即时失效

KV 是最终一致存储,再叠加方案里的模块级缓存,会进一步扩大旧值仍然可用的时间窗口。

#### E. Cookie 的 `Max-Age=7d` 不能替代服务端过期校验

当前:

```text
token.HMAC(token)
```

的 payload 没有签发时间或过期时间。

`Max-Age` 只能让正常浏览器停止自动发送 Cookie;一个被复制出来的合法 Cookie 在 7 天后被手工重放时,服务端仍无法判断它已经过期。

建议 payload 至少包含版本和绝对过期时间:

```text
v1.<expiresAtMs>.<random32B>.<HMAC-SHA256(v1.expiresAtMs.random32B)>
```

服务端流程:

1. 解析版本 / exp / random / MAC;
2. 验证 MAC;
3. 验证 `expiresAtMs > Date.now()`;
4. 否则统一返回 401。

Cookie 推荐命名:

```text
__Host-solidays_admin_session
```

并保持:

```text
HttpOnly; Secure; SameSite=Strict; Path=/
```

不要设置 Domain。

如要实现"改 Admin 密码即注销所有 session",采用独立 session secret 后,应在改密码流程中同步轮换 `ADMIN_SESSION_SECRET`。

#### F. `timingSafeEqual` 应比较固定长度 digest,而不是直接比较可变长密码

实现登录校验时建议:

1. 对输入 password 做 SHA-256;
2. 对 `ADMIN_PASSWORD` 做 SHA-256;
3. 对两个固定 32-byte digest 做 timing-safe compare。

这样比直接比较原始字符串更稳妥,也避免两边长度不一致造成额外异常分支。

伪代码:

```ts
const candidateDigest = await sha256(candidatePassword)
const expectedDigest = await sha256(env.ADMIN_PASSWORD)

const valid = crypto.subtle.timingSafeEqual(
  candidateDigest,
  expectedDigest
)
```

#### G. Origin 校验不要无差别套到 Admin GET

当前 `lib/chat/security.ts:isAllowedOrigin()` 在请求没有 `Origin` header 时直接返回 `false`。

浏览器同源 GET 并不能假设总会携带 Origin,因此:

> 所有 `/api/admin/*` 路由都做 Origin 校验

可能导致正常列表/详情读取被误拒绝。

建议:

**状态变更请求:**

```text
POST   /api/admin/session
DELETE /api/admin/session
POST   /api/admin/conversations/[id]/messages
POST   /api/admin/conversations/[id]/close
```

执行:

```text
session / login validation + Origin
```

**读取请求:**

```text
GET /api/admin/conversations
GET /api/admin/conversations/[id]/messages
GET /api/admin/stats
```

只要求:

```text
session validation + no-store
```

不强制 Origin。

`SameSite=Strict + JSON state-changing request + Origin` 可以继续作为 CSRF 的组合防御。

#### H. 登录 Rate Limiter 不能当成全局精确的密码防爆破计数器

Workers Rate Limiting binding 适合做廉价的第一层流量保护,但不应把:

```text
5 requests / 60s
```

理解成全局、严格、绝对准确的登录失败计数器。

因此单管理员登录仍然应保证:

* Admin password 本身足够高熵;
* 统一错误响应;
* Rate Limiter 是附加防护,而非密码强度的替代品。

此外,当前:

```ts
lib/chat/rate-limit.ts
```

里的 `checkRateLimit()` 是硬编码读取:

```ts
env.CHAT_RATE_LIMITER
```

所以新的 `ADMIN_LOGIN_LIMITER` **不能直接复用现有函数实现**。

建议重构为:

```ts
checkRateLimit(limiter, key)
```

由调用方传入具体 binding;或者单独增加 Admin helper。

同时保持当前 fail-closed 策略:limiter 不可用时登录接口不要自动放行。

### 11.2 数据模型与查询层

#### A. "新留言红点"当前没有可靠数据来源

现有 schema 没有:

```text
admin_seen_at
last_admin_read_at
read receipt
```

或等价字段。

因此设计中的:

> 3 个有新留言
> Dynamic Island 新留言红点

当前无法从数据库可靠计算。

V2 建议直接移除"未读"语义,只展示:

* open conversation 数;
* 总会话数;
* 最近更新时间;
* 最近消息预览。

如果未读是必须功能,则应先新增 migration,并明确定义:

> 什么时刻视为 Admin 已读?

例如:

* 打开 conversation detail;
* 成功加载 detail;
* 显式调用 mark-read API。

之后再实现红点。

#### B. `conversations.message_count` 已存在,但它当前本质上是 quota counter

`0002_chat_quotas.sql` 已经给 conversation 增加:

```text
message_count
message_bytes
```

所以后台列表没有必要无条件对每个 conversation 再执行:

```sql
SELECT COUNT(*)
FROM messages
WHERE conversation_id = ...
```

但需要注意:

按照前面 quota 修复后的推荐语义,`c.message_count` 最适合定义为:

> visitor 留言数

如果 UI 展示的是"访客留言数",可以直接使用。

如果 UI 想展示:

> visitor + owner 的总消息数

则不要把 quota counter 当成总消息数,应另算或者增加独立统计字段。

最近消息查询可以保留:

```sql
SELECT content
FROM messages
WHERE conversation_id = c.id
ORDER BY created_at DESC, id DESC
LIMIT 1
```

排序补上 `id DESC`,与现有 message cursor 一致。

#### C. 会话列表需要补稳定 cursor 索引,并拆分 status/all 查询

当前:

```sql
idx_conversations_status_updated(status, updated_at DESC)
```

在固定 status 时有帮助。

但存在两个问题:

1. `status=all` 时,索引首列是 `status`,无法直接很好地覆盖全局 `updated_at DESC` 排序;
2. cursor 使用 `(updated_at, id)`,而索引没有 `id` tie-breaker。

建议新增 migration:

```sql
CREATE INDEX idx_conversations_updated_cursor
  ON conversations(updated_at DESC, id DESC);

CREATE INDEX idx_conversations_status_updated_cursor
  ON conversations(status, updated_at DESC, id DESC);
```

repository 中也建议拆为两条 SQL。

带 status:

```sql
WHERE status = ?
  AND (
    updated_at < ?
    OR (updated_at = ? AND id < ?)
  )
ORDER BY updated_at DESC, id DESC
```

status=all:

```sql
WHERE (
  updated_at < ?
  OR (updated_at = ? AND id < ?)
)
ORDER BY updated_at DESC, id DESC
```

不建议继续用:

```sql
(?status IS NULL OR c.status = ?status)
```

让一个查询同时兼容两种访问模式。

### 11.3 UI / 路由层的小修正

#### `/admin` 不建议通过 middleware 把无 Cookie 用户 308 回首页

`/admin` 本身设计的就是:

> 未登录 → 锁屏
> 登录后 → 控制台

那么无 session 的用户访问 `/admin` 应该正常进入锁屏页。

如果 middleware 在无 Cookie 时直接跳首页,反而破坏原设计。

而且:

```text
308 Permanent Redirect
```

也不适合作为认证状态跳转。

建议完全不在 middleware 做 Admin auth redirect。

真正安全边界只放在:

```text
/api/admin/*
```

认证接口上。

#### motion.dev 示例不能默认认为"零依赖"

当前项目实际依赖:

```json
"framer-motion": "^12.23.12"
```

而不是独立:

```text
motion
```

package。

所以复制 motion.dev 示例时,需要适配当前 `framer-motion` import 方式,不要因为示例代码用 `motion/react` 就判断"项目已经有 motion,因此零成本"。

#### UI 动效不要阻塞核心能力

以下都建议在核心 Admin 功能稳定后再接:

* Canvas Reveal
* Dynamic Island
* Tilt Card
* shadcn chart
* Click Spark

MVP 优先级应该是:

```text
登录
→ 会话列表
→ 消息详情
→ Admin 回复
→ 访客能收到回复
```

而不是先解决动画和第三方 UI 组件。

### 11.4 已确认可以直接复用的现状

以下判断基本成立:

* `messages.role` 已支持 `owner`;
* `mapApiMessage()` 已经会把 owner 渲染成 assistant 气泡;
* role / 渲染层本身不需要新 migration;
* `listMessages()` 的 `(created_at, id)` 游标模型可以复用;
* `idx_messages_conversation_cursor` 可以支持 Admin 消息详情分页;
* `crypto.randomUUID()` 可以继续用于 ID / session random 部分;
* D1 binding 和 OpenNext `getCloudflareContext()` 可以沿用;
* `custom-worker.ts` 当前已经对大多数非显式缓存响应补 `private/no-store`;
* `cloudflare-worker-DEV` 用于开发,`cloudflare-worker` 用于生产的分支模型是合理的。

新增 Admin secrets 后需要注意:

**在把 DEV 合入 `cloudflare-worker` 之前,先给生产 Worker 配好对应 Secret。**

否则生产 CI deployment 可能因为 required secret 不存在而失败。

### 11.5 推荐实施顺序

1. **D1 migration**

   * 修正 visitor quota trigger;
   * 补 conversation cursor index;
   * 如果坚持未读,同阶段增加 read-state;
   * 否则 V2 删除未读 UI。

2. **Secrets / bindings**

   * `ADMIN_PASSWORD`
   * `ADMIN_SESSION_SECRET`
   * `ADMIN_LOGIN_LIMITER`
   * 重新生成 Worker types。

3. **Admin auth**

   * timing-safe password compare;
   * 带 `exp` 的签名 Cookie;
   * logout;
   * POST / DELETE Origin check。

4. **Repository**

   * `listConversations`
   * `getConversationById`
   * `persistOwnerMessage`
   * close 暂缓;
   * 或确认 closed 语义后实现 `closeConversationById`。

5. **Admin API MVP**

   * session
   * conversation list
   * conversation detail
   * owner reply

   curl 覆盖:

   * 401
   * 过期 Cookie
   * rate limit
   * GET 无 Origin
   * POST 错误 Origin
   * cursor 分页

6. **访客端最小改动**

   * 每次重新打开聊天拉最新消息;
   * 按 message id 去重;
   * 确保 owner 回复可达。

7. **Admin UI MVP**

   * 锁屏
   * 列表
   * 详情
   * 回复

   close 在 closed conversation 读取语义修正前不交付。

8. **视觉增强 / stats**

   * Canvas Reveal
   * Dynamic Island
   * Tilt
   * chart
   * Click Spark

9. 按现有 pre-commit / post-deployment 文档完成:

   * Worker build
   * D1 migration
   * 本地验证
   * 浏览器验证
   * production smoke test

   最后再合入 `cloudflare-worker`。

### 11.6 V2 最低验收条件

V2 上线前至少满足:

* 同一页面生命周期内:

  * 访客首次打开聊天;
  * 关闭聊天;
  * Admin 回复;
  * 访客再次打开;
  * **无需刷新整个页面即可看到 owner 回复。**

* 访客达到 message quota 后:

  * Admin 仍然可以回复;
  * owner 回复不会继续消耗 visitor quota。

* Admin session Cookie:

  * payload 中存在服务端 `exp`;
  * 到期后即使手工重放也返回 401。

* Admin GET:

  * 没有 Origin header 时仍可正常访问;
  * 没有合法 session 必须返回 401。

* Admin POST / DELETE:

  * Origin 不合法时拒绝;
  * 登录错误响应不泄露密码错误 / limiter /内部状态细节。

* 如果 V2 保留 close:

  * closed 后访客仍有经过测试的方式读取此前 owner 回复;
  * 如果做不到,则 V2 不交付 close。

* `status=all` 和 `status=open/closed`:

  * 都使用稳定 `(updated_at, id)` cursor;
  * 同时间戳情况下不能出现重复或漏项。

* Admin credential 和 session secret:

  * 不进入 git;
  * 不进入日志;
  * 不进入错误响应;
  * 不进入前端 bundle。

### 11.7 Cloudflare 官方依据(评审时复核)

* Workers Secrets
  [https://developers.cloudflare.com/workers/configuration/secrets/](https://developers.cloudflare.com/workers/configuration/secrets/)

* Workers KV consistency
  [https://developers.cloudflare.com/kv/concepts/how-kv-works/](https://developers.cloudflare.com/kv/concepts/how-kv-works/)

* Workers Web Crypto / `timingSafeEqual`
  [https://developers.cloudflare.com/workers/runtime-apis/web-crypto/](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)

* Timing attack 示例
  [https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks/](https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks/)

* Workers Rate Limiting binding
  [https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

* Local bindings / Rate Limiting local simulation
  [https://developers.cloudflare.com/workers/local-development/bindings-per-env/](https://developers.cloudflare.com/workers/local-development/bindings-per-env/)

**最终评审状态:Changes Required。优先解决 11.1.A~H;完成这些调整后,方案可以进入实现阶段。**
