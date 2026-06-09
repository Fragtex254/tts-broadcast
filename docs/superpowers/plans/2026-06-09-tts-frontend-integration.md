# 前端接入 TTS 精细控制参数 Implementation Plan

**Goal:** 将后端已支持的 speed/emotion/pitch 精细控制参数接入前端，使用户可以通过 UI 控制语音速度、情感和音调

**Architecture:** 从后端路由到前端 UI 全链路打通 — 后端路由接收并存储新参数，前端 store/API 扩展类型，VoiceGenerator 添加控制面板

---

## Task 1: 后端路由接入新参数

**Files:**
- Modify: `backend/src/routes/broadcast.js`
- Modify: `backend/src/routes/segments.js`

broadcast.js 的 `POST /generate` 路由需要：
1. 从 req.body 解构 `speed`, `emotion`, `pitch`
2. 传入 `tts.generateSpeech()`
3. 存入 voiceConfig JSON

broadcast.js 的 `PATCH /:id/voice-config` 路由需要：
1. 从 req.body 解构 `speed`, `emotion`, `pitch`
2. 存入 voiceConfig JSON

segments.js 的 `batch-generate` 和 `regenerate` 路由需要：
1. 从 voiceConfig 解析 `speed`, `emotion`, `pitch`
2. 传入 `tts.generateSpeech()`

---

## Task 2: 前端 store 和 API 类型扩展

**Files:**
- Modify: `frontend/src/store/index.ts`
- Modify: `frontend/src/services/api.ts`

store voiceConfig 类型添加 speed/emotion/pitch，API 参数类型同步扩展

---

## Task 3: VoiceGenerator 控制面板 UI

**Files:**
- Modify: `frontend/src/components/Dashboard/VoiceGenerator.tsx`

仅在 preset 模式下显示速度/情感/音调控制面板
