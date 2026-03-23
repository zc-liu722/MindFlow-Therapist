# MindFlow Therapist Web

MindFlow Therapist Web 是一个面向心理咨询与自我探索场景的 AI 工作台。它把对话、会话记录、咨询手帐、督导摘要和管理端统计整合到一个 Web 应用里，适合做小规模试用、研究原型验证，或作为 AI 辅助咨询流程的内部工具基础。

项目当前基于 `Next.js 15`、`React 19` 和本地文件数据库实现，强调低门槛部署、可快速迭代，以及对真实咨询流程的贴近建模。

## 项目定位

- 面向咨询师、督导者或研究型团队的 AI 辅助工作台
- 支持从注册登录、对话、会话完成到手帐沉淀的完整闭环
- 适合 MVP、试点验证和小范围邀请制使用
- 当前版本优先追求流程完整性与可部署性，而非大规模多租户架构

## 核心功能

- 用户认证
  - 用户名密码注册与登录
  - 注册前可通过管理员邀请码控制后台账户创建
  - 登录与注册前需要显式同意隐私与模型处理说明
- AI 咨询对话
  - 创建新会话并持续追加消息
  - 支持查看历史会话与单个会话详情
  - 会话结束后可生成阶段性总结与进度状态
- 咨询手帐与督导记录
  - 针对治疗过程生成 therapy journal
  - 针对督导场景生成 supervision journal
  - 帮助沉淀持续观察、风险判断与过程反思
- 管理端统计
  - 查看匿名化聚合指标
  - 包括事件数量、风险分布、会话规模等运营视角数据

## 产品特点

- 单体应用即可覆盖前台、API 与管理后台
- 以本地文件数据库为基础，方便快速部署和调试
- 对用户对话、手帐和督导内容做按用户隔离的加密存储
- 明确标注 AI 处理边界，适合需要隐私提示与合规告知的场景

## 技术栈

- `Next.js 15`
- `React 19`
- `TypeScript`
- `Next.js App Router`
- Anthropic API
- 本地文件数据存储

## 快速开始

安装依赖并启动开发环境：

```bash
npm install
npm run dev
```

默认访问地址：

```text
http://127.0.0.1:3000
```

生产模式构建与启动：

```bash
npm run build
npm run start
```

## 环境变量

项目根目录提供了 `.env.example` 模板。常用变量包括：

```bash
DATA_DIR=
APP_ENCRYPTION_KEY=replace-with-a-long-random-secret
ADMIN_INVITE_CODE=change-me
ANTHROPIC_API_KEY=your-anthropic-api-key
ANTHROPIC_MODEL=claude-opus-4-6
ANTHROPIC_MAX_OUTPUT_TOKENS=4096
ANTHROPIC_THINKING_BUDGET_TOKENS=2048
COOKIE_SECURE=false
```

说明：

- `DATA_DIR` 用于指定数据文件目录；本地开发可留空
- `APP_ENCRYPTION_KEY` 用于敏感本地数据加密
- `ADMIN_INVITE_CODE` 控制管理员注册
- `ANTHROPIC_*` 变量用于配置模型与生成参数
- `COOKIE_SECURE=false` 适合本机联调或特殊代理环境

## 项目结构

- `src/`：前端页面、服务端路由与核心业务逻辑
- `data/`：本地开发数据目录
- `scripts/`：启动兼容与 smoke test 脚本
- `render.yaml`：Render 部署配置

## 部署说明

当前版本使用本地文件数据库，不适合直接部署到不提供持久本地磁盘的静态或无状态托管平台。若需要公网试用，更推荐使用带持久磁盘的 Node 服务环境，例如 `Render`。

如果要通过 Render 部署：

1. 将仓库推送到 GitHub。
2. 在 Render 中使用 `New Blueprint Instance` 导入仓库。
3. 让 Render 读取根目录的 `render.yaml`。
4. 配置生产环境变量，尤其是 `DATA_DIR`、`APP_ENCRYPTION_KEY` 和 `ANTHROPIC_API_KEY`。

## 隐私与边界

- 每个用户的数据按 `userId` 隔离
- 聊天原文、咨询手帐、督导记录按用户加密存储
- 生成 AI 回复与督导内容时，必要上下文会发送给 Anthropic API
- 管理端默认读取匿名化聚合统计，而非原始会话明文

## 重要提醒

这是一个 AI 辅助的自我探索与咨询支持工具，不是专业心理治疗或危机干预的替代品。如果用户处于严重心理危机、自伤或自杀风险中，应优先联系线下专业帮助与紧急援助资源。
