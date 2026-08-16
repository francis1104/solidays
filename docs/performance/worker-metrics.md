# Worker 性能快照与改进方案

> 建立于 2026-08-16。状态：**Changes Required**（评审 2026-08-16，相对
> `ab895f3`）。调查数字仍以当天快照为准；第 4–6 节已按评审改过，与旧版
> “发版预热后全球首访不再冷”冲突时以本节为准。本文不是事故报告；首页缓存
> 事故见 `docs/incidents/2026-08-15-solidays-win-homepage-client-exception.md`。
> Approve 之后再进实现；落地后把状态改成已落地，并补一次复测数字。

## 1. 调查方式

Wrangler 4.123.0 **没有**独立的 `metrics` 子命令。当天用这些入口拼出完整画像：

| 入口 | 命令 / 工具 | 看到什么 |
| --- | --- | --- |
| 部署 | `wrangler deployments status` / `versions view` | 当前 100% 流量版本、绑定、handlers |
| D1 | `wrangler d1 info` / `d1 insights` / `d1 execute --remote` | 24h 读写、热查询、当前行数 |
| R2 | `wrangler r2 bucket info solidays-media` | 对象数、体积、机房 |
| 请求 / CPU / 路径 | Workers Observability（`wrangler.jsonc` 已开） | 7 天调用量、状态码、outcome、路径、国家 |

调查窗口约 **2026-08-09 00:00 UTC → 2026-08-16 23:59 UTC**。当时生产版本：

- Worker：`solidays-worker`
- 版本：`9543a875-d2d4-4cb4-bfe0-6492ef69fd8e`（100% 流量）
- 发布时间：2026-08-16 08:09 UTC
- Handlers：`fetch` + `scheduled`（cron `0 3 * * *`）

近两天发布很密（8 次代码部署 + 2 次 Secret 变更）。这本身不是故障，但会把
`/_next/static/...` 旧 hash 和 `/media` 变体缓存一起打冷。

## 2. 结论

站点能正常服务。聊天提交、Origin/Turnstile 拒绝、登录/留言限流、`www` → 主域名
308、cron 清理都符合设计。用量本身很小，不是扩容问题。

要处理的是两条路径：

1. **`/media` 冷变换贵。** CPU 不贵，wall time 会被 Images 现场 decode/re-encode 拉到数秒甚至两分钟；9 次 `exceededCpu` / 503 几乎都落在这里和页面冷路径。Workers Caching 能挡住**同一缓存区域、同一 Worker version** 的重复变换，不能保证全球任意 PoP 的第一次请求已经暖好。
2. **扫描器 404 打进了完整 OpenNext SSR。** 单次 p95 CPU 和首页差不多。早返回只降低这些路径的 CPU，**不降低 404 占比**。

`/favicon.ico` 的 114 次 404 是站点自己的缺口，浏览器默认会要这个路径。补上这个静态文件才会明显减少 404 次数。

## 3. 指标快照

### 3.1 调用与结果

7 天 **3254** 次调用：`fetch` 3253 + `scheduled` 1。

| outcome | 次数 | 占比 |
| --- | ---: | ---: |
| `ok` | 3225 | 99.1% |
| `canceled` | 23 | 0.7% |
| `exceededCpu` | 9 | 0.3% |

| 状态码 | 次数 | 含义 |
| ---: | ---: | --- |
| 200 | 1707 | 正常页面 / API / 媒体 |
| 404 | 1209 | 约 37%，主要是扫描器和少量资源 miss |
| 308 | 213 | `www.solidays.win` → `solidays.win`，符合 `middleware.ts` |
| 201 | 70 | 留言提交成功 |
| 0 | 70 | 客户端中途断开，或还没写出响应 |
| 503 | 9 | 和 `exceededCpu` 对得上 |
| 204 / 405 / 403 / 401 | 少量 | 关会话、方法不对、鉴权 / Origin |

近 24 小时大约 488 次请求。9 次 503 全部落在这次调查前大约一天，和密集发版、缓存变冷同一时段。

Cron 在窗口内跑过 1 次：wall 298ms，CPU 2ms。这条 cron 是最近才挂上的，所以 7 天里只有一次；本身健康。

### 3.2 CPU 与 wall time

| 指标 | CPU | Wall |
| --- | ---: | ---: |
| 平均 | 130ms | 801ms |
| p95 | 390ms | 605ms |
| p99 | 502ms | 1736ms |
| 最大 | 707ms | 183s |

Wall 平均值大于 p95，是少数超慢请求在拖均值，不是页面普遍慢。

页面 SSR 是 CPU 大头：`/` p95 CPU 426ms，`/fnds` 459ms，`/about` 408ms。这对
OpenNext 全栈 Worker 正常。聊天接口反而轻：`/api/chat/*` p95 CPU 171–203ms。

### 3.3 `/media` 是长尾来源

`/media/*` 7 天 346 次：200 × 320，404 × 10，503 × 5，状态 0 × 11。

- CPU 平均 85ms，p95 231ms（CPU 不是瓶颈）
- **wall 平均 5.7s，p95 4.1s**

最长的两条都是原图直出、最后仍是 200：

| 请求 | CPU | Wall | 结果 |
| --- | ---: | ---: | --- |
| `GET /media/fnds/03-wo-men.jpg` | 47ms | 164s | 200 |
| `GET /media/fnds/07-hu-ran-007.jpg` | 80ms | 38s | 200 |

9 次 503 / `exceededCpu` 分布：

- `/media/fnds/*.jpg?variant=card&width=640` × 5
- `/fnds` × 2
- `/`、`/about` 各 1

其中一次变体请求只记到 CPU 24ms / wall 203ms 就被判超限。更像是 Images 变体 +
Worker 冷启动叠在一起，不是业务逻辑算爆。错误日志里
“Worker exceeded CPU time limit” 出现 29 条，是这 9 次调用打出来的多条 error
行，不是 29 次独立故障。

当前出口策略见 `custom-worker.ts`：只允许 `GET/HEAD /media/*` 且响应为 `200`、
`image/*`、无 `Set-Cookie` 的结果保留原 `Cache-Control`；其余动态 Worker 响应改成
`no-store`。`app/media/[...key]/route.ts` 给原图和卡片变体都写了
`public, max-age=31536000, immutable`。这和 Images binding 的官方建议一致：
binding 本身**不会**自动缓存变换结果，每次未命中都会完整 decode/re-encode；
要靠 Workers Caching + 响应上的 `Cache-Control`。

Workers Caching 默认把 **Worker version 纳入 cache key**。新版本部署后是一套
空缓存，所以“频繁 deploy 会打冷 `/media`”这个判断成立。但缓存填充发生在处理
该请求的边缘位置，一次 curl 不能当成全球预热。

**不要**为了加速再给 HTML / RSC 开 Workers Caching。2026-08-15 的首页事故就是旧
HTML 被缓存一年、和新 JS hash 对不上。

### 3.4 流量构成

7 天国家：美国 1696（约 52%），然后是荷兰、俄罗斯、德国、波兰。中国只有 88。
个人站点这个比例，基本是扫描器。

404 前几名：

| 路径 | 次数 |
| --- | ---: |
| `/wp-admin/install.php` | 229 |
| `/favicon.ico` | 114 |
| `/.env` | 40 |
| `/.git/config` | 30 |
| `/.env.local` | 23 |
| `/wp-login.php` | 22 |
| 旧的 `/_next/static/chunks/app/layout-….js` | 15 |

`/wp-admin/install.php` 的 p95 CPU 有 **445ms**，几乎和首页一样贵。这些探测打进了
完整 Next.js Worker。

`/favicon.ico` 不是扫描器特有问题。站点图标实际在
`/static/favicons/favicon.ico`（`app/layout.tsx` 的 shortcut icon），
`public/` 根下没有 `favicon.ico`。浏览器和部分爬虫仍默认要根路径。

旧 `/_next/static` hash 的 404 是发版后的预期噪音，对应事故报告里那次客户端异常
的同类现象；当前出口已经禁止缓存 HTML，这类 404 会随旧客户端散去。

### 3.5 聊天、D1、R2

聊天接口 7 天：

| 接口 | 结果 |
| --- | --- |
| `GET /api/chat/conversation` | 70 × 200 |
| `POST /api/chat/messages` | 69 × 201，3 × 403，2 × 429，2 × 400 |
| `POST /api/chat/conversation/close` | 4 × 204 |

69 次成功提交，403 / 429 / 400 都有打到，说明 Origin、Turnstile 和限流在干活。

`solidays-chat`（WNAM）24h：

- 库大小 86 kB，4 张业务表
- 读 353 次 / 写 219 次
- 读 2450 行 / 写 988 行
- 单条 SQL 平均 0.2–0.8ms
- 最热查询：按 id 查访客、查开放会话、插消息、插访客
- `INSERT INTO messages` 24h 跑了 46 次

调查当时远程 `COUNT(*)`：`visitors` / `conversations` / `messages` **全是 0**。
表、索引、配额 trigger 都在，数据不在。更像是测试写过之后被清掉，或近期重跑过
schema，不是查询失败。需要单独确认是不是有意清空，**不是本次性能方案的一部分**。

`solidays-media`（WNAM，Standard）：8 个对象、12 MB。和 7 张 FNDS + 1 张头像对得上。
慢的是首次拉原图 / 首次出变体，不是桶体积。

## 4. 方案

方向不变：favicon 走静态资源，扫描器在 Worker 入口早 404，HTML/RSC/API 继续
`no-store`。`/media` 第一阶段只做**发布 smoke + 当前 colo 升温**；如果目标是
“全球第一个打开 `/fnds` 的人也不触发昂贵 Images transform”，要走预生成 WebP
写 R2，不要把单点 GET 说成全球预热。

都不走 Cloudflare Dashboard。

### 4.1 补根路径 `/favicon.ico`（可直接实现）

**目标**：消掉浏览器默认请求的 114 次 404。这是三项里唯一会明显降低 404
**次数**的改动。

**改法**：在 `public/favicon.ico` 放一份与 `public/static/favicons/favicon.ico`
相同的文件。当前 `wrangler.jsonc` 的 `assets` **没有**设 `run_worker_first`
（默认 `false`）：URL 能命中真实静态文件时，asset 先返回，Worker 不跑。
所以放进静态资产比在 `custom-worker.ts` rewrite 更干净。
`app/layout.tsx` 里现有的 `/static/favicons/*` 链接不用改。

**验收**：`GET /favicon.ico` 返回 `200` + icon / 图片类型，不要整页 HTML。
桌面 / 移动首页 tab 图标仍正常。复测看这条路径的 404 数量下降。

### 4.2 扫描器在 Worker 入口早返回（可直接实现）

**目标**：WordPress / 密钥 / `.git` 探测不要进 OpenNext，把这些路径的 p95 CPU
从约 400ms 压到个位数毫秒。

**改哪里**：`custom-worker.ts` 的 `fetch`，在调用 `openNextHandler.fetch`
**之前**匹配。放在后面就晚了，CPU 已经花掉。

**边界语义（不要宽泛 `startsWith`）**：

```ts
pathname === '/wp-login.php' ||
pathname === '/xmlrpc.php' ||
pathname === '/wp-admin' ||
pathname.startsWith('/wp-admin/') ||
pathname === '/.env' ||
pathname.startsWith('/.env.') ||
pathname === '/.git' ||
pathname.startsWith('/.git/')
```

`pathname.startsWith('/.git')` 会误伤 `/.github`；`/wp-admin` 不带尾斜杠的
`startsWith` 会误伤 `/wp-administer`。第一版只拦明确垃圾路径，matcher 必须
保守、确定。不要动 `/admin`。

返回极短 `404`，不要 SSR，不要 HTML 壳。第一版用：

```http
Cache-Control: no-store
```

这是最保守的出口，和现有 `custom-worker.ts` 对非 `/media` 的策略一致。

**可选、非 blocker**：`/wp-admin/install.php` 7 天有 229 次重复请求。Workers
Caching 已开启时，纯 `no-store` 意味着每一次仍进 Worker。可以改成浏览器不存、
edge 短缓存：

```http
Cache-Control: no-store
Cloudflare-CDN-Cache-Control: public, max-age=600
```

Workers Caching 的 header 优先级是 `Cloudflare-CDN-Cache-Control` >
`CDN-Cache-Control` > `Cache-Control`。入口早返回本身已经能把 CPU 从几百毫秒
压下去，这条只是少跑几次 Worker，第一版可以不做。

**这不是安全边界。** 当前 Static Assets 默认 asset-first：构建产物里如果真有
`/.env` 或 `/.git/*`，请求先命中文件，Worker 早 404 根本不会跑。scanner
early-return 只用于减少 OpenNext SSR CPU，不替代 `.gitignore` /
`.assetsignore` / 构建产物 secret 检查。

**不做**：Dashboard WAF 规则。规则进版本控制，本地 `worker:dev` 能测。

**验收（不要看 404 占比）**：

- `GET /wp-admin/install.php`、`/.env`、`/.git/config` 仍是 404
- 这些路径的 **p95 CPU** 和 wall time 明显下降（目标：个位数毫秒）
- 本地终端 / 生产日志看不到这些路径的 OpenNext render
- Worker 总 CPU 使用量下降
- 回归：`/`、`/fnds`、`/about`、`/admin`、`/api/chat/*`、`/media/*` 行为不变
- `/.github`、`/wp-administer`、`/.environment` **不能**被拦

早返回之后 `/wp-admin/install.php` 还是 404，只是从“OpenNext SSR 400ms 的
404”变成“入口几乎零 CPU 的 404”。404 占比不会因此下降。

### 4.3 `/media`：同 colo smoke，不是全球预热

**当前运行时保留，不要改缓存边界**：

- 原图走私有 R2，变体走 Images Binding（`fit=cover`，320 / 480 / 640 WebP）
- `cache.enabled: true`，只有 `/media` 的 200 图片能出 Workers Caching
- HTML / API 继续 `no-store`

这和官方建议一致。问题出在旧方案把“从一个地方 GET 一遍”写成了
“发版后 `/fnds` 首访不再冷”。

**做不到的事**：一次（或一组）来自单一出口的 GET，不能保证其他边缘位置的
第一次 `/fnds` 用户不再触发 Images transform。每个缓存位置独立填充；
Workers Caching 还按 Worker version 分区，新版本从空缓存开始。

因此这一节拆成两档，目标必须分开写。

#### 第一阶段（现在做）：发布 smoke + 暖当前测试区域

生产 100% 切流量之后，对 FNDS 7 张图和头像各打：

```text
GET https://solidays.win/media/<key>
GET https://solidays.win/media/<key>?variant=card&width=320
GET https://solidays.win/media/<key>?variant=card&width=480
GET https://solidays.win/media/<key>?variant=card&width=640
GET https://solidays.win/media/profile/avatar.jpg
```

FNDS key 见 `app/fnds/page.tsx`。第一版写进
`docs/testing/post-deployment-verification.md` 的手工清单，不先写全球预热脚本。

**验收（必须同一缓存区域才可重复）**：

1. 每次响应记录 `CF-Ray`（含 colo）和 `CF-Cache-Status`。
2. **同一 colo** 连续两次：第一次允许 `MISS`，第二次应为 `HIT`（或等价命中）。
3. 全部 `200` + `image/*`。
4. 不宣称其他 colo、其他地区的首访已经暖好。
5. 不要用“给 `/` 开缓存”来验证。

这一阶段的承诺是：发布后这条媒体路径还能出图，并且测试出口所在 colo 已被升温。
不是“全球首个 `/fnds` 用户不再冷变换”。

#### 结构性方案（全球首访也不现场 transform）

如果继续观察到**跨区域** `/media` 冷变换长尾，或目标变成“任意 PoP 第一次打开
`/fnds` 也不跑昂贵 Images transform”，直接预生成 320 / 480 / 640 WebP 写进
R2。任何 PoP 冷的时候最多是读对象，不在请求路径上 decode/re-encode。

不要靠把预热脚本扩到更多地区来假装全球暖缓存。预生成会改上传流程和 key
约定，要同步 `docs/cloudflare/media-storage.md`。第一阶段不实施。

### 4.4 D1 空库：独立调查，不进性能 PR

insights 证明 24h 内写过消息，调查当时行数是 0。先问清楚是不是有意清空。

- 有意清空：在本文补一句，关掉这条跟进。
- 不是有意：再查近期迁移、手动 `d1 execute`、cron 是否被改过。现行 cron 只清
  closed 30 天 / stale open 90 天，按设计不该清空当天数据。

## 5. 明确不做

- 不为 HTML、RSC、`/api/*` 打开 Workers Caching 或 `cross_version_cache`。
- 不把扫描器拦截做成 Dashboard WAF，也不把它当成敏感文件防火墙。
- 不把卡片图改回 `r2.dev` 公共地址；媒体继续走私有桶 + `/media`。
- 不因为 7 天三千多次请求去升套餐或拆 Worker。
- 不把 D1 空库混进性能 PR。
- 不把单点 `/media` GET 验收写成“全球首访缓存命中”。
- 不用 404 占比验收扫描器早返回。

## 6. 落地顺序

1. **favicon**：`public/favicon.ico`，原方案直接实施。
2. **scanner early 404**：实施，matcher 用第 4.2 节的 segment / exact 边界；
   文档和注释写明只是性能层；验收看 CPU / wall / 无 OpenNext 日志。
3. **media 第一阶段**：发布后手工 GET 定义为 smoke + 当前 colo warming；
   记录 `CF-Ray` / `CF-Cache-Status`，同一 colo 确认 `MISS → HIT`。
4. 若跨区域 `/media` 冷变换长尾仍在：**预生成三档 WebP 到 R2**，不扩大预热脚本。
5. D1 空库继续独立调查。

每一步单独提交。1 / 2 按 `docs/testing/pre-commit-verification.md` 在
`http://localhost:8787` 测对应路径。进生产后再按
`docs/testing/post-deployment-verification.md` 复测。

复测对比这些数，**不要对比 404 占比**：

- `/wp-admin/install.php`、`/.env`、`/.git/config` 的 p95 CPU 和 wall
- Worker 总 CPU
- `/favicon.ico` 的 404 次数
- 同 colo `/media` 的 `CF-Cache-Status`（`MISS → HIT`）
- `/media` 变体的 `exceededCpu` 次数（只说明现场 transform 是否还在爆，
  不能单独证明全球已暖）

## 7. 复测入口

```bash
npx wrangler deployments status --name solidays-worker
npx wrangler d1 info solidays-chat
npx wrangler d1 insights solidays-chat --time-period 1d --limit 10
npx wrangler r2 bucket info solidays-media
```

请求量、路径、CPU、outcome 继续查 Workers Observability，过滤
`$metadata.service = solidays-worker`。
