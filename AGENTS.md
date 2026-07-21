# AGENTS.md

本文件是所有 agent 的统一入口。`CLAUDE.md` 是指向本文件的 symlink；不要分别维护两份入口说明。

## Read First

- 开始开发前先读本文件，再按任务读取对应 `.claude/skills/<skill-name>/SKILL.md`。
- `.claude/skills/` 是项目级规范来源，不只给 Claude Code 使用；不支持 Skill 工具的 agent 直接读取 `SKILL.md`。
- 项目事实、技术栈、目录、数据库、外部 API 与持久化背景见 `docs/project-facts.md`。
- 后端背景规范见 `backend/BACKEND_CONVENTIONS.md`，前端背景规范见 `frontend/FRONTEND_CONVENTIONS.md`。
- 前端产品设计、排版层级、组件状态、动效、响应式与可访问性规范统一以根目录 `DESIGN.md` 为准；项目级前端 skill 必须与其保持一致。

## Skill Routing

| 任务 | 先读取或调用 |
|------|-------------|
| 改/加后端路由端点 | `.claude/skills/backend-route/SKILL.md` |
| 改/加后端服务、接外部 API | `.claude/skills/backend-service/SKILL.md` |
| 改 DB schema / 写迁移 / DAL | `.claude/skills/backend-database/SKILL.md` |
| 写后端测试 | `.claude/skills/backend-testing/SKILL.md` |
| 新增/替换/查询/审查调试日志 | `.claude/skills/debug-logging/SKILL.md` |
| 改/加前端组件或页面 | `.claude/skills/frontend-component/SKILL.md` |
| 调样式 / 套设计系统 | `.claude/skills/frontend-styling/SKILL.md` |
| 改前端状态 / 数据流 | `.claude/skills/frontend-state-data/SKILL.md` |
| 加贯穿前后端的字段 | `.claude/skills/add-persisted-field/SKILL.md` |
| 改播客观点、关系搜索或内容项目 | `.claude/skills/backend-service/SKILL.md` + `.claude/skills/backend-database/SKILL.md` + `.claude/skills/frontend-state-data/SKILL.md` |
| 改内容项目来源、稿件或版本工作区 | `.claude/skills/backend-route/SKILL.md` + `.claude/skills/backend-database/SKILL.md` + `.claude/skills/frontend-state-data/SKILL.md` + `.claude/skills/frontend-component/SKILL.md` |
| 改内容证据、引用或创作生成任务 | `.claude/skills/backend-route/SKILL.md` + `.claude/skills/backend-service/SKILL.md` + `.claude/skills/backend-database/SKILL.md` + `.claude/skills/backend-testing/SKILL.md` + `.claude/skills/frontend-state-data/SKILL.md` + `.claude/skills/frontend-component/SKILL.md` |
| 新建/改/审查上述 skill | `.claude/skills/convention-skills/SKILL.md` |

## Hard Rules

- 遵循现有代码模式、命名、错误处理和测试模式。
- 后端路由不得直接写 SQL，必须通过 `services/*Store.js` 等 DAL 层。
- ID 校验使用 `validateId()`，音频文件删除使用 `cleanAudioFile()`。
- 外部 API 测试必须 mock，不依赖真实网络或真实业务密钥。
- 高并发外部模型任务必须走全局限速队列：TTS 走 `backend/src/services/ttsQueue.js`，LLM 走 `backend/src/services/llmQueue.js`，禁止在路由或服务里直接 `Promise.all` 打 MiniMax/MiMo；MiMo TTS 单例必须保留持久化限速账本和自适应安全并发，RPM 只按真实 HTTP 请求计数，voiceclone payload 必须通过独立的在途字节上限保护，禁止把 MiB 伪装成 RPM 或并发槽成本；保存到 `/audio/` 的大 WAV 克隆参考音频统一由 `audio.resolveVoiceClone()` 压缩并缓存后再批量发送；批量分段生成必须通过 `generation_jobs` lease 防重复入队。
- 长任务必须有 loading/error 状态；已接入 SSE 的任务要发送开始、进度、完成、失败事件。
- 前后端契约不得使用裸 `any`；新增持久化字段必须端到端同步。
- 前端设计系统当前为 Warm Workbench / Soft Editorial：语义色仍使用 `paper/ink/pink/lemon/blush/sage/lilac`，底层参考色板见 `frontend/src/index.css` 与 `.claude/skills/frontend-styling/SKILL.md`，组件层优先使用语义色。
- 前端二级界面/弹窗/全屏编辑面板统一使用 `frontend/src/components/ModalShell.tsx`；禁止在业务组件里重复手写 `fixed inset-0`、`role="dialog"` 和关闭键盘逻辑。
- 前端音频播放条统一使用 `frontend/src/components/Dashboard/AudioPlaybackBar.tsx`，或通过 `AudioPlayer` / `MiniAudioPlayer` 薄外壳接入；禁止在业务组件里重复维护 `<audio>`、播放状态、时长、seek、倍速逻辑。
- 前端顶级导航按用户任务组织为「工作台 / 内容库 / 音色库 / 自动化 / 设置」；`/editor` 与 `/transcribe` 是从工作台或内容库进入的上下文任务页，不再作为顶级导航。转录历史与统计统一归入内容库。
- ASR 产品契约按「服务位置 / 识别引擎 / 模型」分层：`asr_provider` 只表示 MiMo 云端、Mac 本地或 WSL 局域网；MOSS 是 WSL 下的 `asr_engine`，不得再作为独立 provider 或重复维护连接参数。
- 文件转录的中间文字只按已完成 chunk 推送：WSL job 的 `progress.text` 是累计临时文本，`progress.chunk_text` 是最新稳定 chunk，`progress.chunks` 是可恢复的有序已完成列表；前端遇到不带文字的阶段事件必须保留已有内容，并按 chunk index 去重。native long-form 单次推理不得伪造中间文字。
- 播客结构化转录中，`transcription_segments` 是不可变 ASR 事实；去重、合并和用户校对只发生在派生 `transcription_turns`，不得反写 Segment。Summary 必须引用已验证的 Segment index，时间范围由后端事实派生；逐字稿校对后旧摘要标记 `stale`。当前不持久化上传源音频，也不实现点击时间码、seek 或“回到现场”。
- 播客一键总结通过 `mimo.createLlmMessage()` 进入 `llmQueue`，长稿分批串行处理，并用 `transcription_summary_jobs` lease 防止刷新、多标签页或重试造成重复执行。
- 播客观点是可重建派生物：`transcription_claims` 必须绑定当前 Transcript 的合法 Speaker 与连续同 Speaker Segment，摘录和时间由后端事实派生；Turn 校对后观点标记 `stale`。重新分析原子替换当前观点，但内容项目已引用的旧观点保留为 stale 快照；删除 `transcription_results` 前必须在 DAL 事务内检查项目观点引用，有引用时原子阻止，禁止级联丢失用户研究成果。Embedding 失败必须降级关键词搜索；关系分析只处理用户选中的 Top N 候选并复用缓存。
- 内容证据以 Source 文本快照为事实根：Fragment 由后端确定性派生；Evidence 必须绑定项目、Source 内容哈希与连续片段范围，excerpt/offset 由后端计算。用户粘贴快照与自填 URL 不得冒充已核验事实或已抓取网页。编辑 `decision_state`（candidate/selected/rejected）与技术 `lifecycle_status`（active/stale/superseded）必须分列，来源移出或证据修正不得覆盖用户曾经的判断；并发修正必须对 active 生命周期做 CAS。AI 候选说明、AI 推断、用户备注/判断和来源原话必须分开存储与展示；Evidence `user_note` 本阶段不得进入外部模型上下文，模型返回的 ID、范围、摘录、引用和中英文第一人称经验一律按不可信输入校验。证据修正新增卡片并保留旧卡，Source 移出项目不删除 Source、Evidence 或历史 Citation；历史 Citation 快照完整性不依赖当前选择/关联状态，失效证据不得参与新生成。
- 证据提取、AI 提纲和 AI 主稿必须走 `mimo.createLlmMessage()` / `llmQueue` 与持久化 Creation Job；相同 request key + 相同输入复用，相同 key + 不同输入冲突，不同 key 的同指纹 active/completed 任务也必须收敛。任务必须使用 input/context fingerprint、lease、heartbeat 与唯一 run token，最终 Evidence 或 Revision/Citation 在 DAL 事务内做 token + 当前上下文 CAS，旧 worker 不得 ABA 收口，失败不得留半成品；前端不得以固定短墙钟超时关闭仍有进度的健康任务。Source 写入幂等键必须保存在不可被后续关联编辑覆盖的独立账本，旧请求重放不得复制或静默重关联已移出的 Source。里程碑只由首次真实事务提交后的唯一事件驱动；刷新、重复 SSE 或幂等重放不得重复庆祝。
- 创作正反馈只用于第一份非空原文快照、第一条采用证据、第一版可审阅提纲和第一版带合法引用初稿等低频、可验证且已持久化的里程碑；AI 草案落盘不得文案暗示用户已接受或已经定稿，普通保存不放粒子。反馈必须局部、可关闭、不阻塞、无声音/震动，`prefers-reduced-motion` 下使用静态成功卡，且不得替代 loading/progress/error 或引入积分、签到与 FOMO。
- 内容创作以 `content_projects` 为聚合根：来源通过项目关联进入工作区，Artifact 只保存稿件身份与用途，正文每次显式保存都新增不可覆盖的 Revision；当前稿件由最新 Revision 派生。新增或关联来源、创建 Artifact、追加 Revision 必须刷新项目 `updated_at`。`broadcasts` / `segments` 是兼容期的音频 Render，不得重新成为内容正文的唯一真相。Render 关联只能指向 `audio_script` Revision，创建前必须逐字核对请求正文与 Revision 内容；该关联表示“创建时来源”而非持续正文绑定，后续 segment 精修不得清空或伪造来源。整篇 Render 必须先同步创建 pending 记录再等待 TTS，并以 Broadcast ID 写音频；补偿时先用 DAL 原子确认并删除尚未收口的 pending，只有确认删除成功才可 `cleanAudioFile()`，状态不明时宁可暂留文件也不得破坏 generated Render。Segment 批量生成和单段 regenerate 必须以启动时 `id + broadcast_id + text + style_tag + index` 快照加持久化 `generation_token` 做成功/失败 CAS，恢复遗留 `generating` 时写入新 token，旧请求不得 ABA 覆盖；编辑、重排或删除后的旧结果必须丢弃并补偿清理。Segment 音频文件名使用 Segment ID + generation token，禁止按可变 index 覆盖或重命名，内部 token 不进入公共 DTO。项目删除后 Render 保留并把来源关联置空；缓存 FIFO 只淘汰已生成 Render，不得删除 pending 任务。项目、文本来源、Artifact 与 Revision 不受音频缓存 FIFO 清理影响，破坏性迁移或旧字段清理必须先回填核对并获得用户明确批准。
- 自动化不得把“保存 cron 配置”伪装成业务已执行：只有注入真实执行器并成功完成内容生产后才能更新 `last_run_at`。没有执行器时 scheduler 不启动 cron，前端必须明确标记不可用；后续 Automation Run 需要持久化输入、状态、错误和产物。
- 开发引入新约定、新路由族、新组件类型或新持久化套路时，必须同步更新对应 skill 与本文件。

## Commands

后端在 `backend/` 目录执行：

```bash
npm run dev
npm test -- --runInBand
```

前端在 `frontend/` 目录执行：

```bash
npm run dev
npm run build
npm run lint
npm run test
```
