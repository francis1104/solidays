# AGENTS.md

这份文件是 Solidays Worker 项目的维护交接说明。开始修改前先阅读本文件和
`wrangler.jsonc`，不要把 Cloudflare Token、`.env.local` 或其他凭据写入仓库。

## 项目概况

- 项目：`solidays-worker`，Next.js App Router + Tailwind CSS + Framer Motion。
- 构建方式：OpenNext for Cloudflare，把 Next.js 应用构建为 Cloudflare Worker。
- 当前维护分支：`cloudflare-worker`。
- 当前展示页：`/`、`/fnds`、`/about`；卡片接口是 `/api/cards`。
- 当前生产域名：`https://solidays.win`；`https://www.solidays.win` 会跳转到主域名。
- `workers.dev` 默认地址已经关闭，不要把它当作生产入口。

## 主要目录

- `app/`：页面、API 路由和 App Router 入口。
- `app/fnds/page.tsx`：FNDs 图片卡片页，图片使用 R2 object key。
- `app/about/page.tsx`：个人介绍页，头像使用 R2 object key。
- `app/media/[...key]/route.ts`：从 R2 读取媒体的 Worker 路由。
- `components/`、`contexts/`：页面组件、主题和交互状态。
- `data/`：当前仍在仓库内的最小默认结构化数据。
- `lib/media.ts`：媒体 URL 生成；未设置公共 R2 URL 时走 Worker 的 `/media` 路由。
- `wrangler.jsonc`：Worker、域名、R2、AI 和静态资源绑定的部署源配置。
- `open-next.config.ts`：OpenNext Cloudflare 构建配置。

## 当前 Cloudflare 资源

`wrangler.jsonc` 当前配置了：

- Worker：`solidays-worker`。
- Custom Domains：`solidays.win`、`www.solidays.win`。
- `workers_dev: false`：关闭默认 `workers.dev` 地址；如果只在 Dashboard 里关闭而不保留这个配置，下次部署可能重新启用。
- `ASSETS`：OpenNext 静态资源绑定。
- `MEDIA_BUCKET`：R2 桶 `solidays-media`，当前为远程绑定。
- `AI`：Workers AI 远程绑定，当前配置已预留；代码中暂未接入具体模型调用。
- Observability：已启用。
- 当前没有 D1 绑定，也没有创建本项目专属 D1。以后接入结构化数据前，先确认数据库归属和 ID，再添加 migration 与绑定。

### R2 媒体约定

- FNDs 图片放在 `fnds/` 前缀下。
- 头像放在 `profile/` 前缀下，例如 `profile/avatar.jpg`。
- `/media/[...key]` 只允许 `fnds/` 和 `profile/` 前缀，并拒绝包含 `..` 的路径。
- 当前生产站通过 Worker 读取私有 R2 对象，不依赖 `r2.dev` 公共地址。
- 新增图片时，先上传到 R2，再在页面中引用对应 object key；不要把同一批生产图片重新放回 Git。

## 本地开发和检查

项目声明使用 Yarn 3.6.1，版本文件位于 `.yarn/releases/`，配置位于 `.yarnrc.yml`：

```bash
corepack enable
yarn install
yarn dev
```

常用检查：

```bash
yarn lint
yarn worker:build
yarn worker:types
```

`yarn worker:dev` 会先构建，再启动 Wrangler 本地 Worker。注意 `wrangler.jsonc` 中的 R2
和 AI 是 `remote: true`，本地调试可能访问真实 Cloudflare 资源；不要在未确认的情况下
做上传、删除或 AI 调用。

## 生产部署流程

### 正常流程（环境中有 Yarn 时）

```bash
yarn worker:build
yarn worker:deploy
```

### 当前机器的可靠流程

本次部署时，项目虽然声明了 `yarn@3.6.1`，但当前 shell 找不到 `yarn` 命令。OpenNext
构建可以成功，封装的 deploy 阶段会失败。因此当前机器使用：

```bash
npm run worker:build
OPEN_NEXT_DEPLOY=true npx wrangler deploy
```

`OPEN_NEXT_DEPLOY=true` 用来告诉 Wrangler 当前已经由 OpenNext 生成了
`.open-next/worker.js`，避免 OpenNext 和 Wrangler 互相递归调用。构建产物位于
`.open-next/`，不应手工编辑或提交生成目录。

部署后至少验证：

```bash
curl -sS -L -o /dev/null -w '%{http_code} %{url_effective}\n' https://solidays.win/
curl -sS -L -o /dev/null -w '%{http_code} %{url_effective}\n' https://www.solidays.win/
curl -sS -L -o /dev/null -w '%{http_code} %{url_effective}\n' https://solidays-worker.<account-subdomain>.workers.dev/
```

当前预期分别是自定义域名 `200`、`www` 跳转主域名后 `200`，关闭后的
`workers.dev` 返回 `404`。由于 `workers_dev` 已关闭，Preview URLs 也默认关闭；确实需要
预览地址时，显式在 Wrangler 配置中评估并设置 `preview_urls`。

## 本次会话记录的坑

1. **OpenNext 的部署命令依赖 package manager。** `npm run worker:deploy` 能完成 Next.js
   和 OpenNext build，但因为 `package.json` 的 `packageManager` 是 Yarn、环境没有 Yarn，
   最后报 `/bin/sh: yarn: command not found`。优先启用项目自带 Yarn；否则按上面的“当前机器
   可靠流程”先 build，再直接 Wrangler deploy。
2. **只在 Dashboard 关闭 `workers.dev` 不够。** 必须把 `workers_dev` 保持为 `false` 并
   重新部署，否则后续 Wrangler 部署可能重新开启默认地址。
3. **不要把账单 Token 当部署 Token。** `CLOUDFLARE_API_TOKEN` 会优先于 Wrangler OAuth；
   账单只读 Token 没有 Worker/R2 写权限，不能设置成全局部署凭据。Token 只能通过安全的
   环境或交互式命令提供，不得写入本文件、代码、日志或提交记录。
4. **远程绑定会触碰生产资源。** R2 和 Workers AI 的 `remote: true` 不是本地模拟；本地
   调试时读取、写入和模型调用都要按生产操作对待。
5. **构建有现存 React Hook 警告。** `components/MusicDock.tsx` 有若干缺少依赖的
   `useEffect` lint warning；它们本次没有阻断构建或部署，但修改音乐组件时应单独修复并验证。
6. **媒体路由不是任意文件代理。** 新媒体必须遵守 `fnds/`、`profile/` 前缀和 key 约定，
   不要为了绕过 404 放宽路径校验。

## 变更和提交约定

- 先检查 `git status --short`，保留用户已有改动，不要使用破坏性重置命令。
- 修改 `wrangler.jsonc` 后至少执行一次 `yarn worker:build` 或等价的
  `npm run worker:build`。
- 线上部署后验证主域名、`www` 跳转和关键媒体路径。
- 生成的 `.next/`、`.open-next/`、`.wrangler/` 和本地环境文件不应提交；凭据绝不提交。
