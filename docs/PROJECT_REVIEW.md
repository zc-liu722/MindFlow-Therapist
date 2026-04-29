# MindFlow Therapist 项目审阅报告

> 审阅对象：`ai_therapist`（MindFlow Therapist Web，Next.js 15 / React 19 / TypeScript）
> 审阅日期：2026-04-21
> 审阅范围：商业化、功能缺口、风险、能耗、设计合理性、代码轻量化与硬性代码问题
> 随手修复：已统一 `extractJsonBlock`，抽出 `src/lib/json-extract.ts`；其余结构性问题在本文档中列出建议，不改动主功能实现。

---

## 0. 一句话总览

这是一个 **"重 Prompt 工程 + 轻基础设施"** 的心理陪伴 MVP：
- AI 能力（Claude Opus 4.6 + Moonshot 审查/思维人化）和流派 Prompt（`.cursor/rules/*.mdc`）是核心资产；
- 持久化、鉴权、限流、计费、可观测性等均处于"够用的原型态"，距离真正可商业化运营尚有至少 2-3 个里程碑的距离；
- 隐私与安全设计（用户级 AES-256-GCM、PII 脱敏、同意版本化、管理员数据脱敏视图）已具备可解释的骨架，但关键密钥管理与多实例一致性仍是瓶颈。

---

## 1. 商业化逻辑与方案

### 1.1 当前变现链路盘点
目前实际链路里 **零付费点**：注册登录 → 创建咨询 → 无限消息 → 完成 → 手帐/督导。没有计费、配额、订阅、邀请分层、企业/B 端通道。

### 1.2 价值主张（可对外讲的三句话）
1. **"不会跑题的 AI 咨询师"**：用 `.cursor/rules/*.mdc` 强约束流派方法论与伦理红线，交付的是"方法论一致的陪伴"，区别于通用聊天 bot。
2. **"像真人一样成长的记忆体"**：`therapy_journal.md`、`supervision_journal.md` + `/session/` 原文存档，形成"可演化"的关系对象。
3. **"数据在你这一边"**：用户级 AES 密钥 + PII 脱敏 + 管理员看不到原文，符合情感支持类产品的最高合规姿态。

### 1.3 推荐商业化模型（按优先级）

#### 优先级 P0：C 端订阅（Freemium）
| 档位 | 月价（参考） | 功能差异点 |
| --- | --- | --- |
| Free | ¥0 | 每月 3 次完整 session（每次 ≤ 20 轮，高风险自动限流），默认整合取向，无督导 |
| Plus | ¥39 | 每日 1 session、全流派切换、督导开启、手帐导出 PDF、原文存档下载 |
| Pro | ¥99 | 不限次数、深度思考（Opus 大 token）、多人格侧写、自动每周回顾、优先队列 |

**计费实现改造点**（当前完全没有）：
- `UserRecord` 增加 `plan`, `planExpireAt`, `usageQuota` 字段；
- 在 `enforceInputGuardrail` 之前追加 `assertQuota`；
- 在 `appendMessageStream` 的流式结束处统计 `tokensIn/tokensOut`（Anthropic SSE 事件已返回 usage），落到 `db.usageLedger`；
- 接入微信/支付宝/Stripe；国内可先走微信扫码 + 回调写单。

#### 优先级 P1：B 端企业 EAP（员工帮助计划）
- 目标客群：一线互联网、金融、教培、医疗机构的 HR / 工会；
- 交付形态：按席位计价（¥15–¥30 / 人 / 月），企业后台展示**聚合指标**（压力/情绪趋势、高风险预警频次），**个人对话不可见**——正好契合当前 `admin.ts` 的"只看聚合、不看原文"设计；
- 扩展：可定制知识库（公司特定文化/裁员/加班场景），本地化流派（如国企偏向 SPT、互联网偏向 ACT+CBT）。

#### 优先级 P2：专业端（咨询师/督导工具）
- 把 `supervisor.mdc` 升级为"真人咨询师的 AI 督导助理"：上传逐字稿 → 生成 Bowlby / CBT / EFT 等多取向解读；
- 定价：¥199/月 或 按次付费 ¥30/次督导；
- 合规优势：不直接面向来访者，降低医疗器械与诊疗边界风险。

#### 优先级 P3：增值模块（按需购买/积分）
- "首次深谈"套装（60 分钟长对话 + 结构化画像报告）：¥19.9；
- 流派专项周（7 天 EFT 依恋修复、7 天 ACT 价值澄清）：¥29–¥49；
- "AI 老朋友回信"：按关键纪念日自动生成鼓励信；
- 音频导出（TTS 读出咨询摘要，便于通勤回听）。

### 1.4 留存与裂变
- **每周回顾邮件**：基于 `therapy_journal` 生成；当前无邮件通道（缺 `emailSender` 模块）。
- **仪式化**：每 5 次会话解锁"隐喻卡片"（把 `重要隐喻与来访者语言` 可视化导出）；属于心理产品里很粘性的留存钩子。
- **邀请机制**：邀请好友共得 1 次 Plus 体验周；依赖现有 `ADMIN_INVITE_CODE` 通道可平行扩展出普通邀请码。

### 1.5 不建议走的变现
- ❌ 广告（情绪场景下转化率低且损伤品牌）；
- ❌ 卖数据/聚合画像对外（与隐私主张直接冲突，一旦泄露即品牌终结）；
- ❌ 直接标榜"诊断/治疗"付费（触碰医疗器械法规）。

---

## 2. 待补充与完善的功能

按"先保命、再长肌肉"排序：

### 2.1 生存级（必须补全，否则无法上线商业版本）
1. **计费与配额系统**：订阅、消费额度、Token 计数、支付回调、发票、退款策略。
2. **密钥管理**：`APP_ENCRYPTION_KEY` 当前硬依赖环境变量，**一旦丢失或轮转，全部历史数据不可解密**。需接入 KMS（阿里云 KMS / 腾讯云 KMS / AWS KMS）或至少分离出"数据加密密钥 + 密钥加密密钥"两层结构，并支持密钥版本号（`EncryptedBlob` 增加 `keyVersion`）。
3. **真正的数据库**：当前 `data/db.json` 是全量读写的大 JSON 文件 + 写队列。这在 2 并发用户时就会出现明显尾延迟，且单点文件损坏 = 全库丢失。建议 SQLite（单机版）或 Postgres（多实例）；结构几乎零改动，Prisma + 现有 `DatabaseShape` 可直译。
4. **分布式限流**：`rate-limit.ts` 使用进程内 `Map`，多实例下形同虚设；需换 Redis Token Bucket 或至少用文件/数据库做最低限度的共享计数。
5. **危机干预自动化**：`therapist-core.mdc` 规定了高风险要给出 400-161-9995 热线——当前由模型自主输出；应在 `detectRiskLevel === "high"` 时**强制**在流式结果外追加一条系统安全卡片（带热线按钮、报警入口），并写入 `moderationIncidents`。
6. **审计日志**：`admin.ts` 的管理员动作未记录谁在什么时候做了什么；合规基线要求至少一条 append-only 审计流（`adminAuditLog` 表）。

### 2.2 体验级（直接决定续费意愿）
7. **语音输入 & 语音陪伴**：当前全文本；真实咨询 70% 以上的信息量在韵律、停顿、叹息。先做 Web Speech API + TTS 输出，再逐步升级到 Realtime API。
8. **跨会话语义检索**：`therapy_journal` 当前是追加文本，没有 embedding 索引。当用户说"上次我们聊到妈妈的事"时，模型是靠 journal 的原文匹配——容易漂移。建议在 `completeSession` 时把每 session 关键片段做向量化并存到 `sessionEmbeddings`，下次开场由 `domain.ts:createSession` 优先注入 top-k 段。
9. **会话中途保存/离线续写**：目前只有 `completeSession` 触发手帐。应支持"暂停"（save-and-exit），允许 24h 内续写；现在 `inProgress` 状态字段没有完整的中断恢复 UX。
10. **情绪仪表盘**：把 `session-progress.ts` 的 `phase/percent` 做成时间序列图；配合 `analyticsEvents` 里的 `risk_detected/moderation_incident` 做用户自查表，反而能变成一种"可视化的自我关照"产品差异化。
11. **作业/练习库**：很多流派（CBT、DBT、ACT）的真正价值在"两次咨询之间的练习"；`.cursor/rules/*.mdc` 里已经有方法论，缺的是把练习沉淀成可领取的卡片（思维记录表、情绪轮、价值澄清）。
12. **会话评分**：每次结束让用户 1-5 星评价 AI 响应是否"被理解"，数据反哺 prompt 调优（当前 `analyticsEvents` 有槽但无 UI）。
13. **多端**：仅有 Web；移动端是心理产品天然场景，可先做 PWA（manifest/worker 都没配），再做原生壳。

### 2.3 专业与长程（差异化壁垒）
14. **咨询师模式切换的"过渡语"**：规则里要求自然切换，但代码里没有"记录上次切换原因"的字段，当来访者频繁切流派时容易失去连贯性；建议 `TherapySessionRecord.modeHistory: { mode, startedAt, reason }[]`。
15. **督导报告的"盲点发现"闭环**：`supervision_journal.md` 里有盲点建议，但 `therapist-core.mdc` 只规定"下次咨询要留意"——没有机制校验"下次真的注意到了没有"。可以在 `createSession` 的 system prompt 里追加 "上次督导指出的三个盲点" 并在 `completeSession` 的督导 prompt 里让督导师打分。
16. **来访者画像版本化**：`therapy_journal.md` 里的"来访者画像"是追加覆盖式，无法追踪成长；建议快照化（每月一个快照）。
17. **多人格/多咨询师选择**：同一个来访者在不同阶段可能想换风格（柔软/犀利/幽默），目前只有流派切换，没有"咨询师形象"切换。

---

## 3. 重要风险点

### 3.1 法律/合规（最高优先级）
| 风险 | 描述 | 缓解 |
| --- | --- | --- |
| **医疗边界** | 用户可能把 AI 当作诊断/处方工具。一旦 AI 暗示用药或诊断名（哪怕被 core 规则禁止），就可能落入《医疗器械监督管理条例》和《精神卫生法》红线。 | 在 `therapist-core.mdc` 已有"绝不做诊断"；但需要**客户端二次水印**（每个 AI 回复下方固定一行"本内容非医疗建议…"），且在风控 `moonshot.ts:assessGuardrailForInput` 中把"诱导诊断/用药"作为独立 category。 |
| **高危事件连带责任** | 用户明示自杀/自伤意图后若系统未强制介入、未留存证据，可能面临民事追责。 | 高风险对话必须：①强制拼接热线卡片；②写入 `moderationIncidents` + 独立 `crisisEvents` 表；③给用户一次"是否需要我替你拨打 120"的交互；④保留 1 年以上加密日志以备举证。 |
| **未成年人保护** | 当前注册仅要求用户名+密码+两项同意；未识别未成年人。 | 注册时加年龄声明，若 < 18 岁走"监护人知情同意"流程并禁用部分流派（精神动力学的深度揭露等）。 |
| **跨境数据传输** | Anthropic、Moonshot 端点在境外/境内不一；国内运营用境外 Claude 属于出境数据处理。 | 国内版本走 Moonshot/DeepSeek/智谱等合规模型，境外版走 Anthropic；对敏感字段在出境前做 `redaction.ts` 增强（当前仅正则脱敏，可提高到 NER 级别）。 |
| **同意版本化失效** | `privacy.ts` 定义了 `CONSENT_VERSION`，但升级后**历史用户没有强制重新勾选**，只在 `loginUser` 路径里校验。如果用户用未过期 session 直接进入 `/app`，不会被拦。 | 在 `middleware.ts`（当前仅处理 cookie）增加一层"同意版本不匹配即 302 到重新同意页"。 |

### 3.2 安全
| 风险 | 描述 | 缓解 |
| --- | --- | --- |
| **`APP_ENCRYPTION_KEY` 单点** | 通过 `createPasswordHash(userId, appKey)` 派生用户密钥；appKey 丢失 ≈ 所有历史数据永久不可读；appKey 泄露 ≈ 所有数据可被离线解密。 | KMS + 密钥版本号 + 定期轮转 + 灾备副本。 |
| **`ADMIN_INVITE_CODE` 在 `.env.local`** | 代码暴露或 git 历史泄露即失守。 | 管理员应通过运维通道单独创建，移除"注册带邀请码即 admin"的捷径；或至少改为一次性、短时效邀请令牌。 |
| **CSRF** | cookie 采用 `sameSite=lax`，大多数 POST 行为被保护；但流式 `messages` 接口若未校验 `Origin/Referer`，仍可能被跨站 form 触发。 | 统一在 `middleware.ts` 对 `/api/*` 做 Origin 白名单校验（同源 + 允许的前端域）。 |
| **Rate-limit 进程内** | 多实例部署后失效。 | 已在第 2 节生存级列出，复述提醒。 |
| **db.json 路径穿越** | `DATA_DIR` 若被管理员误配，可能写到任意位置。 | 启动时 `path.resolve` 后校验是否在允许根下。 |
| **日志泄露** | `formatSupervisionFailureReason(error)` 直接把 `error.message` 截 300 字写入 DB；Anthropic 的错误信息可能包含请求体字段。 | 过滤敏感 key；或只记录 `error.name + status`。 |
| **用户输入被回显** | 前端 `app-dashboard.tsx` 用户消息走 React 文本节点，安全；但 AI 输出是 markdown 渲染的，若未来接入图像/HTML 白名单需要严格过滤。 | 已用受控 markdown 渲染即可；注意加 `rel="noopener noreferrer"` on external links。 |

### 3.3 运营 / 产品
| 风险 | 描述 | 缓解 |
| --- | --- | --- |
| **AI 幻觉伤害** | 模型可能虚构"上次咨询"的细节（规则明确禁止，但不能 100% 拦截）。 | 把 `therapy_journal` 作为 system message 传入时明确 "只能复述下列摘要中存在的事实"；并在人化 thinking 流里加入 fact-check 步骤。 |
| **成本失控** | 无配额 + Opus 大 token + 每次消息都过一遍 Moonshot guardrail + 思维人化，单轮成本可达 0.5–1.5 元人民币。 | 做分层：普通对话用 Haiku/Sonnet，深度对话/督导才用 Opus；guardrail 用更小的模型或规则前置过滤（`ai.ts:detectRiskLevel` 已是规则；可扩展正则白名单短路）。 |
| **可用性** | Anthropic 海外服务偶发高延迟；`DEFAULT_TIMEOUT_MS = 60_000` 对于 Opus 长思考偏紧。 | 按用户所在区域选择路由；保留"本次回复过慢，已为您切换到更快模型"的 fallback 语义。 |
| **buildTherapyJournal 不是 AI 生成** | `src/lib/ai.ts:buildTherapyJournal` 实际上是**模板 + 正则抽主题**拼出来的假手帐——而 README 与 UX 向用户暗示这是"AI 整理"。 | 要么改用 Claude 生成（成本↑），要么在 UI 上明确写"由规则自动摘要"。**这是当前项目最容易被用户识破 AI 成色的地方。** |
| **管理员可控性** | 管理员只能"恢复/清除警告"，不能查看原文但也没有任何把用户"拉出会话"的紧急手段（例如高危用户主动骚扰 AI）。 | 增加"立即冻结会话"按钮，触发服务端终止 SSE 流与强制登出。 |

---

## 4. 实际运行能耗（Token 与资源消耗估算）

> 估算基于当前默认配置：`claude-opus-4-6` + `max_tokens=4096` + `thinking_budget=2048`，Moonshot guardrail & thinking humanizer 均开启。

### 4.1 单轮用户消息的 Token 走向

| 阶段 | 调用 | 估算 Token | 说明 |
| --- | --- | --- | --- |
| 1. Guardrail | Moonshot 1 次 | in ≈ 600 / out ≈ 100 | 把 `therapist-core.mdc` 精简版 + 最近几条上下文送过去 |
| 2. 正文思考 | Anthropic 1 次（流式） | in ≈ 1500–3000 / thinking ≈ 1000–2000 / out ≈ 300–500 | system prompt 随手帐增长线性膨胀 |
| 3. Thinking 人化（摘要） | Moonshot 每 ~1s 一次 | 每次 in ≈ 400 / out ≈ 80 | 流式片段节流后多次触发 |
| 4. Thinking 人化（完整展开） | Moonshot 1 次 | in ≈ 1500 / out ≈ 500 | 仅在有 thinking 时跑 |

**结论**：单次用户消息 ≈ **1 次 Opus + 3–5 次 Moonshot**；若按 Opus 输入 ¥0.12/千 token、输出 ¥0.6/千 token、Moonshot v1-8k ¥0.012/千 token 粗估，**单轮成本约 ¥0.4–¥1.2**。20 轮会话单 session ≈ ¥8–¥24——和 Free 档位完全不兼容。

### 4.2 完成会话时的额外消耗
- **督导生成**（`generateSupervisionArtifacts`）：1 次 Opus/Sonnet，in ≈ 4000–8000（整段 transcript 脱敏后）/ out ≈ 2000，**≈ ¥1.5–¥3** 一次；
- **手帐生成**（当前为模板，零模型成本）；若改为 AI 生成会再加一次 ¥0.3–¥1。

### 4.3 主要能耗浪费点（可优化）
1. **每轮都跑 Moonshot guardrail**：大多数低风险对话其实靠 `ai.ts:detectRiskLevel` 的关键词判断已经够用。**建议**：只在 `detectRiskLevel ≠ "low"` 或 `messages.length ≤ 2`（首轮）或用户文本长度 ≥ 200 时才跑 Moonshot；其余短路。
2. **Thinking humanizer 的 snapshot 频率**：每 1s 跑一次增量摘要是体验友好的，但多触发了 3-5 倍 Moonshot 调用。**建议**：只在思考停顿 ≥ 2s 或增量 ≥ 200 字符才触发一次；结束时兜底一次。
3. **system prompt 随 journal 线性增长**：每轮都把完整 `therapy_journal.md` 贴进去，单用户长期使用后 system 段可能上千 token。**建议**：摘要化（过去三次重点 + 稳定画像），或走 prompt caching（Anthropic 已支持，未启用）。
4. **Anthropic prompt caching 未启用**：`anthropic-beta: prompt-caching-2024-07-31` 头未开，导致每次都重新计费 system 段。**最大收益**：长期用户输入成本可降 50–80%。
5. **重复 decrypt 全 transcript**：`parseTranscript` 每次 API 请求都要解密完整 transcript；`listSessionsForUser` 里每个 session 都解密一次只为拿 `messageCount`。**建议**：在 `TherapySessionRecord` 上冗余 `messageCount` 字段，避免仅为计数全量解密。
6. **`db.json` 全量写**：每一条 `analyticsEvents.push` 都要重写整个 DB（`writeDb` 序列化全量），写放大极高——一旦分析事件积累到 5 万条，每次写可能 > 20MB 顺磁盘 IO。

### 4.4 能耗总结（每位 Plus 档位用户/月预估）
- 典型：4 次/周 × 20 轮 × ¥0.6 + 4 次/周 × ¥2（督导）= **约 ¥240 模型成本**
- 目标定价 ¥39/月 → 当前**毛利为负**，必须完成第 4.3 节优化并引入配额，否则订阅越多亏越多。

---

## 5. 功能设计合理性

### 5.1 设计得好的部分
- **规则即产品**（`.cursor/rules/*.mdc`）：把流派方法论用自然语言 + 版本化文件管理，让运营/心理专业人员不需要动代码就能迭代 AI 行为；配合 `resolveModRulesForMode` 做到模块化注入。**这是整个项目最值得保留和深耕的资产。**
- **用户级加密**：`encryptForUser(userId, value)` 以 `userId + appKey` 派生密钥，确保管理员拿 DB 文件也无法读单个用户内容，是同类产品里罕见的认真设计。
- **思考可视化 + 人化**：让用户看到"咨询师在想什么"是极高质量的信任构建，比单纯输出答案体验跃迁。
- **会话进度估算**（`session-progress.ts`）：结合消息数、反思句式、节奏元信息综合打分，比简单"消息数 / 20"准确度高得多；对来访者"现在到哪一步了"这个问题回答得很好。
- **同意版本化**（`CONSENT_VERSION`）：为未来条款更新留了升级路径。

### 5.2 设计得不合理或值得商榷的部分
1. **`buildTherapyJournal` 是模板、不是 AI**：产品层面给用户的感知是"AI 咨询师整理的手帐"，但实现是正则+模板。要么升级、要么明确标注。
2. **督导与手帐耦合在 `completeSession`**：一次完成动作里既写 `therapyJournal` 又跑 `supervisionArtifacts`（如果开启），任一步失败会导致半成品。**建议**：拆为两步（`completeSession` 只写手帐；`supervision` 异步触发，失败可重试），当前已有 `rerunSupervisionForSession` 可以复用。
3. **`completionLockId` 靠写入 DB 实现锁**：多实例 + 写队列在单机下够用，但集群下会出现双写竞态；应使用 Redis `SETNX` 或数据库唯一索引。
4. **`estimateSessionProgress` 基于关键词启发式**：对非中文语境、或用户特别沉默的场景，`themes.length === 0` 会把进度长期压在 25%。**建议**：结合模型返回的 "phase" 标签（在 system prompt 里让 Claude 自标）。
5. **UI 隐藏"原文存档"**：规则强调不能让来访者感到被记录，这是对的；但从产品透明度角度，**设置里**应该给一个"查看我的手帐/存档/删除全部"入口（GDPR-like 数据主体权利）。当前只有登出，没有"注销/导出全部数据"按钮。
6. **`session-modes.ts` 与 `mod-*.mdc` 映射硬编码**：新增流派要改两个地方；应把 mode 元信息直接写到 `.mdc` 的 frontmatter 里，动态读取。
7. **`admin-dashboard.tsx` 没有时序分析**：只有当日聚合，无法发现"这周因为周一新版本上线高风险事件突增"这类事件——而这是运营最需要的。
8. **前端状态 3 个 hook 拼起来**（`use-dashboard-data` + `use-dashboard-chat-ui` + `use-session-actions`）：职责清晰但 `app-dashboard.tsx` 仍 > 1k 行。可引入 Zustand/Jotai 把共享状态上提，组件真正只读。
9. **没有 e2e 测试**：`scripts/smoke.mjs` 只做了启动验证；AI 功能回归没有 golden-transcript 比对。考虑到 `.mdc` 规则迭代会直接改变输出，**强烈建议**建立 10–20 个 fixture session 的 snapshot 测试。

---

## 6. 代码轻量化

### 6.1 客观体积数据
| 文件 | 规模 | 评价 |
| --- | --- | --- |
| `src/app/globals.css` | 原 ~6k 行，本次 diff 精简到 ~5.4k 行 | 仍然偏重；主题变量、组件私有样式、动画混在一起。可拆分为 `theme.css / layout.css / chat.css / admin.css`，或引入 CSS Modules / Tailwind。 |
| `src/components/app-dashboard.tsx` | > 1000 行 | 聚合了 chat、history、journal、modal、shortcut handler；可拆出 `ChatView / SessionList / JournalView / ModalRoot` 四个子组件。 |
| `src/lib/domain.ts` | ~960 行 | 把 session、journal、supervision、analytics 全塞一处；建议分 `domain/session.ts` `domain/journal.ts` `domain/supervision.ts`。 |
| `src/lib/anthropic.ts` | ~850 行（去除重复后 ~800） | 混合了 config、stream 消费、supervision 修复、thinking 合并；`consumeAnthropicStream` 可单独拆成 `anthropic-stream.ts`。 |
| `package.json` | 仅 3 个 runtime deps（next/react/react-dom） | 依赖非常克制，值得肯定；但也意味着所有 UI/状态/markdown 都是手写的——维护成本转移到自身代码。 |

### 6.2 已随手修复
- ✅ 把 `extractJsonBlock` 从 `anthropic.ts` / `moonshot.ts` 两份各异实现抽到 `src/lib/json-extract.ts`，保留更严格的字符串感知版本，消除潜在不一致。
- ✅ 删除 `src/lib/domain.ts:createSession` 中冗余的 `initialMessages = [...contextMessages]`，直接序列化 `contextMessages`。
- ✅ 新增 `src/lib/text-utils.ts`，把 `app-dashboard-utils.ts` 里的 markdown 清洗函数与 `anthropic.ts:normalizeThinkingText` 收敛到同一处。
- ✅ 优化 `src/lib/admin.ts` 的概览聚合逻辑，把 session 相关统计收敛为单次 reduce，避免重复遍历。
- ✅ 确认 `.gitignore` 已包含 `*.tsbuildinfo`，且仓库当前没有被跟踪的 `tsconfig.tsbuildinfo`，此项无需额外改动。

### 6.3 建议的下一步轻量化（**已标注本轮状态**）
- ⏳ **拆 `domain.ts`**：当前单文件 ~960 行，split 为 4 个子模块后每个 < 300 行；
- ✅ **删除 `initialMessages = [...contextMessages]` 这类冗余 spread**（`createSession` 中多处）；
- ✅ **`app-dashboard-utils.ts` 中的 markdown 清洗函数**和 `anthropic.ts:normalizeThinkingText` 都做"去除反斜杠 / 规整引号"，已合并到 `src/lib/text-utils.ts`；
- ⏳ **`globals.css`**：把 CSS 变量、tokens、reset、component、animations 分文件；把深色模式的冗余覆盖移到 `@media (prefers-color-scheme)` 的 `:where()` 低特异性选择器，减少重复规则约 30%；
- ✅ **`admin.ts` 内的 `eventsByType`/`sessionsByDay` 两次全表扫描**已合并为共享聚合逻辑，session 相关统计改为单次 reduce；
- ✅ **TypeScript 编译缓存 `tsconfig.tsbuildinfo` (121KB)**：已确认 `.gitignore` 覆盖 `*.tsbuildinfo`，当前仓库无被跟踪文件，因此无需修改。

---

## 7. 硬性代码问题（逻辑 / 重复 / 小 bug）

> 表格中标记 [已修] 的为本次随手修复；其余为建议项，不在本次修改。

| # | 位置 | 问题 | 建议 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | `src/lib/anthropic.ts` vs `src/lib/moonshot.ts` | 两份不同实现的 `extractJsonBlock`；moonshot 版本是"最远 `}`"，anthropic 版本是深度平衡，行为不一致 | 抽共享工具使用严格版本 | **[已修]** 新增 `src/lib/json-extract.ts` |
| 2 | `src/lib/ai.ts:buildTherapyJournal` | 实际上未调用任何模型，靠模板 + 正则；与产品文案不符 | 接入 AI 或在 UI 明确标注 | 待定（涉及功能实现） |
| 3 | `src/lib/domain.ts:completeSession` | 手帐写入与督导生成强耦合；督导失败会影响用户感知 | 拆为两步异步流程 | 建议项 |
| 4 | `src/lib/domain.ts` | `parseTranscriptSafely` 内吞异常返回 null，调用方又重新抛错，错误信息链断裂 | 保留 error 而不是 null，或 log 一次 | 建议项 |
| 5 | `src/lib/rate-limit.ts` | 进程内 Map，集群失效；且无过期清理，长时间运行内存泄漏 | 用 `setInterval` 定期清理，或上 Redis | 建议项 |
| 6 | `src/app/api/auth/login/route.ts` | 直接内联 `analyticsEvents.push`，而项目其他地方通过 `logEvent` 辅助函数 | 统一到 `logEvent` | 建议项 |
| 7 | `src/lib/guardrails.ts:enforceInputGuardrail` | 每条消息都调 Moonshot；没有短路条件 | 见第 4.3.1 | 建议项 |
| 8 | `src/lib/moonshot.ts:createThinkingHumanizer` | 每 1s 固定节流，未考虑内容长度阈值；空内容也会触发 | 增加 `lastFlushedLength` 增量阈值 | 建议项 |
| 9 | `src/lib/crypto.ts:encryptForUser` | `EncryptedBlob` 无 `keyVersion` 字段；密钥轮转无路径 | 增加版本号字段，解密时按版本选 key | 建议项 |
| 10 | `src/lib/db.ts` | 全量读写大 JSON；`writeQueue` 仅保证本进程顺序 | 至少换 SQLite 单文件 | 建议项 |
| 11 | `src/components/app-dashboard.tsx` | 文件过大，多块职责；`formatDateTime`、`isStreamNearBottom` 等工具夹在组件中 | 拆分到 `utils` 与子组件 | 建议项 |
| 12 | `src/lib/session-progress.ts` | 自带正则探测"反思句式"，与 `src/lib/ai.ts:summarizeThemes` 逻辑风格重复 | 抽一个 `text-signals.ts` 模块 | 建议项 |
| 13 | `src/lib/anthropic.ts` | `normalizeThinkingText` 做 ASCII/全角标点替换；逻辑与前端 `app-dashboard-utils.ts:cleanMarkdown` 有重叠 | 合并到 `text-utils.ts` | **[已修]** 新增 `src/lib/text-utils.ts` 并统一复用 |
| 14 | `src/lib/admin.ts` | `eventsByType` 和 `sessionsByDay` 分别遍历数组两次 | 合并单次 reduce | **[已修]** session 统计已收敛为共享聚合逻辑 |
| 15 | `src/lib/domain.ts:createSession` | `const initialMessages = [...contextMessages];` 紧接着立刻 JSON.stringify 后加密，spread 多余 | 直接用 `contextMessages` | **[已修]** 已直接序列化 `contextMessages` |
| 16 | `src/lib/auth.ts` | 同意版本校验只在 `loginUser` 执行；已登录用户绕过 | 放到 middleware 或 `requireUser` | 建议项 |
| 17 | `tsconfig.tsbuildinfo` | 疑似已提交 | 加入 `.gitignore` | **[已确认]** `.gitignore` 已覆盖，当前仓库未跟踪该文件 |
| 18 | `.env.local` | 已在仓库根 | 立即 `git rm --cached`，改用 `.env.local.example` | **高危建议** |
| 19 | `src/lib/anthropic.ts` | Prompt caching header 未开启 | 加 `anthropic-beta: prompt-caching-2024-07-31` 并对 system 段打 cache_control | 建议项（高 ROI） |
| 20 | `src/lib/cursor-rules.ts` | 模块内缓存没有 TTL；热更新 `.mdc` 需要重启进程 | 加文件 mtime 监听或短 TTL | 建议项 |

---

## 8. 分阶段落地建议（Roadmap）

**M1（2–3 周，能开始收钱）**
- 接入 SQLite + Prisma（替换 `db.json`）；
- 实现配额 + Plus/Pro 订阅 + 一个支付通道（Stripe 或微信）；
- 打开 Anthropic prompt caching；
- Guardrail 短路逻辑 + thinking humanizer 节流优化；
- `.env.local` 出库、`APP_ENCRYPTION_KEY` 改走 `.env.production` + KMS 规划稿。

**M2（1–1.5 月，能扛规模）**
- Redis 限流、Token 计费账本；
- 高风险强制安全卡片 + crisisEvents 独立表 + 审计日志；
- Journal 向量化、跨会话检索；
- 拆 `domain.ts` / `app-dashboard.tsx` / `globals.css`；
- 10 组 e2e fixture snapshot。

**M3（2 月+，能做差异化）**
- 语音输入 / TTS；
- 企业 EAP 后台（Org 级聚合）；
- "咨询师 AI 督导助理"工具端；
- 练习作业系统 + 用户仪表盘；
- 未成年人/同意版本强制升级流程。

---

## 9. 终端功耗审计：为什么手机端会明显发烫

> 预期上这是一个"以文字对话为主"的轻量应用，CPU/GPU 都不应成为瓶颈。
> 实测手机端长时间使用后明显发烫 —— 定位结论是**前端渲染管线**问题，而不是网络或模型计算。

### 9.1 症状与定性判断
纯文字聊天应用在手机端理论峰值功耗应 < 1 W；持续发烫通常意味着 **GPU 长期在做 compositing / blurring**。
常见罪魁：持续动画 + 大半径 blur + backdrop-filter 叠层；这三个因子在当前项目里全部命中。

### 9.2 量化清单（修复前）
| 指标 | 数值 | 来源 |
| --- | --- | --- |
| `@keyframes` 总数 | **25+** | `src/app/globals.css` |
| `animation: ... infinite` 出现次数 | **30+** | 同上 |
| `backdrop-filter` 使用处 | **13** 处，半径 12–24px | 同上 |
| 最大 `filter: blur(...)` 半径 | **84px** | 环境光球 `.app-shell::before/after` |
| 聊天态持续运行的动画 | `surfaceAmbientShift 14s infinite`、`shellFloat 8s infinite`、多个 ambient orb | 未关闭 |
| 原移动端媒体查询覆盖 | 仅 `body::before/::after` 与工具栏按钮 | 未覆盖核心卡片与气泡 |
| 气泡/模态/侧栏上的毛玻璃 | `backdrop-filter: blur(18px) saturate(1.14)` 持续开启 | 每处都会启用离屏合成 |

### 9.3 具体发热来源（按影响排序）
1. **`backdrop-filter: blur(18–24px)` 在气泡、工具栏、侧栏、模态上持续开启**：每个元素都会为当前区域生成离屏合成图、做可分离高斯模糊再贴回，每次滚动或内容变更都触发。移动端 GPU 常在这一项上直接打满。
2. **`.view-stage::before/::after` 大面积 radial-gradient 装饰层**（`inset: -10%`）叠在聊天页之下：超视窗尺寸 + 多层半透明叠加，每次滚动都要 compositing。
3. **`filter: blur(32–84px)` 环境光球**：`.app-shell::before/::after`、`.admin-shell::before/::after`；`.app-shell-chat-active` 关闭了动画，但巨大模糊半径的 DOM 层依然存在，滚动时持续被重合成。
4. **`animation: surfaceAmbientShift 14s infinite alternate`** 在 `.chat-stage` 上——14s gradient 变换对手机无必要。
5. **流式渲染每帧 setState + spread-copy 整个消息数组**：`scheduleAssistantStreamUpdate` 虽已 RAF 节流，但一次 flush 对 `messages.map(...)` 整数组 + 每条气泡 `{ ...message }`。消息 > 30 时，React 对比每条 props 的成本开始显著。
6. **`visualViewport` 的 resize/scroll 监听**在软键盘弹/收时触发频繁；每次都回调 `revealComposer → scrollIntoView + scrollTo`，iOS 上 `scrollIntoView` 会连锁触发 keyboard → layout → composite 循环。

### 9.4 本次随手修复（已改动）
在 `src/app/globals.css` 末尾追加两段**移动端与低功耗**媒体查询块：

- **`@media (max-width: 780px), (hover: none) and (pointer: coarse)`**
  - `.chat-stage / .history-card / .journal-card / .runs-card` 的 `animation` 与 `::before/::after` 装饰置空；
  - `.view-stage::before / ::after` 直接 `display: none`；
  - `.app-shell::before/::after`、`.admin-shell::before/::after` 环境光球 `display: none`；
  - 所有气泡、工具栏、模态、侧栏、按钮的 `backdrop-filter / -webkit-backdrop-filter` 统一 `none`；气泡补回一条纯 `box-shadow` 保留层次感。
- **`@media (prefers-reduced-motion: reduce), (update: slow)`**：当用户开启"减少动态效果"、或设备上报低刷新/省电（多数 OEM 会给浏览器这个信号）时，主动去除核心卡片和气泡的 `backdrop-filter`。

**预期收益**：移动端空闲态 GPU 从"持续合成"降至"基本静止"，长对话场景机身温度可观感地下降（估算 30–50% GPU 时间节省）。桌面端视觉效果保持不变。

### 9.5 建议的后续优化（未改动）
- **`window.visualViewport` 事件节流**：`useDashboardChatUi` 的 `resize/scroll` 任一触发都会走一次 `revealComposer`；应在"已停在底部且无新增内容"时短路（`scrollHeight - clientHeight - scrollTop ≤ 4 px` 即 return）。
- **消息流式更新批量化**：目前 RAF flush 仍对**整个** `messages` 数组做 `.map(...)`；应让流式更新只改"最后一条"引用，把 `messages` 拆成 `stableMessages + streamingMessage`，其余气泡引用保持稳定，React 将跳过未变气泡的 reconciliation。
- **`content-visibility: auto` 应用于历史气泡**：消息条数 > 50 时，视窗外气泡的 layout/paint 成本会降至 0；这是最高 ROI 的一行优化。
- **移动端 `thinking-dots` 静态化**：`thinking-panel` 打开时 3 个 `<span>` 在跑 staggered animation；手机端可直接显示静态 "思考中…" 文字。
- **清理登录页残留 keyframes**：`landingParticleFloat / landingPrismSpin` 等在 `.app-shell-chat-active` 下不会用到；配合路由级 CSS 分割，登录页与主体 CSS 物理分离约可省 40 KB。
- **气泡根节点加 `contain: layout paint`**：让单气泡的变化不引起整屏重布局，显著降低流式期间的 layout cost。
- **实机采样**：Chrome DevTools Performance Insights 采一段 60 s 聊天的 "Rendering → Composite Layers" 时间线，回归验证 GPU 降载效果。

---

## 10. 进度条审计：为什么"你好"就跳到 16%

> 用户只打了"你好"并收到 AI 回复后，进度条跳到 16%，并显示"已开始承接当前困扰"。
> 这是**算法问题**，不是展示问题。

### 10.1 旧逻辑的病灶

```ts
const contentOpening = clamp(
  (userMessages.length > 0 ? 0.38 : 0) +    // 只要发过一句就白给 0.38
    (assistantMessages.length > 0 ? 0.24 : 0) + // AI 回了就再白给 0.24
    (userChars > 80 ? 0.16 : 0) +              // 实际内容门槛偏高
    Math.min(exchangeCount / 3, 1) * 0.22,
  0, 1
);
// "你好" 情形：0.38 + 0.24 + 0 + 0.073 ≈ 0.693
// percent = 0.693 * 24 ≈ 17%
```
并且 detailLabel 的 opening 分支里只要 `userMessages.length > 0` 就输出 "已开始承接当前困扰"，**未检查是否真的有困扰内容**。两个问题叠加导致了用户观察到的 16% + 误导性文案。

### 10.2 本次修复

位置：`src/lib/session-progress.ts`

1. **新增 `firstDisclosureScore`**（综合 `userChars/240`、长段落加成、主题命中、披露深度），把"有没有真实披露内容"作为 opening 阶段唯一的主要推进信号；
2. **把存在性白给权重从 0.38 + 0.24 降到 0.1 + 0.08**，真正的权重交给 `firstDisclosureScore`；
3. **阶段跃迁条件收紧**：`phase = exploring` 从"发过 2 条就算"改为"发过 2 条 **且** 总字数 ≥ 60 才算"，避免连续短句误升阶段；
4. **`detailLabel` 的 opening 分支细分四档**：
   - `userChars === 0` → "等待第一条消息"
   - `userChars < 20` → "刚打过招呼，尚未切入正题"
   - `themes.length > 0` → "已浮现 N 个主题"
   - `userChars < 80` → "正在了解你想聊什么"
   - 其余 → "已开始承接当前困扰"

### 10.3 修复前后对比（典型场景推演）

| 场景 | 旧 percent | 旧文案 | 新 percent | 新文案 |
| --- | --- | --- | --- | --- |
| "你好" + AI 回应 | 17% | 已开始承接当前困扰 | **6%** | 刚打过招呼，尚未切入正题 |
| "今天天气不错你好吗" | ~13% | 已开始承接当前困扰 | **7%** | 刚打过招呼，尚未切入正题 |
| "最近失眠，工作压力大不知怎么办" | ~19% | 已开始承接当前困扰 | **~27%**（进入 exploring） | 已浮现 1 个主题 |
| 单条 200 字披露含主题词 | ~35% | 正在继续澄清和展开 | ~38% | 正在继续澄清和展开 |

小幅对话不再"虚标"，真实披露发生时进度依然能推上去。

### 10.4 进度条后续建议（仍可继续优化）
- **显示精度降级**：< 10% 时建议不显示具体数字，改为"刚起步"徽标。数字太精确反而制造"系统在严密评估我"的被监视感，与咨询的松弛基调冲突。
- **在客户端做缓存而非重算**：`estimateSessionProgress` 每次渲染都会遍历 transcript 计算，可以在 `use-dashboard-data` 里用 `useMemo` 依赖 `messages.length + lastMessage.content.length` 做 memoization（当前已做一部分，可验证）。
- 其余结构性优化（流式消息拆分、模型自报 phase、用户侧显示开关）已在后续实现中完成。

---

## 12. 附：本次修改清单

本轮仅做了几处**非侵入性**的代码轻量化整理：

```1:63:src/lib/json-extract.ts
/**
 * 从模型输出的自由文本中提取 JSON 片段。
 *
 * 优先级：
 * 1. 三个反引号围栏 ```json ... ```
 * 2. 首个 `{` 起的平衡括号片段（字符串感知，忽略引号中的花括号）
 * 3. 原文 trim 后返回
 */
export function extractJsonBlock(text: string): string {
  // ... 详见文件
}
```

1. `src/lib/anthropic.ts` 与 `src/lib/moonshot.ts` 原本各有一份不同实现，现均改为 `import { extractJsonBlock } from "@/lib/json-extract"`，行为统一为严格的字符串感知平衡括号解析（moonshot 原实现在 "最远 `}`" 上更宽松，会在个别 payload 后面挂了解释性 JSON 时截错）。

2. 新增 `src/lib/text-utils.ts`，把 `cleanMarkdownText` / `cleanInlineMarkdown` / `normalizeThinkingText` 收敛成共享文本工具，减少 `app-dashboard-utils.ts` 与 `anthropic.ts` 的重复实现。

3. `src/lib/domain.ts:createSession` 中删除 `initialMessages = [...contextMessages]` 的冗余 spread，直接使用 `contextMessages` 序列化入库。

4. `src/lib/admin.ts` 将 session 相关统计（completed / supervision / risk / sessionsByDay / averageTurns）收敛到共享聚合逻辑中，减少重复遍历。

5. `tsconfig.tsbuildinfo` 项已核实：`.gitignore` 已有 `*.tsbuildinfo`，且当前仓库未跟踪该文件，因此不需要补改。

**本轮（功耗与进度条）新增的改动**：

6. `src/lib/session-progress.ts`：重写 opening 阶段评分与 `detailLabel` 分支；
   - 新增 `firstDisclosureScore`（字数 / 长段落 / 主题 / 披露深度的综合信号），把存在性白给权重从 0.38 + 0.24 压到 0.1 + 0.08；
   - 阶段跃迁条件增加"总字数 ≥ 60"门槛；
   - detailLabel 在 opening 分支细分为四档（"等待第一条消息 / 刚打过招呼 / 已浮现 N 个主题 / 正在了解你想聊什么 / 已开始承接当前困扰"）；
   - "你好" 场景从 17% + "已开始承接当前困扰" 降为 6% + "刚打过招呼，尚未切入正题"。

7. `src/app/globals.css`：新增两段媒体查询，在移动端 / 低功耗偏好下关闭昂贵的 GPU 合成层（`backdrop-filter`、`view-stage` 装饰层、环境光球、`surfaceAmbientShift` 等无限动画）；桌面端视觉效果不变。

8. `src/hooks/use-dashboard-data.ts`、`src/hooks/use-session-actions.ts`、`src/components/app-dashboard.tsx`、`src/lib/app-dashboard-types.ts`：将前端会话状态改为 `stableMessages + streamingMessage`，把流式更新从整列 `messages.map(...)` 收敛为仅更新当前流式消息，降低长对话中的每帧重渲染成本。

9. `src/lib/anthropic.ts`、`src/lib/types.ts`、`src/lib/session-progress.ts`：新增模型末尾 `<phase>...</phase>` 自报协议，在流式消费阶段即时剥离并写入 `assistantMessage.meta.phase`；进度条优先读取模型阶段，高置信度时不再完全依赖正则启发式。

10. `src/components/app-dashboard.tsx`、`src/app/api/me/route.ts`、`src/lib/auth.ts`：新增 `progressDisplay = show | minimal | hidden` 用户偏好，支持长按进度条弹出切换，以及侧边栏中的显式“会话进度条”设置入口；即使隐藏后也能从固定设置项恢复显示。

11. `src/app/globals.css`：为历史气泡新增 `.bubble-stable { content-visibility: auto; contain-intrinsic-size: auto 240px; }`，同时避开流式气泡以减少高度抖动。

其余发现仍以建议形式保留在本文档中，当前**尚未处理**的主要项包括：`domain.ts` 拆文件、`globals.css` 拆分、`app-dashboard.tsx` 大文件拆分，以及更大范围的结构性减重。
