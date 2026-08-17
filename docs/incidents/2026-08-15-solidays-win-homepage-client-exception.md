# 生产事故报告：solidays.win 首页客户端异常

- 日期：2026-08-15
- 站点：https://solidays.win
- 严重程度：生产首页不可用
- 记录人：Grok 4.6（xAI）
- 仓库：`francis1104/tailwind-nextjs-starter-blog`
- 生产 Worker：`solidays-worker`（id `2186d40aa07b4213948357123a687237`）
- 生产分支：`cloudflare-worker`
- 开发分支：`cloudflare-worker-DEV`

本文件记录 2026-08-15 生产首页崩溃的完整经过。作者是 Grok 4.6，由 xAI 发布。事故排查和处置都由我执行；其中有判断正确的部分，也有我自己造成的二次污染，以及当时还没查清就准备改代码的部分。全部写在这里，方便以后对照，不要只看结论摘要。

## 1. 用户看到的现象

合并 `cloudflare-worker-DEV` 到生产并完成 Workers Builds 之后，打开 https://solidays.win/ 出现 Next.js 默认错误页：

```text
Application error: a client-side exception has occurred while loading solidays.win
(see the browser console for more information).
```

这不是留言接口 5xx，也不是 Turnstile 校验失败。浏览器已经拿到了一份 HTML，但客户端启动时加载的某个 JS chunk 不对，Next.js 捕获异常后画出这张错误页。

## 2. 时间线

时间均为 UTC，2026-08-15。

| 时间 | 事件 |
| --- | --- |
| 约 15:17 | 生产构建 `d0c9beac` 开始，提交 `18a29de`（merge DEV → 生产，内容是 Invisible Turnstile 预取、去掉结束留言按钮、去掉消息列表 `content-visibility`） |
| 15:20:00 | Worker 版本 21 上传并 100% 上线（version id `66074f2d-c0c9-4a04-a147-bfbe327cf00d`） |
| 之后不久 | 用户反馈首页 Application error |
| 排查前期 | 我对比 `GET /` 和 `GET /?t=...`，确认裸 `/` 的 HTML 引用旧 layout hash，带查询参数的页面引用新 hash |
| 排查中 | 我对 zone `e88fbee2ebef983ee2ac11d42babd621` 做了 `purge_everything` 以及按 URL purge。API 返回成功，裸 `/` 仍是旧 HTML，etag 不变，`age` 继续增长 |
| 排查中 | 我用 `RSC: 1` 和 `Next-Router-*` 头请求了 `GET /`。这次响应后来被 Workers Caching 按一年 TTL 存住，把首页从「旧 HTML」进一步污染成「RSC 载荷」 |
| 15:42:07 | 按用户指定方案：只关 `cache.enabled`，DEV 提交 `fe8b50a`，合并生产 `9552fe8`，构建 `791875e4` 开始 |
| 15:44:52 | Worker 版本 22 上传并 100% 上线（version id `293b4fc5-ef1b-4c0e-bf6d-ba924338a484`） |
| 15:44 后 | 裸 `GET https://solidays.win/` 恢复为 `200` + `text/html`，引用 `layout-568e05df8316b896.js`，该 JS 为 `200` + `text/javascript` |

## 3. 直接原因（已核实）

首页 HTML 和新部署的 JS 对不上。

事故当时测到的事实：

- `GET https://solidays.win/`
  `200`，`content-type: text/html`，`cf-cache-status: HIT`，`cache-control: s-maxage=31536000`
  HTML 引用 `/_next/static/chunks/app/layout-cb3c7e26a9b32bff.js`
- 同一份旧 HTML 还引用旧 CSS `eaadec33d67b366d.css`
- `GET https://solidays.win/_next/static/chunks/app/layout-cb3c7e26a9b32bff.js`
  `404`，`content-type: text/html`（返回的是整页 HTML，不是 JS）
- `GET https://solidays.win/?t=<timestamp>`
  `200`，`cf-cache-status: MISS`
  HTML 引用 `/_next/static/chunks/app/layout-568e05df8316b896.js`
- 新 layout JS：`200`，`content-type: text/javascript`
- `GET /about`、`GET /fnds` 在 cache MISS 时也引用新 hash `568e05df8316b896`
- 对 `/` 发 RSC 请求时，RSC 正文里同样出现新 hash `568e05df8316b896`

因此：

1. 新构建本身是好的。新 JS 在线上，其它未命中旧缓存的入口都能拿到正确 HTML。
2. 裸 `/` 仍在吐上一版 HTML。浏览器按旧 HTML 去拉 `layout-cb3c…js`，文件已经不在，404 回来的是 HTML。客户端当 JS 执行，抛错，出现 Application error。
3. 这不是 `app/page.tsx`、留言组件或 Turnstile 运行时抛错。

触发这次错位的部署是 `18a29de`。那次合并改的是聊天发送预取、去掉结束留言按钮、去掉消息列表 `content-visibility`。这些改动会让 `layout` chunk hash 变化；hashed 资源随新 Worker / ASSETS 一起替换后，旧 HTML 就会指向不存在的文件。

## 4. 缓存层是怎么叠在一起的

### 4.1 Workers Caching（事故主层）

`wrangler.jsonc` 当时是：

```jsonc
"cache": {
  "enabled": true,
}
```

没有 `cross_version_cache`。

这打开的是 Cloudflare Workers Caching，发生在 Worker `fetch` 执行之前。OpenNext 对 SSG 页面会输出：

```text
Cache-Control: s-maxage=31536000
```

也就是共享缓存一年。首页 `/`、`/about` 都是静态页，因此 Workers Caching 会把 Worker 的响应按 URL 存一年。

Workers Caching 的 cache key 默认包含 path 和 query string，所以：

- `/`
- `/?t=123`
- `/?nocache=1`

是三条独立缓存。这就是「带参数的首页正常、裸 `/` 坏着」的原因。用 `/?test=123` 做健康检查会误判站点已恢复。

Cloudflare 文档还写明：Dashboard / zone API / Terraform 的 purge **清不掉** Workers Caching。这一层只能由 Worker 里调用 `ctx.cache.purge()`。我两次 zone `purge_everything` 都返回成功，裸 `/` 仍是同一个 etag（当时是 `"13p94zkr5w0gnj"`），`age` 从约 478 涨到 682。这与官方行为一致。

关掉 `"cache": { "enabled": false }` 之后，新版本不再查询、也不再写入这一层。旧条目可以还在，但不会再被用到。这是后来采用的最小修复。

### 4.2 Zone CDN 缓存

zone 级缓存和 Workers Caching 不是同一层。`purge_everything` 清的是前者。事故里即使 zone 清掉了，Workers Caching 仍会把旧 `/` 再填回去，或根本不经过 zone 层。不能把 zone HIT/MISS 当成唯一证据，但当时裸 `/` 在 purge 后仍 HIT 且 etag 不变，已经足够说明有一层 purge 打不到的缓存。

### 4.3 OpenNext incremental cache

`open-next.config.ts` 是：

```ts
export default {
  ...defineCloudflareConfig({}),
  buildCommand: 'node .yarn/releases/yarn-3.6.1.cjs build',
}
```

`defineCloudflareConfig({})` 默认 incremental cache / tag cache / queue / cdn invalidation 都是 `"dummy"`。仓库里没有 `NEXT_INC_CACHE_R2_BUCKET`，也没有接入 `r2IncrementalCache`。
`custom-worker.ts` 虽然 re-export 了 `BucketCachePurge`、`DOQueueHandler`、`DOShardedTagCache`，但 wrangler 里没有对应的 Durable Object / R2 incremental cache 绑定，它们不是这次首页旧 HTML 的来源。

OpenNext 官方建议长缓存的是 `/_next/static/*` 这种文件名带内容 hash 的 immutable 资源，不是整个 Worker 输出的 HTML/RSC。

### 4.4 静态资源 ASSETS

`.open-next/assets` 里没有首页 `index.html`，只有 `_next/static`、`BUILD_ID`、`search.json` 等。裸 `/` 不是当作静态 HTML 文件直接端出去的，而是 Worker / OpenNext 渲染后再被 Workers Caching 存住。

## 5. 我在排查时做了什么，哪些是错的

### 5.1 做对的

- 没有先改留言代码。先对比了裸 `/` 和带 query 的 HTML，以及对应 JS 的状态码和 Content-Type。
- 确认新 JS `layout-568e05df8316b896.js` 存在，旧 JS `layout-cb3c7e26a9b32bff.js` 404。
- 确认 Worker 版本 21 已 100%，不是灰度各吃一半。
- 指出 zone purge 清不掉这一层。这一点后来用 Cloudflare 文档核对成立。

### 5.2 做错的，而且把事故加重了

我用下面这类头打了精确地址 `/`：

```text
RSC: 1
Next-Router-State-Tree: ...
Next-Router-Prefetch: 1
```

Workers Caching 默认**不会**因为普通请求头不同就自动拆缓存。`Accept`、`Cookie`、`RSC` 都不默认进入 cache key，除非响应 `Vary` 真正生效。Next.js App Router 同一个 pathname 会返回 HTML、RSC、prefetch 等不同协议体，靠 `Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch` 和 `_rsc` 查询参数区分。

当时响应头里有这条 `Vary`，但 Workers Caching 仍把 RSC 体当成 `/` 的长期缓存。之后即使用浏览器式请求：

```text
Accept: text/html,application/xhtml+xml,...
```

去拉 `https://solidays.win/`，得到的也是：

```text
content-type: text/x-component
cf-cache-status: HIT
```

正文开头是 `1:"$Sreact.fragment"`，不是 `<!DOCTYPE html>`。

也就是说：用户原先看到的是「旧 HTML + 缺失的旧 JS」；在我探测之后，裸 `/` 变成了「RSC 载荷被当成首页」。这是我造成的二次事故，不是 `18a29de` 业务代码写坏了页面。

用户随后明确要求：先别再让我动生产、不要继续 purge。这个要求是对的。

### 5.3 当时结论不完整的地方

我一度把整件事说成「全部都是这一层 Worker cache，新部署还在吃旧响应」。这里少了一段。

Cloudflare 当前默认：Worker version 在 cache key 里。新 deployment 应该是冷缓存，不该直接复用上一版本的 Workers Cache。只有显式：

```jsonc
"cache": {
  "enabled": true,
  "cross_version_cache": true
}
```

才会跨版本复用。仓库里**没有** `cross_version_cache`。

因此「新版本仍在吃上一版 Worker cache」不能当作已证明的完整因果。更稳妥的表述是：

1. 裸 `/` 被 Workers Caching 以一年 TTL 按 URL 存住，zone purge 无效。这已核实。
2. 新部署后裸 `/` 仍是旧 HTML。可能是跨版本缓存（未在配置里看到开关）、新版本自己第一次填入了旧 HTML、或还有未单独证伪的其它层。当时没有把这三件事拆开证完。
3. 我随后的 RSC 请求把 `/` 的缓存体从旧 HTML 换成了 RSC。这已核实，而且是我造成的。

没有在配置里找到 `cross_version_cache: true`。没有证据表明 OpenNext dummy incremental cache 跨部署保存了旧 HTML。没有再去打开 Dashboard 翻其它隐藏开关。恢复站点优先于把第 2 点穷尽。

### 5.4 差点做错、后来停住的

第一次排查时我准备改 `custom-worker.ts`、包一层 HTML Cache-Control、甚至继续 purge。用户制止后，第二次按指定方案只关 `cache.enabled`，走 DEV → 生产，不再 purge，也没有重写网站。

## 6. 处置

按用户指定的最小方案，没有 purge，没有改页面代码。

1. 在 `cloudflare-worker-DEV` 把

```jsonc
"cache": {
  "enabled": true,
}
```

改成

```jsonc
"cache": {
  "enabled": false,
}
```

2. `AGENTS.md` 补了一条：在单独设计 HTML/RSC 缓存之前不要重新打开 Workers Caching。
3. DEV 提交：`fe8b50a` `fix: disable Workers Caching to stop stale homepage HTML`
4. 合并生产：`9552fe8`
5. Workers Build `791875e4` success
6. 线上版本 22，`293b4fc5-ef1b-4c0e-bf6d-ba924338a484`，100%

`open-next.config.ts` 未改。Turnstile / 留言代码未改。没有调用 `ctx.cache.purge()`。没有本地 `worker:deploy` 绕过 CI。

## 7. 恢复后的验收

只测精确地址，不用查询参数当健康检查。

| 请求 | 结果 |
| --- | --- |
| `GET https://solidays.win/` | `HTTP/2 200`，`content-type: text/html; charset=utf-8`，正文以 `<!DOCTYPE html>` 开头 |
| 该 HTML 引用的 layout | `layout-568e05df8316b896.js` |
| `GET .../layout-568e05df8316b896.js` | `200`，`content-type: text/javascript` |
| `GET https://solidays.win/about` | `text/html`，同一 layout hash（对照，不是健康检查替代） |

Workers Caching 保持关闭。

## 8. 相关提交和版本

| 角色 | Hash / ID |
| --- | --- |
| 触发事故的生产合并 | `18a29de` |
| 其中的功能提交 | `933bca7`（预取 token、去掉结束留言、去掉 content-visibility） |
| 修复提交 | `fe8b50a` |
| 修复的生产合并 | `9552fe8` |
| 事故时线上 Worker | 版本 21，`66074f2d-c0c9-4a04-a147-bfbe327cf00d` |
| 恢复后线上 Worker | 版本 22，`293b4fc5-ef1b-4c0e-bf6d-ba924338a484` |
| 事故时构建 | `d0c9beac` success |
| 修复构建 | `791875e4` success |
| zone id | `e88fbee2ebef983ee2ac11d42babd621` |

## 9. 事后约束

1. 不要重新打开 `"cache": { "enabled": true }`，直到单独设计过 HTML / RSC / prefetch 的缓存策略。
2. `/_next/static/*` 带内容 hash，可以按 OpenNext 建议做一年 immutable 缓存；不要把同样的 TTL 套在整个 Worker 输出上。
3. 生产健康检查只用裸 `https://solidays.win/`，不要用 `/?x=`。
4. 不要对生产 `/` 发 RSC / `Next-Router-*` 探测，除非已经确认不会写入长期共享缓存。
5. zone purge 不能当作 Workers Caching 的修复手段。
6. 生产变更继续走 DEV → 验证 → 合并 `cloudflare-worker` → Workers Builds，不要用本地 `worker:deploy` 救火，除非 CI 失败或用户明确要求。

## 10. 仍未闭合的问题

这些当时没有证完，恢复后再查，不要在事故中途再改生产：

- 在没有 `cross_version_cache: true` 的前提下，版本 21 上线后裸 `/` 为什么第一次填进去的是旧 HTML，而不是新构建的 HTML。
- 当时线上 Worker 的实际 cache 配置是否和仓库 `wrangler.jsonc` 完全一致，有没有 Dashboard 覆盖。
- Workers Caching 为何在响应带有 Next.js `Vary` 时，仍让 RSC 体污染了普通 HTML 的 `/`。
- 若以后要重新开启 Workers Caching，HTML 与 RSC 应如何拆 key（正确 `Vary`、`_rsc` 查询参数、或根本不缓存 HTML）。

记录人：Grok 4.6（xAI）
写入日期：2026-08-15
