# 发布流程

> 原 AGENTS.md「Cloudflare 操作原则」「分支与发布约定」「生产部署流程」「变更和提交
> 约定」拆分至此（2026-08-16）。

## Cloudflare 操作原则

- Cloudflare 相关操作默认优先使用项目自带 Yarn 和 Wrangler CLI 完成，不要通过
  Cloudflare Dashboard/浏览器 UI 执行 Cloudflare 操作。
- 日常部署、版本查询、绑定检查、D1/R2 操作、Worker 日志和线上冒烟测试都通过 CLI
  完成；需要账号、网络或 macOS Keychain 时，在沙箱外运行，并设置
  `WRANGLER_WRITE_LOGS=false`。
- GitHub → Cloudflare Workers Builds 的仓库连接已经完成，不要重复进入浏览器配置。
- 只有 CLI/API 不支持的 Cloudflare 操作，或用户明确要求时，才使用 Dashboard；不要
  为了查询部署状态切换到 Dashboard。
- 绝不在命令参数、日志、提交记录或文档中输出 Cloudflare Token、Worker Secret 或
  其他凭据。

## 分支模型

- `cloudflare-worker-DEV`：日常开发、调试和功能提交分支；默认在这个分支工作。
- `cloudflare-worker`：生产分支；只接受已经在 DEV 分支验证过的改动。
- DEV 推送不应更新生产 Worker；不要直接在 `cloudflare-worker` 上开发或提交。

## 日常开发

```bash
git switch cloudflare-worker-DEV
git pull --ff-only origin cloudflare-worker-DEV
# 修改、检查和本地验证（见 docs/development/local-development.md）
# 提交前必须完成 Worker + Chrome DevTools 验证（见 docs/testing/pre-commit-verification.md）
git add -A
git commit -m "<describe change>"
git push origin cloudflare-worker-DEV
```

提交前先检查 `git status --short --branch`；保留用户已有改动，不使用破坏性重置
命令。生成的 `.next/`、`.open-next/`、`.wrangler/` 和本地环境文件不应提交。

## 发布生产

当前生产主流程是 GitHub → Cloudflare Workers Builds，目标仓库是
`francis1104/tailwind-nextjs-starter-blog`，生产分支是 `cloudflare-worker`；只有生产
分支推送才触发线上发布。Workers Builds 中的命令已经配置为：

```text
构建命令：yarn worker:build
部署命令：yarn worker:deploy:ci（先应用 D1 远程迁移，再部署 Worker）
```

正常发布按以下顺序执行：

1. 在 DEV 分支确认工作区和分支：`git status --short --branch`。
2. 停止本地开发服务器。构建和开发服务器不能同时运行，否则可能互相覆盖 `.next`
   或 `.open-next` 产物。
3. 使用项目自带 Yarn 做检查和构建：

   ```bash
   node .yarn/releases/yarn-3.6.1.cjs lint
   node .yarn/releases/yarn-3.6.1.cjs worker:types
   node .yarn/releases/yarn-3.6.1.cjs worker:build
   WRANGLER_WRITE_LOGS=false node .yarn/releases/yarn-3.6.1.cjs worker:deploy:ci --dry-run
   ```

4. 在 DEV 分支提交并推送：

   ```bash
   git add -A
   git commit -m "<describe change>"
   git push origin cloudflare-worker-DEV
   ```

5. 切到生产分支并同步，然后合并 DEV：

   ```bash
   git switch cloudflare-worker
   git pull --ff-only origin cloudflare-worker
   git merge --no-ff cloudflare-worker-DEV -m "merge cloudflare-worker-DEV into production"
   ```

6. 推送生产分支：

   ```bash
   git push origin cloudflare-worker
   ```

7. 推送后由 Workers Builds 自动运行构建和部署；`worker:deploy:ci` 会先应用 D1 远程
   迁移，再部署 Worker。正常发布不要再手动执行 `worker:deploy`，避免重复构建或
   绕过 CI。等待 CI 时每 2 分钟检查一次，不要高频轮询：

   ```bash
   sleep 120
   ```

8. 用 Wrangler CLI 核验最新部署和绑定；每次检查间隔 120 秒，直到新版本出现并接收
   100% 流量：

   ```bash
   WRANGLER_WRITE_LOGS=false node .yarn/releases/yarn-3.6.1.cjs exec wrangler deployments list --name solidays-worker --json
   WRANGLER_WRITE_LOGS=false node .yarn/releases/yarn-3.6.1.cjs exec wrangler versions view <VERSION_ID> --json
   ```

9. 用 CLI 做线上冒烟测试：

   ```bash
   curl -sS -o /dev/null -w '%{http_code} %{url_effective}\n' https://solidays.win/
   curl -sS -o /dev/null -w '%{http_code} %{url_effective}\n' https://solidays.win/fnds
   curl -sS -o /dev/null -w '%{http_code} %{url_effective}\n' https://solidays.win/api/cards
   curl -sS https://solidays.win/api/chat/conversation
   ```

10. 按 `docs/testing/post-deployment-verification.md` 用 Chrome DevTools 打开
    线上站点，对本次发布改动的功能做实际测试；真实 Turnstile 提交等防自动化
    环节按该文档的替代方案验证。

修改 `wrangler.jsonc` 后至少执行一次
`node .yarn/releases/yarn-3.6.1.cjs worker:build`。线上部署后验证主域名、`www`
跳转和关键媒体路径。

## CI 不可用时的手工回退

只有 Workers Builds 明确失败、暂停或用户明确要求手工发布时，才使用本地 Wrangler
回退：

```bash
node .yarn/releases/yarn-3.6.1.cjs worker:deploy
```

`worker:deploy` 会先用项目自带 Yarn 构建，再通过 `OPEN_NEXT_DEPLOY=true` 调用
Wrangler；当前 Turnstile 配置和生产部署均已完成。部署后验证
`GET /api/chat/conversation`、Turnstile 失败返回和正式留言写入，不要用生产 token
绕过验证。

`OPEN_NEXT_DEPLOY=true` 用来告诉 Wrangler 当前已经由 OpenNext 生成了
`.open-next/worker.js`，避免 OpenNext 和 Wrangler 互相递归调用。构建产物位于
`.open-next/`，不应手工编辑或提交生成目录。

部署后至少验证：

```bash
curl -sS -L -o /dev/null -w '%{http_code} %{url_effective}\n' https://solidays.win/
curl -sS -L -o /dev/null -w '%{http_code} %{url_effective}\n' https://www.solidays.win/
```

预期是自定义域名 `200`、`www` 跳转主域名后 `200`；`workers_dev` 已关闭，不把
`workers.dev` 当作生产入口。
