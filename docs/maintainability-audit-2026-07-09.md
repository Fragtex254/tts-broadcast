# 维护性审查记录（2026-07-09）

本记录只保存本轮审查结论和后续维护建议；当前开发入口仍以 `AGENTS.md`、`docs/project-facts.md`、`backend/BACKEND_CONVENTIONS.md`、`frontend/FRONTEND_CONVENTIONS.md` 与 `.claude/skills/` 为准。

## 本轮已处理

- 后端 `schedules` 表 SQL 从 `services/scheduler.js` 拆到 `services/scheduleStore.js`，`scheduler` 只保留 cron 编排、业务校验和任务启停。
- `routes/schedule.js` 的 `:id` 校验统一改为 `validateId()`，补充非法 ID 路由测试。
- `routes/transcribe.js` 的上传临时文件清理增加目录边界检查，避免误删非转录临时目录文件。
- 前端懒加载占位从 spinner 改为骨架屏，符合当前组件规范。
- `Transcribe.tsx` 拆出 `transcribeUtils.ts`、`TranscriptionStatsCenter`、`TranscribeProviderControls`，减少页面内重复控件和纯工具逻辑。
- 新增 `components/ModalShell.tsx`，把确认弹窗、转录结果弹窗、长文本编辑、音频标签编辑、音色选择、角色立绘查看、分段精修等二级界面收敛到同一个 dialog/fullscreen 外壳。
- 新增 `components/Dashboard/AudioPlaybackBar.tsx` 与 `audioPlaybackUtils.ts`，`AudioPlayer`、`MiniAudioPlayer` 和分段内联播放器统一复用同一套 `<audio>` 生命周期、seek、时长、波形/进度、倍速保音高和播放失败处理。
- 删除 `docs/ui-audit/` 旧一次性 UI 审查报告，避免旧行号和旧组件状态干扰当前维护。
- 同步 README、project facts、前后端 conventions 和相关 skill 的结构说明。

## 仍需继续关注

- `frontend/src/pages/Transcribe.tsx` 仍偏大，下一轮优先拆 `SingleTranscribePanel`、`BatchTranscribePanel`、`BatchFileList` 与 `BatchResultList`。
- `frontend/src/pages/Settings.tsx`、`VoicePresetTab.tsx`、`SegmentEditor.tsx`、`AudioTagTextEditor.tsx` 仍超过 300 行；其中弹窗与播放条基础逻辑已收敛，下一轮应继续拆表单区块、列表项、编辑状态和 store 编排。
- `backend/src/services/mimo.js` 超过 1000 行，建议按 LLM 协议 client、文本解析/兜底、风格标签建议、转录排版继续拆。
- `backend/src/routes/segments.js`、`transcribe.js`、`voicePresets.js` 仍超过 300 行；已有测试较完整，后续可以在不改变 API 的前提下继续拆服务函数或子路由。
- `docs/superpowers/` 明确作为历史决策记录保留，不作为当前待办入口；删历史文档前应确认已被当前 conventions、project facts 或代码完全替代。
