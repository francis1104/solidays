# Worker 性能快照与改进方案

> 建立于 2026-08-16。记录当天对生产 Worker `solidays-worker` 的指标调查，以及
> 尚未落地的改进方案。本文不是事故报告；首页缓存事故见
> `docs/incidents/2026-08-15-solidays-win-homepage-client-exception.md`。
> 实施对应项后，把本节状态改成已落地，并补一次复测数字。

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

1. **`/media` 首次出图不稳定。** CPU 不贵，wall time 会被冷启动和 Images 变体拉到数秒甚至两分钟；9 次 `exceededCpu` / 503 几乎都落在这里和页面冷路径。
2. **大约三分之一请求是扫描器 404。** 它们打进完整 OpenNext SSR，单次 p95 CPU 和首页差不多。

`/favicon.ico` 的 114 次 404 是站点自己的缺口，浏览器默认会要这个路径。

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
`public, max-age=31536000, immutable`。缓存命中后应该很快；没命中时会非常慢。

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

按收益排序。都不改 HTML 缓存策略，也不走 Cloudflare Dashboard。

### 4.1 扫描器在 Worker 入口早返回（优先）

**目标**：WordPress / 密钥 / `.git` 探测不要进 OpenNext。

**改哪里**：`custom-worker.ts` 的 `fetch`，在调用 `openNextHandler.fetch` **之前**
做前缀匹配。放在后面就晚了，CPU 已经花掉。

**拦截清单（第一版只收明确垃圾路径）**：

- `/wp-admin`、`/wp-login.php`、`/xmlrpc.php`
- `/.env`、`/.env.*`
- `/.git`

返回极短 `404`，`Cache-Control: no-store`，不要 SSR，不要 HTML 壳。不要动 `/admin`，
那是真页面。

**不做**：Dashboard WAF 规则。本仓库约定 Cloudflare 操作走 Wrangler / 代码，规则要
进版本控制，本地 `worker:dev` 能测。

**验收**：本地对 `/wp-admin/install.php`、`/.env`、`/.git/config` 应立即 404，且
终端看不到 OpenNext 页面渲染。回归：`/`、`/fnds`、`/about`、`/admin`、`/api/chat/*`、
`/media/*` 行为不变。复测后，Observability 里这些路径的 p95 CPU 应从约 400ms 掉到
个位数毫秒。

### 4.2 补根路径 `/favicon.ico`

**目标**：消掉浏览器默认请求的 114 次 404。

**改法（选更小的）**：在 `public/favicon.ico` 放一份与
`public/static/favicons/favicon.ico` 相同的文件，让 OpenNext 静态资源直接出。
`app/layout.tsx` 里现有的 `/static/favicons/*` 链接不用改。

备选：在 `custom-worker.ts` 把 `/favicon.ico` rewrite 到
`/static/favicons/favicon.ico`。多一层入口逻辑，不如静态文件直观。

**验收**：`GET /favicon.ico` 返回 `200` + `image/*`（或 icon 类型），不要整页 HTML。
桌面 / 移动首页 tab 图标仍正常。

### 4.3 `/media` 冷路径：发版预热，不改缓存边界

**目标**：发版后第一次打开 `/fnds` 不再撞 Images 变体超限或数十秒 wall。

当前运行时已经正确：

- 原图走私有 R2，变体走 Images Binding（`fit=cover`，320 / 480 / 640 WebP）
- 只有 `/media` 的 200 图片能出 Workers Caching
- HTML / API 继续 `no-store`

**要做的是预热，不是再给别的路径加缓存。**

FNDS 现网 7 张图（`app/fnds/page.tsx`）：

```text
fnds/01-zhi-ming-ri-de-wu.jpg
fnds/02-melody.jpg
fnds/03-wo-men.jpg
fnds/04-hang-zhou.jpg
fnds/05-ren-wo-xing.jpg
fnds/06-ao-men.jpg
fnds/07-hu-ran-007.jpg
```

生产发布 100% 切流量之后，对每张图打：

```text
GET https://solidays.win/media/<key>
GET https://solidays.win/media/<key>?variant=card&width=320
GET https://solidays.win/media/<key>?variant=card&width=480
GET https://solidays.win/media/<key>?variant=card&width=640
```

再打一次 `GET /media/profile/avatar.jpg`。全部应 `200` + `image/*`。预热脚本可以
后补；第一版先写进 `docs/testing/post-deployment-verification.md` 的手工清单。

**以后如果还慢，再考虑第二档**（本次先不做）：上传时把 320 / 480 / 640 WebP
写进 R2，运行时只读对象、不再现场调 Images。那会改上传流程和 key 约定，要同步
`docs/cloudflare/media-storage.md`。

**验收**：预热后再开 `/fnds`，卡片图应走缓存命中，wall 从秒级掉到百毫秒级；
`?variant=card&width=640` 不再出现 `exceededCpu` 503。不要用“给 `/` 开缓存”
来验证，那是回归 2026-08-15 事故。

### 4.4 D1 空库：先确认，不改代码

insights 证明 24h 内写过消息，当前行数是 0。先问清楚是不是有意清空。

- 有意清空：在本文补一句，关掉这条跟进。
- 不是有意：再查近期迁移、手动 `d1 execute`、cron 是否被改过。现行 cron 只清
  closed 30 天 / stale open 90 天，按设计不该清空当天数据。

## 5. 明确不做

- 不为 HTML、RSC、`/api/*` 打开 Workers Caching 或 `cross_version_cache`。
- 不把扫描器拦截做成 Dashboard WAF，以免下次部署对不上。
- 不把卡片图改回 `r2.dev` 公共地址；媒体继续走私有桶 + `/media`。
- 不因为 7 天三千多次请求去升套餐或拆 Worker。配额远没用满。
- 不把 D1 空库当成性能 bug 先改 repository。

## 6. 落地顺序

1. `public/favicon.ico`（改动最小，行为清晰）
2. `custom-worker.ts` 扫描器早返回
3. 发布后验证清单加上 `/media` 预热；需要的话再补脚本
4. 确认 D1 空库原因

每一步单独提交，按 `docs/testing/pre-commit-verification.md` 在本地
`http://localhost:8787` 测对应路径。进生产后再按
`docs/testing/post-deployment-verification.md` 复测，并用本节同一套 Wrangler +
Observability 入口对比 404 占比、`/media` wall p95、`exceededCpu` 次数。

## 7. 复测入口

```bash
npx wrangler deployments status --name solidays-worker
npx wrangler d1 info solidays-chat
npx wrangler d1 insights solidays-chat --time-period 1d --limit 10
npx wrangler r2 bucket info solidays-media
```

请求量、路径、CPU、outcome 继续查 Workers Observability，过滤
`$metadata.service = solidays-worker`。
