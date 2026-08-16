# 项目优化事项清单

> 生成日期：2026-08-16（基于 `cloudflare-worker-DEV` 分支代码审查）
> 项目：solidays-worker（Next.js App Router + OpenNext for Cloudflare）

## 处理进度（2026-08-16 更新）

以下 16 项已全部处理完毕，验证方式：`yarn lint`、`yarn typecheck`、`yarn test`（20 个用例）、`yarn worker:build` 全部通过。

- 第 1 项 ✅ `purgeExpiredChatData` 同时返回消息/会话删除数，循环在任一批次删满时继续。
- 第 2、9、16 项 ✅ `MusicDock` 整体重构：ref 赋值移入 effect、事件监听只绑定一次、去掉每秒轮询和全部 `setTimeout` 重试、三段 localStorage 恢复逻辑合并、新增加载失败重试入口和"整轮播放失败"防无限切歌保护。
- 第 3 项 ✅ 迁移触发器与 `lib/chat/limits.ts` 互加同步警告注释（生产迁移已应用，长期方案仍是改配额需新增迁移）。
- 第 4 项 ✅ `wrangler.jsonc` 移除 `CHAT_LOCAL_DEV` vars（只由 `worker:dev --var` 注入本地），`turnstile.ts` 的放宽分支叠加 http 协议硬性判断，生产 https 流量即使误配也不生效；`security.ts` 原本已有该判断。
- 第 5 项 ✅ `eslint-plugin-jsx-a11y` 已显式加入 devDependencies。
- 第 6 项 ✅ `body-scroll-lock` 已移除，`MobileNav` 改为自实现 overflow 恢复；`@shadcn/react` 经确认是聊天滚动 runtime 的真实依赖，保留。
- 第 7 项 ✅ middleware 对 https 响应加 `Strict-Transport-Security: max-age=31536000; includeSubDomains`（未加 preload，待确认无 http 子域后再考虑）。
- 第 8 项 ✅ 变体路径生成基于 R2 etag 的可协商 ETag 并支持 `If-None-Match` 304；原始路径补 `nosniff` 和 304；`?variant=card` 的 width 不在 320/480/640 内直接返回 400（前后端共用 `lib/media.ts` 的宽度契约）。
- 第 10 项 ✅ `CardStack` 简化为固定 3 层（1 真卡 + 2 空白后层），删除未使用的 `offset`/`scaleFactor`/`stackDepth` props。
- 第 11 项 ✅ ESLint 移除全量类型感知解析（单文件从 7 分钟降到秒级）、修正误导性 parserOptions、恢复 `no-unused-vars`（`^_` 豁免）并清理暴露的遗留未使用变量；lint 范围补上 `middleware.ts`、`custom-worker.ts`。
- 第 12 项 ✅ `/api/cards` 按 AGENTS.md 约定保留为 D1 数据边界，注释改为明确"删除前先确认没有外部调用方"。
- 第 13 项 ✅ 域名常量合并到 `lib/constants.ts`，`middleware.ts`/`security.ts`/`turnstile.ts` 统一引用。
- 第 14 项 ✅ `isQuotaExceededError` 加注释说明对 D1 错误包装格式的依赖，升级时需回归第 51 条消息用例。
- 第 15 项 ✅ 引入 Vitest（`tests/`，20 个用例覆盖 chat 安全校验、消息游标、媒体 key/宽度契约），新增 `test` 和 `typecheck`（`--composite false` 绕开生成文件的 TS6307）脚本。

遗留事项：HSTS preload 未启用；配额字面量仍是双份定义（靠注释同步）；AGENTS.md 的"可选回归"（重复 token、429、关闭幂等）仍待做；MusicDock 重构建议在合并生产前做一次真机播放回归。

---

优先级从高到低排列。P0/P1 建议在下次发布前处理；P2/P3 可排入日常迭代。

---

## P0 — 高优先级（影响正确性 / 有停滞风险）

### 1. Cron 清理循环可能提前退出，导致过期数据永远清不完
- 位置：`custom-worker.ts:42-49`、`lib/chat/db.ts:281-296`
- 问题：批处理循环以 `result.conversations < purgeBatchSize` 作为终止条件。如果某一批删除了消息但对应的过期会话未被删除（两个子查询的 ID 集合不完全一致），循环会提前退出；每天最多 10 批 × 100 行，一旦出现积压将永远追不上。
- 建议：把 `results[0].meta.changes`（消息删除数）也纳入继续条件，即 `messages + conversations > 0` 时继续下一批；同时观察免费计划 cron 的 CPU 时间（每批 4 个顺序查询，已接近上限）。

### 2. `MusicDock` 渲染期间直接赋值 ref + 无限重试链
- 位置：`components/MusicDock.tsx:108、314、553`（渲染期赋值 ref）；`:399-401`（`togglePlay` 递归 setTimeout 重试）；`:576-577`（JSX 内读 `audioRef.current.src` 决定渲染）
- 问题：这是已知 lint warning 的根源。渲染期赋值 ref 在 React 严格模式/并发特性下行为不可靠；`togglePlay` 失败时 `setTimeout(() => togglePlay(), 100)` 会无限自调用。
- 建议：ref 赋值移入 `useEffect` 或改用带正确依赖的 `useCallback`；递归重试加最大次数上限；`audioRef.current.src` 的读取移到 state/effect。文件内还有 9 处 `setTimeout(…, 100)` "等状态更新"的脆弱模式，建议随本次重构一并改为 effect 驱动。

### 3. D1 触发器中的配额字面量与代码重复定义
- 位置：`migrations/0002_chat_quotas.sql:57-81` 与 `lib/chat/limits.ts:2-5`
- 问题：`50 / 131072 / 200 / 524288` 在 SQL 触发器和 TS 常量里各写一份，改一处漏一处会导致限流提示与实际行为不一致。
- 建议：短期在两处加注释互相引用并约定同步修改；长期把配额改为由迁移写入一张 `chat_settings` 表，触发器从表里读值。

---

## P1 — 中高优先级（安全 / 依赖健康）

### 4. 确认 `CHAT_LOCAL_DEV` 不会出现在生产 vars
- 位置：`lib/chat/turnstile.ts:23-28`、`wrangler.jsonc`
- 问题：`CHAT_LOCAL_DEV` 会绕过 Turnstile 校验（含 `solidays.win` 主机名）。目前它只在本地 `.dev.vars` 中，但没有任何防呆。
- 建议：检查 `wrangler.jsonc` 无此 var；在 `turnstile.ts` 中加注释警告"绝不能进入生产 vars"；也可在代码里当 `env.ENVIRONMENT === 'production'` 时强制忽略该标志。

### 5. `eslint-plugin-jsx-a11y` 未显式声明为依赖
- 位置：`eslint.config.mjs`（`compat.extends('plugin:jsx-a11y/recommended')`）、`package.json`
- 问题：当前靠间接依赖才生效，任何上游升级都可能让它消失并改变 lint 行为。
- 建议：`node .yarn/releases/yarn-3.6.1.cjs add -D eslint-plugin-jsx-a11y`。

### 6. `body-scroll-lock` 已停止维护
- 位置：`package.json:23`（仅 1 处使用）
- 建议：用几行 `overflow: hidden` + `position: fixed` 的自实现或 `react-remove-scroll` 替换，减少不可维护依赖。同时确认 `@shadcn/react`（package.json:22）是否只是 CLI 工具残留，若是则移除。

### 7. 缺少 HSTS 响应头
- 位置：`middleware.ts:10-15`
- 问题：已有 308 canonical 重定向，但没有 `Strict-Transport-Security`。
- 建议：在 middleware 中对 https 响应加 `Strict-Transport-Security: max-age=31536000; includeSubDomains`（确认无 http 子域后再加 preload）。

---

## P2 — 中优先级（性能 / 代码质量）

### 8. 媒体路由变体响应缺少 ETag / 校验头
- 位置：`app/media/[...key]/route.ts:44-68`
- 问题：`?variant=card` 路径没有 ETag、Last-Modified；原始路径（`:75`）有 ETag 但缺 `x-content-type-options: nosniff`（变体路径在 `:61` 有）。另外 `?variant=card` 不带 width 参数时静默回退 640 宽。
- 建议：变体路径基于 object key + width 生成弱 ETag；原始路径补 `nosniff`；width 缺失或非法时显式返回 400 或固定回退值。

### 9. `MusicDock` 冗余的每秒轮询与重复 localStorage 逻辑
- 位置：`components/MusicDock.tsx:382`（`setInterval(syncAudioState, 1000)` 与 `:194` 的 `timeupdate` 监听重复）；`:54-86、152-183、348-374`（三段重复的 localStorage 恢复逻辑）
- 建议：删掉轮询只保留 `timeupdate`；三段恢复逻辑合并为一个 `loadPersistedPlayerState()` 工具函数。可与第 2 项一起重构。

### 10. `CardStack` 的 `stackDepth`/占位符机制是死代码
- 位置：`components/ui/CardStack.tsx:11-27、33、41、56`；`app/page.tsx:7-15`
- 问题：组件没有任何移除/切换交互，`layers` 数组 + `undefined` 占位 + `offset`/`scaleFactor` 重命名常量（`:22-23`）都是为未来预留的 YAGNI 代码。
- 建议：简化为直接渲染 1 张真实卡片 + 2 个空白后层的简单 map；未在调用点覆写的 `offset`/`scaleFactor` props 可以删除。

### 11. ESLint 慢到不可用 + `no-unused-vars` 关闭
- 位置：`eslint.config.mjs`（`parserOptions.project: true` 全量类型感知解析，单文件 lint 超 7 分钟；`:36-38` 的 `ecmaVersion: 5, sourceType: 'commonjs'` 是误导性配置；`:48` 关闭了未使用变量检测）
- 建议：移除 `project: true` 或仅对少数文件启用类型感知规则；修正 parserOptions 字面量；恢复 `no-unused-vars`（带 `argsIgnorePattern: '^_'`），有助于暴露第 10 项这类死代码。另外 lint 范围未覆盖 `middleware.ts` 和 `custom-worker.ts`，建议补上。

---

## P3 — 低优先级（可选 / 记录在案）

### 12. `GET /api/cards` 的去留
- 位置：`app/api/cards/route.ts:3-8`
- 现状：`force-static` 返回硬编码数据，AGENTS.md 已定位为"未来 D1 数据边界"。若长期不接 D1，可考虑删除以减少表面积；若保留，清理文件中过时的迁移注释。

### 13. 生产域名常量三处重复
- 位置：`lib/chat/security.ts:1`、`lib/chat/turnstile.ts:27`、`middleware.ts:3-4`
- 建议：合并到一个 `lib/constants.ts`。

### 14. `isQuotaExceededError` 依赖错误字符串匹配
- 位置：`lib/chat/db.ts:11-14`
- 问题：D1 更改错误包装格式时会静默失效。
- 建议：保持现状但加版本注释；升级 Wrangler/D1 时回归验证"第 51 条消息被拒绝"用例（AGENTS.md 已列）。

### 15. 无任何自动化测试
- 现状：项目没有 test runner 和测试文件，类型检查仅靠 `next build`。
- 建议：至少为 `lib/chat/`（限流、Turnstile 校验、配额错误识别）和 `app/media` 路径校验补 Vitest 单测；AGENTS.md 中的"可选回归"项（重复 token、429、关闭幂等）可作为首批用例。加 `typecheck`（`tsc --noEmit`，排除生成文件的 TS6307）和 `test` 脚本到 package.json。

### 16. 音乐 API 不可用时的体验
- 位置：`components/MusicDock.tsx:561-569、284-294`
- 问题：第三方 `NEXT_PUBLIC_MUSIC_API_URL` 失败或结果被 Eason 过滤器全部丢弃时，缺少用户可见反馈。
- 建议：失败时显示轻量错误态/重试按钮；过滤器丢弃全部结果时给提示。

---

## 建议处理顺序

1. 先做第 1 项（Cron 清理）+ 第 3 项（配额常量）——数据层正确性，改动小。
2. 再做第 4、5 项——安全防呆与依赖健康，各半小时内。
3. 第 2 + 9 + 16 项合并为一次 `MusicDock` 重构（AGENTS.md 提示单独处理，不要混入功能提交）。
4. 第 8、10、11 项按需排入日常迭代。
5. 第 12-15 项作为 backlog，发布流程不变。
