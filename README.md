# MindFlow Therapist Web

把说不清的感受，慢慢说清楚。

MindFlow Therapist 是一个面向爱思考者的 AI 心理支持平台。它既能陪你完成每一次真实对话，也会自动整理会谈脉络、生成咨询手帐与督导记录，让情绪表达不只被回应，还能被持续看见、慢慢梳理。

在线体验：[https://mindflow-therapist-web.onrender.com](https://mindflow-therapist-web.onrender.com)

## 项目简介

MindFlow Therapist Web 是一个围绕长期陪伴、深度理解和过程沉淀设计的 AI 心理支持工作台。它不是一次性问答工具，而是一个更接近真实咨询关系的交互系统：有连续会谈，有过程记录，有复盘，有督导，也有清晰的隐私边界。

项目当前基于 `Next.js 15`、`React 19` 和本地文件数据库实现，适合做小规模试用、研究验证，以及 AI 辅助咨询产品的 MVP 探索。

## 产品亮点

### 顶级模型，深度思考

基于 `Claude Opus 4.6` 与 High Thinking 模式，系统会更深入地理解情绪、组织回应并把握上下文。我们把深度咨询视为一种高智力活动，因此模型能力不是点缀，而是产品体验的核心基础。

### 拟人沉淀，长期进化

每次会谈后，系统会自动生成咨询手帐与督导记录，让 AI 咨询师像真人咨询师一样在复盘与督导中不断调整、学习与进化，形成更强的拟人感、连续性和成长感。

### 边界清晰，隐私加密

聊天内容、咨询手帐与督导记录都会按用户加密存储。管理员只能看到聚合统计，无法直接查看用户内容。在提供理解与陪伴的同时，系统也尽量提供更清晰的隐私边界与安全感。

## 核心能力

- 用户名密码注册与登录
- 登录前显式确认隐私存储与模型处理说明
- 持续进行 AI 会谈与历史会话回看
- 会谈结束后自动生成阶段性总结与进度状态
- 自动生成 therapy journal 与 supervision journal
- 管理端查看匿名化聚合指标与风险分布

## 为什么它不像普通聊天机器人

- 它强调连续会谈，而不是单轮问答
- 它强调过程沉淀，而不是只给即时回复
- 它强调督导与复盘，而不是只输出“安慰性文本”
- 它强调隐私边界与数据隔离，而不是把后台能力暴露给管理员

## 技术栈

- `Next.js 15`
- `React 19`
- `TypeScript`
- `Next.js App Router`
- Anthropic API
- 本地文件数据存储

## 本地开发

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

## 部署

当前线上实例已部署在 Render：

- [https://mindflow-therapist-web.onrender.com](https://mindflow-therapist-web.onrender.com)

项目当前使用本地文件数据库，因此更适合部署在带持久磁盘的 Node 服务环境中。如果需要复刻部署，可直接使用仓库中的 `render.yaml`。

## 隐私与边界

- 每个用户的数据按 `userId` 隔离
- 聊天原文、咨询手帐、督导记录按用户加密存储
- 生成 AI 回复与督导内容时，必要上下文会发送给 Anthropic API
- 管理端默认读取匿名化聚合统计，而非原始会话明文

## 重要提醒

这是一个 AI 辅助的自我探索与心理支持工具，不是专业心理治疗或危机干预的替代品。如果用户处于严重心理危机、自伤或自杀风险中，应优先联系线下专业帮助与紧急援助资源。
