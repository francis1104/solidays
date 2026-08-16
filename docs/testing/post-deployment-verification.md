# 发布后线上验证（Chrome DevTools）

> 建立于 2026-08-16。所有生产发布完成之后都必须走本流程：用 Chrome DevTools
> 访问线上生产站点，对本次发布改动的功能做实际测试。涉及 Turnstile 等
> 防自动化的环节不做自动化提交测试，按第 3 节的替代方案验证。本流程不替代
> `docs/deployment/release-process.md` 中的 CLI 核验与 curl 冒烟。

## 前置条件

1. Workers Builds 部署完成，新版本接收 100% 流量（`deployments list` 核验，
   见 release-process.md 第 8 步）。
2. curl 冒烟全部通过（release-process.md 第 9 步：主域名、`/fnds`、
   `/api/cards`、`/api/chat/conversation`）。

## 1. 基线检查

用 Chrome DevTools MCP 打开 `https://solidays.win`：

- `take_snapshot` / `take_screenshot` 确认首页渲染；
- `list_console_messages` 检查控制台，有 Error/Warning 时定位来源；
- `list_network_requests` 确认应用自身请求无 4xx/5xx；
- 抽查 `www.solidays.win` 308 跳转、`/fnds`、`/about`、`/media/` 关键路径。

**线上已知噪音，不算失败**：生产使用真实 Turnstile 密钥，MCP 自动化浏览器
（`navigator.webdriver === true`）无法通过真实挑战，页面会出现
`[Cloudflare Turnstile] Error: 600010` 循环、`challenges.cloudflare.com` 的
401/failure_retry 和反调试怪日志（成因见
`docs/testing/pre-commit-verification.md`）。判定标准仍是：本站代码不产生
新的 Error 或 Warning。

## 2. 测试本次发布改动的功能

- 测试范围与本发布内容对应：前端改动用 `take_snapshot` 拿 uid 后
  `click`/`fill` 实测交互，`take_screenshot` 目检；
- API / 后端改动用 `evaluate_script` 内 `fetch` 验证状态码与响应体；
- 基线检查保证未改动页面没有回归，改动路径逐一验证。

## 3. 防自动化功能的处理（真实 Turnstile 等）

生产是真实 Turnstile 密钥，自动化浏览器签发不出真实令牌，因此
`POST /api/chat/messages`（留言提交）**不做自动化端到端测试**。替代验证：

- `GET /api/chat/conversation` 返回 200 且结构正确（浏览器 fetch 或 curl）；
- 缺失/无效 token 的 `POST /api/chat/messages` 返回 400/403（curl 可测）；
- 真实留言提交由人工在普通浏览器完成一次冒烟即可。

## 4. 通过标准与失败处理

- 通过：应用自身请求无失败、控制台无本站代码 Error/Warning、本次改动的
  功能符合预期。
- 失败：立即停止后续操作，按 release-process.md 的回退流程恢复上一版本，
  并在 `docs/incidents/` 记录事故报告；问题定位清楚并修复前不做新发布。
