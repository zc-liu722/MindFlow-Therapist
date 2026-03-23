# MindFlow Therapist Web

一个可通过 GitHub 直接部署到公网的 AI 咨询工作台，重点包含：

- 免密用户名登录
- 咨询对话与历史会话
- 咨询师手帐与督导记录
- 管理员聚合统计视图

## 推荐部署方式

首选 `Render`。这是当前这版 MVP 最稳妥的公开部署路径，因为项目会把用户数据写入 `data/db.json`。`Vercel` 这类无状态平台虽然接 GitHub 很方便，但不适合直接承载本地文件数据库；`Render` 可以给服务挂载持久磁盘，更适合先邀请一批人试用。

### 从 GitHub 到上线

1. 把仓库推到 GitHub。
2. 打开 [Render Dashboard](https://dashboard.render.com/blueprints)。
3. 选择 `New Blueprint Instance` 并连接这个 GitHub 仓库。
4. Render 会自动读取根目录下的 `render.yaml`，创建 Node Web Service 和持久磁盘。
5. 在创建页面补齐密钥类环境变量后点击 `Apply`。
6. 首次部署完成后，后续每次推送到 GitHub 主分支都会自动重新部署。

### 环境变量

在 `Render -> Environment` 配置：

```bash
DATA_DIR=/var/data
APP_ENCRYPTION_KEY=replace-with-a-long-random-secret
ADMIN_INVITE_CODE=change-me
ANTHROPIC_API_KEY=your-anthropic-api-key
ANTHROPIC_MODEL=claude-opus-4-6
ANTHROPIC_MAX_OUTPUT_TOKENS=4096
ANTHROPIC_THINKING_BUDGET_TOKENS=2048
```

说明：

- `DATA_DIR` 指向 Render 持久磁盘挂载目录，用于保存本地数据库文件
- `APP_ENCRYPTION_KEY` 用于本地数据加密
- `ADMIN_INVITE_CODE` 用于管理员注册
- `ANTHROPIC_API_KEY` 用于后端调用 Claude
- `ANTHROPIC_MODEL` 用于指定模型名，默认推荐 `claude-opus-4-6`
- `ANTHROPIC_MAX_OUTPUT_TOKENS` 控制单次回复输出上限
- `ANTHROPIC_THINKING_BUDGET_TOKENS` 控制 high thinking 的预算
- 登录与注册现在都必须提供密码
- 用户在登录或注册前，需要显式同意隐私说明与模型处理说明
- 生产环境必须配置安全的 `APP_ENCRYPTION_KEY`，不能使用默认占位值
- 生产环境不要把 `DATA_DIR` 留空，否则会退回项目目录下的临时文件

备注：

- 我这次把“high thinking”做成了 Anthropic `thinking` 参数开启的方式。
- 现在项目默认已经切到 `Claude Opus 4.6`，默认模型名是 `claude-opus-4-6`。
- 如果你后续在 Anthropic 控制台里需要切到别的版本，直接覆盖 `ANTHROPIC_MODEL` 就可以，无需改代码。

如果你只想先本地调试，也可以把同样的变量放到项目根目录的 `.env.local` 里，`.env.example` 已经给出模板。本地开发时 `DATA_DIR` 可以留空。

## 本地开发

项目已经对当前环境里的 `Node.js 25` 做了兼容处理：启动脚本会在 Next.js 启动前修补不完整的服务端 `localStorage`。如果你看到过 `localStorage.getItem is not a function`，现在直接重新执行 `npm run dev` 即可。

```bash
npm install
npm run dev
```

然后打开浏览器访问：

```text
http://127.0.0.1:3000
```

## 构建与启动

```bash
npm run build
npm run start
```

如果你要在本机用 `npm run start` 做生产模式联调，而不是部署到 Vercel，默认也能登录；如果你有自定义反向代理并且想关闭生产环境下的安全 cookie，也可以额外设置：

```bash
COOKIE_SECURE=false
```

## 目录说明

- `src/`：Next.js 前后端主实现
- `public/`：静态资源
- `data/db.json`：本地开发数据文件
- `server.mjs`：旧版自托管入口，当前不作为推荐线上入口

## 备注

这个项目不是纯静态站点。它依赖 Next.js 的页面和 API 路由，而且当前版本使用本地文件数据库，因此不建议使用 GitHub Pages 或 Vercel 这类不提供持久本地磁盘的托管方式直接承载生产数据。

## 隐私边界

- 每个用户的数据按 `userId` 隔离
- 聊天原文、咨询师手帐、督导记录按用户加密存储
- 生成 AI 回复与督导内容时，必要的当前对话和历史上下文会发送给 Anthropic API
- 管理员端只读取聚合统计接口
- 统计数据只包含匿名 ID、事件计数、风险分布、会话数量等

## 重要提醒

这是一个 AI 辅助的自我探索工具，不是专业心理治疗的替代品。如果用户正在经历严重心理危机、自伤或自杀风险，应优先联系专业帮助与紧急援助。
