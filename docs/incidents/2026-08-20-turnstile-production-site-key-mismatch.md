# 生产 Turnstile Site Key 错配事故

## 基本信息

- 日期：2026-08-20
- 影响范围：`solidays.win` 匿名留言提交
- 严重程度：P1（留言提交不可用，但已有会话和历史读取不受影响）
- 状态：已修复并完成生产验证

## 用户表现

线上访客打开留言框后，提交留言提示“验证未通过”。请求没有进入正常的留言写入流程，用户无法完成留言提交。

## 现象与证据

Worker 日志中的 `chat_message_timing` 显示：

- HTTP 结果为 403；
- `turnstile_failed`；
- Turnstile 校验耗时只有几毫秒。

这说明失败发生在 Turnstile Siteverify，而不是 D1 写入、Durable Object 广播或前端消息去重阶段。

进一步读取线上实际下发的 Next.js 客户端 bundle 后，发现浏览器使用的是 Cloudflare 官方 dummy Site Key，而不是生产 widget 的公开 Site Key。生产 Worker Secret 已配置，但前后端属于不同的 Turnstile key pair，因此真实 token 被拒绝。

## 根因

生产部署当时直接执行了：

```text
opennextjs-cloudflare build
```

仓库同时存在：

- `.env.local`：本地开发用 dummy Site Key；
- `.env.production`：生产用公开 Site Key。

Next.js 的环境变量优先级中，`.env.local` 高于 `.env.production`。因此直接执行 OpenNext 构建时，本地 dummy key 被打进了生产客户端 bundle。生产 Worker 侧的 `TURNSTILE_SECRET_KEY` 没有与这个错误的客户端 key 配套，导致所有真实生产 token 校验失败。

单独重新写入 Worker Secret 不能修复这个问题，因为错误发生在已经发布的客户端 bundle；浏览器仍然继续发送 dummy key 生成的 token。

## 修复

1. 新增 `scripts/build-worker.mjs`：从 `.env.production` 读取生产 Site Key，缺失或检测到测试 key 时直接失败，并以显式环境变量启动 OpenNext 构建。
2. `worker:build` 和 `worker:deploy` 统一使用该生产构建入口。
3. `worker:dev` 显式注入本地 dummy key，避免本地开发依赖生产 key。
4. 更新 README、本地开发文档和 Cloudflare 资源说明，明确生产 Site Key 的唯一来源。
5. 重新部署 Worker，并检查线上实际客户端 bundle：包含生产 Site Key，不包含 dummy key。
6. 通过内置浏览器验证生产首页、聊天框和历史读取；用户随后确认留言验证恢复正常。

本次没有修改 D1 schema，没有新增 migration，也没有删除或改写历史留言。

## 预防措施

提交前的本地行为测试完成后，必须追加“生产配置可合并检查”：

```bash
node .yarn/releases/yarn-3.6.1.cjs worker:build
node .yarn/releases/yarn-3.6.1.cjs worker:check:production
WRANGLER_WRITE_LOGS=false node .yarn/releases/yarn-3.6.1.cjs exec wrangler deploy --dry-run --config wrangler.jsonc
```

该检查会验证：

- `.env.production` 中的生产 URL 和非测试 Site Key；
- `wrangler.jsonc` 中的生产 Worker、域名、D1、Durable Object、实时开关和 required secret 声明；
- `.open-next` 产物存在生产 Site Key，且不存在已知 Turnstile dummy key。

生产构建禁止直接调用 `opennextjs-cloudflare build`。Workers Builds 和手工回退都必须使用项目 Yarn 命令。

## 后续验证

- DEV 修复提交：`936d10c`
- 生产合并提交：`61008d5`
- 修复版本已接收 100% 生产流量。
- 线上生产 bundle 检查通过。
- 本地 lint、Next build、OpenNext Worker build 和聊天回归测试通过。
