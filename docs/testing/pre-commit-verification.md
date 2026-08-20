# 提交前本地验证（Worker + Chrome DevTools）

> 建立于 2026-08-16。任何代码改动在提交（`git commit`）之前都必须走完本流程：
> 启动本地 Worker，用 Chrome DevTools 实际访问并对改动部分测试，必要时断点调试。
> 本流程不替代 lint/build 检查，两者都要做。

## 流程总览

```text
前置检查 → worker:dev 后台启动 → Chrome DevTools 打开 localhost:8787
→ 测试改动部分（页面交互 / API）→ 检查控制台与网络请求 → 通过后才允许 commit
```

## 1. 前置检查

```bash
git status --short --branch          # 确认分支和已有改动
lsof -nP -iTCP:3000 -iTCP:3001 -iTCP:8787 -sTCP:LISTEN   # 确认无旧进程
```

- 构建与 dev server 互斥（见 `docs/development/local-development.md`）；
  若 3001 上有本项目旧 dev server，先停掉再启动 Worker。
- 若改动涉及 D1 迁移，先执行
  `node .yarn/releases/yarn-3.6.1.cjs wrangler d1 migrations apply solidays-chat --local`。

## 2. 启动本地 Worker

后台运行（`worker:dev` 会先 OpenNext 构建再起 Wrangler，首次约 1 分钟）：

```bash
node .yarn/releases/yarn-3.6.1.cjs worker:dev
```

在输出日志中等待 `Ready on http://localhost:8787`，并核对绑定清单符合预期
（D1/Rate Limiter 为 local，R2/Images/AI 为 remote）。注意事项：

- R2/Images/AI 是 `remote: true`，会触真实资源，不做上传、删除或模型调用。
- Cron 本地不自动触发，需要时手动执行
  `curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=0+3+*+*+*"`。
- 已在跑的 Worker 可复用，不必每次重启；但改了代码就要重新 `worker:dev`
  （重建 `.open-next` 产物）。

## 3. Chrome DevTools 访问与基线检查

用 Chrome DevTools MCP 工具（工具名以 `mcp__chrome-devtools__` 开头）：

1. `navigate_page` 打开 `http://localhost:8787`。
2. `take_snapshot`（a11y 树）/ `take_screenshot` 确认页面渲染。
3. `list_console_messages` 检查控制台；有 Error/Warning 时用
   `get_console_message` 看 stack 和受影响资源，定位来源。
4. `list_network_requests` 确认应用自身请求（文档、chunk、CSS、RSC、API）
   无 4xx/5xx。

**本地已知第三方噪音，不算失败**（均来自 Turnstile，与本站代码无关）：

- Turnstile 与自动化浏览器：真实 Turnstile 令牌在自动化浏览器（Chrome
  DevTools MCP 驱动的实例，`navigator.webdriver === true`）里无法签发，
  表现为 `[Cloudflare Turnstile] Error: 600010` 循环和
  `challenges.cloudflare.com` 的 401/failure_retry；生产 widget 的域名已含
  `localhost`/`127.0.0.1`（`wrangler turnstile widget list --json` 可核对），
  与域名配置无关。本地已配置 Cloudflare 官方 dummy 测试密钥对（见
  `docs/development/local-development.md`），聊天提交可在 MCP 浏览器里
  端到端验证；真实 Turnstile 链路由发布后的线上冒烟与人工浏览器验证。
  测 403 路径可临时把 `.env.local` 的 sitekey 换成永失败的
  `2x00000000000000000000BB` 再重启 `worker:dev`。
- 主题切换的圆形扩散动画在自动化浏览器里圆心可能错位（渲染在屏幕中央而非
  按钮处）。已核实非代码问题：动画组件计算样式正确（伪元素尺寸等于视口、
  clip-path 圆心等于按钮中心），桌面 Safari 与移动端渲染正常，属自动化
  Chrome 对 View Transition 合成快照的渲染伪影。遇到时用人工浏览器复核，
  不要当回归排查。
- Shared Storage API 弃用、CSP 阻止 eval、Quirks Mode 三类 issue：受影响
  资源都在 `challenges.cloudflare.com` 的 Turnstile iframe 内。
- `%c%d font-size:0;color:transparent` 之类的怪异 console 批量输出：Turnstile
  api.js 的反调试混淆代码。

排除以上噪音后，**本站代码不得产生任何新的 Error 或 Warning**。

## 4. 测试改动部分

按改动类型选择验证方式，至少覆盖改动直接影响的路径：

- **前端页面改动**：`navigate_page` 到相关路由，用 `take_snapshot` 拿到元素
  uid 后 `click`/`fill`/`fill_form`/`press_key` 模拟真实交互，再
  `take_screenshot` 目检结果；动画/布局问题用 `performance_start_trace`。
- **API / 后端改动**：优先在真实浏览器上下文里验证——`evaluate_script` 内
  用 `fetch` 调接口检查状态码与响应体（能带上 Cookie 和 Origin）；纯 CLI
  场景可另用 `curl`。预期行为对照
  `docs/features/anonymous-chat/backend-implementation.md`。
- **聊天相关回归项**（改 `app/api/chat/**` 或 `lib/chat/` 时必测）：
  首次提交设置 HttpOnly Cookie、刷新可读历史、非法 body 400、Turnstile
  失败 403、超限 429、重复关闭幂等、关闭后提交创建新会话、历史分页上限。
  并发幂等 smoke 使用下面的自包含命令；不要预先手动启动另一个 8787 Worker：

  ```bash
  node .yarn/releases/yarn-3.6.1.cjs test:chat-local-concurrent
  ```

  该命令会在系统临时目录创建 persistence，给 Worker 和
  `wrangler d1 execute --local` 使用同一个目录，完成后关闭 Worker 并删除临时目录。
  8787 已被占用时会直接失败，不会连接未知的旧 Worker。
  默认每次都会重新执行 `worker:build`，避免复用过期 `.open-next` 造成 false pass。
  只有明确确认构建产物与当前源码一致时，才可用
  `CHAT_LOCAL_REUSE_BUILD=true` 跳过构建；普通验证不要设置该变量。

## 5. 生产配置可合并检查

本地行为测试通过后、`git commit` 之前，必须重新生成一次生产 Worker 产物并检查生产配置。
这一步是 DEV 提交的合并门禁：它确保当前 DEV commit 不会因为本地环境变量或过期构建产物而在生产失效。

```bash
node .yarn/releases/yarn-3.6.1.cjs worker:build
node .yarn/releases/yarn-3.6.1.cjs worker:check:production
WRANGLER_WRITE_LOGS=false node .yarn/releases/yarn-3.6.1.cjs exec wrangler deploy --dry-run --config wrangler.jsonc
```

`worker:check:production` 只检查仓库配置和本地产物，不打印任何 Secret；它会确认：

- `.env.production` 有生产 URL、媒体 URL 和非测试 Turnstile Site Key；
- `wrangler.jsonc` 的 Worker 名称、生产域名、`CHAT_LOCAL_DEV=false`、
  `CHAT_REALTIME_ENABLED=true`、D1、Durable Object 和 required secret 声明没有漂移；
- 当前 `.open-next` 包含生产 Site Key，且不包含已知的 Turnstile dummy key。

`wrangler deploy --dry-run` 用于校验 Wrangler 配置和构建资产，不会部署、不应用远程迁移。
Worker Secret 的值不会被 Git 或本地检查读取；发布前至少用只读的
`wrangler secret list --name solidays-worker` 确认 required secret 名称存在，禁止把 Secret 值写入日志。

此步骤必须在本地 `worker:dev` 停止后执行，因为 `worker:build` 会重写 `.next/` 和 `.open-next/`。

## 6. 断点调试（必要时）

- 首选 `evaluate_script`：直接在页面上下文检查运行时状态（组件挂载后的
  DOM、`window` 上的对象、包装 `fetch`/`console` 打点观察调用链）。
- 仍定位不了时，在代码中临时插入 `console.log` / `debugger;`，重启
  `worker:dev` 复现；**提交前必须移除所有临时调试代码**。
- 复杂交互可配合 `wait_for` 等待异步状态，再抓快照或执行脚本。

## 7. 通过标准与收尾

- 改动部分按预期工作，应用自身请求无失败，控制台无本站代码产生的
  Error/Warning（第三方噪音除外，见第 3 节）。
- 发现的问题修复后重新验证，不允许"先提交再线上看"。
- 测试用的 Worker 可保留后台运行供后续任务复用；要跑 `build`/`worker:build`
  前先停掉它。
