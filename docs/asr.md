---
title: "MiMo-V2.5-ASR 语音识别 API"
source: "https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/Speech-Recognition"
author:
published:
created: 2026-06-10
description: "MiMo-V2.5-ASR 语音识别 API 的完整文档，包含模型能力、调用方式、音频格式要求及项目集成说明"
tags:
  - "clippings"
---

## 语音识别（MiMo-V2.5-ASR）

语音识别支持将输入的音频自动转换为文本输出，适用于会议转写、歌词识别、方言转写、嘈杂环境录音等场景。您可通过指定语种等参数，提升识别准确率。

**核心能力**

- **覆盖多种语言与方言** ：支持中英双语识别及自动语种检测，原生支持粤语、吴语、闽南语、四川话等中国方言。
- **支持多种复杂场景** ：在噪声、远场拾音、多人重叠对话等复杂声学条件下保持稳定识别，支持带伴奏的歌词转写。
- **精准处理多种专业内容** ：精准识别古诗词、专业术语、人名地名等知识密集型内容，自动生成标点无需后处理。

## 支持的模型

当前仅支持 `mimo-v2.5-asr` 模型。

| **模型 ID** | **能力支持** | **长度限制（token）** | **限流** |
| --- | --- | --- | --- |
| `mimo-v2.5-asr` | 语音识别 | 上下文窗口：8K，最大输出：2K | 最大 RPM：100，最大 TPM：10K |

> 限流说明见 [模型与限速](./mimo-api-models-limits.md) 。

## 准备工作

获取 API Key 等准备工作，请参考 [首次调用 API](https://platform.xiaomimimo.com/#/docs/quick-start/first-api-call) 。

## 支持的音频格式

目前仅支持 `wav` 和 `mp3` 格式的音频样本文件，传入前需将音频文件转换为 Base64 编码字符串，Base64 编码后的字符串大小上限为 10MB。

项目后端的 `/api/transcribe` 接口会额外接收 `m4a`、`mp4`、`mov`、`webm` 上传文件。后端会先尝试转成 ASR 可接受的 MP3 data URL；如果单次 data URL 仍超过 10MB，会用 `ffmpeg` 检测静音区，按接近 15 秒、最大 30 秒的范围切片，逐片调用 ASR 后把文本按顺序拼接返回。这个切片流程对前端无感。

传入格式为：`data:{MIME_TYPE};base64,$BASE64_AUDIO`

| **格式** | **MIME 类型** |
| --- | --- |
| wav | `audio/wav` |
| mp3 | `audio/mpeg` 或 `audio/mp3` |

## 调用示例

**注意事项**

- 音频数据需通过 `input_audio.data` 字段以 data URL 格式传入。
- 使用 `asr_options.language` 指定语种，未配置时为自动检测。明确语种时建议手动指定，提升识别效果。支持取值：`auto`、`zh`、`en`。

### 非流式调用

**Curl**

```bash
curl --location --request POST 'https://api.xiaomimimo.com/v1/chat/completions' \
--header "api-key: $MIMO_API_KEY" \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "mimo-v2.5-asr",
    "messages": [
        {
            "role": "user",
            "content": [
                {
                    "type": "input_audio",
                    "input_audio": {
                        "data": "data:{MIME_TYPE};base64,$BASE64_AUDIO"
                    }
                }
            ]
        }
    ],
    "asr_options": {
        "language": "zh"
    }
}'
```

**Python**

```python
import os
import base64
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("MIMO_API_KEY"),
    base_url="https://api.xiaomimimo.com/v1"
)

# 需替换为本地真实的文件路径
with open("audio_file.wav", "rb") as f:
    audio_bytes = f.read()
audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")

completion = client.chat.completions.create(
    model="mimo-v2.5-asr",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "input_audio",
                    "input_audio": {
                        "data": f"data:audio/wav;base64,{audio_base64}"
                    }
                }
            ]
        }
    ],
    extra_body={
        "asr_options": {
            "language": "zh"
        }
    }
)

print(completion.model_dump_json())
```

### 流式调用

**Curl**

```bash
curl --location --request POST 'https://api.xiaomimimo.com/v1/chat/completions' \
--header "api-key: $MIMO_API_KEY" \
--header 'Content-Type: application/json' \
--data-raw '{
    "model": "mimo-v2.5-asr",
    "messages": [
        {
            "role": "user",
            "content": [
                {
                    "type": "input_audio",
                    "input_audio": {
                        "data": "data:{MIME_TYPE};base64,$BASE64_AUDIO"
                    }
                }
            ]
        }
    ],
    "asr_options": {
        "language": "auto"
    },
    "stream": true
}'
```

**Python**

```python
import os
import base64
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("MIMO_API_KEY"),
    base_url="https://api.xiaomimimo.com/v1"
)

# 需替换为本地真实的文件路径
with open("audio_file.wav", "rb") as f:
    audio_bytes = f.read()
audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")

completion = client.chat.completions.create(
    model="mimo-v2.5-asr",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "input_audio",
                    "input_audio": {
                        "data": f"data:audio/wav;base64,{audio_base64}"
                    }
                }
            ]
        }
    ],
    extra_body={
        "asr_options": {
            "language": "auto"
        }
    },
    stream=True
)

for chunk in completion:
    print(chunk.model_dump_json())
```

## 项目集成规划

> 以下为本项目当前的 ASR 集成方式。设计背景见 [ASR 上传转录设计文档](superpowers/specs/2026-06-11-asr-transcribe-design.md)。

### 调用方式

项目使用独立 ASR provider 调用转录服务，不经过 Anthropic SDK。默认 provider 是 MiMo 云端，也可以切换到 Mac 本地 Qwen/MLX 服务：

```
前端页面
  → transcribeApi
    → routes/transcribe.js
      → services/media.js: fileToAsrDataUrls()
      → services/asr.js: transcribeMedia()
        → provider=mimo:
          POST https://api.xiaomimimo.com/v1/chat/completions
          (model: mimo-v2.5-asr)
        → provider=qwen_mlx:
          POST {qwen_asr_base_url}/audio/transcriptions
          (model: qwen_asr_model)
```

### Mac 本地 Qwen/MLX provider

设置页的「ASR 转录引擎」可选择 `Qwen 本地（Mac MLX）`。该 provider 调用本地 OpenAI-compatible `/v1/audio/transcriptions` 端点，继续复用项目现有 ffmpeg 切片、SSE 进度和批量串行处理逻辑。

推荐 Mac 启动方式：

```bash
brew install ffmpeg
python3 -m venv .venv-qwen-asr
source .venv-qwen-asr/bin/activate
pip install "mlx-qwen3-asr[serve]"

mlx-qwen3-asr --doctor
mlx-qwen3-asr serve --api-key your-local-key --model Qwen/Qwen3-ASR-1.7B
```

> 实测留痕：`mlx-qwen3-asr 0.3.5` 官方 `serve` 在当前 Mac/MLX 组合下，转录请求可能报 `There is no Stream(gpu, 1) in current thread.`。原因是 server 端通过 `asyncio.to_thread()` 跑推理，MLX 的 GPU stream 与线程绑定。临时规避方案是启动一个同步兼容服务：仍暴露 `/v1/audio/transcriptions`，但在主线程调用 `Session.transcribe()`。本次本地验证使用的同步服务位于 `~/Library/Caches/tts-broadcast/qwen_asr_sync_server.py`，API Key 为 `local-qwen-asr`。如果后续升级 `mlx-qwen3-asr` 后官方 server 修复该问题，可切回官方 `serve`。

对应设置：

| **设置项** | **默认值** | **说明** |
| --- | --- | --- |
| `asr_provider` | `mimo` | `mimo` 或 `qwen_mlx` |
| `qwen_asr_base_url` | `http://localhost:8765/v1` | 本地 OpenAI-compatible Base URL；本机代理环境建议用 `http://127.0.0.1:8765/v1` |
| `qwen_asr_model` | `Qwen/Qwen3-ASR-1.7B` | 本地模型 ID，可按服务实际加载模型调整 |
| `qwen_asr_api_key` | 空 | 若 serve 使用 `--api-key`，这里填写同一个 Bearer Token |

注意：Qwen3-ASR 官方单段长音频能力约 20 分钟。项目对 `qwen_mlx` 使用单独的低密度切片策略：单片 data URL 上限 256MB，目标 10 分钟、最大 20 分钟；MiMo provider 仍保持 10MB 上限和 15-30 秒切片。前端请求超时和 Node 到本地 Qwen 的请求超时均按长任务放宽到 30 分钟，必要时可通过 `QWEN_ASR_TIMEOUT_MS` 调大后端到本地 Qwen 的超时时间。

### 请求参数说明

| **参数** | **类型** | **必填** | **说明** |
| --- | --- | --- | --- |
| `model` | string | 是 | 固定为 `mimo-v2.5-asr` |
| `messages[].content[].type` | string | 是 | 固定为 `input_audio` |
| `messages[].content[].input_audio.data` | string | 是 | data URL 格式的音频 Base64 |
| `asr_options.language` | string | 否 | 语种：`auto`（默认）/ `zh` / `en` |
| `stream` | boolean | 否 | 是否流式输出，默认 `false` |

### 响应格式

非流式调用返回标准 Chat Completion 格式，识别结果在 `choices[0].message.content` 中：

```json
{
  "choices": [
    {
      "message": {
        "content": "识别出的文本内容"
      }
    }
  ]
}
```

### 项目中的适用场景

| **场景** | **说明** |
| --- | --- |
| 语音输入稿件 | 用户通过语音口述播报稿件，ASR 转写为文本后送入 LLM 改写 |
| 音频内容校验 | 对已生成的 TTS 音频进行 ASR 回转，校验合成质量 |
| 批量转录 | 选择文件夹自动遍历子目录，勾选需要的文件批量转录，每篇单独保存，支持打包下载 ZIP。后端串行处理遵守 RPM 限流，单文件失败隔离 |

### 批量转录集成说明

批量转录通过 `POST /api/transcribe/batch` 端点实现，与单文件转录共享 `services/media.js`（音频转码切片）和 `services/asr.js`（ASR 调用）链路：

```
前端（webkitdirectory 选文件夹 + 勾选）
  → transcribeApi.batchTranscribe (FormData: media[] + language + taskId + relativePaths)
    → routes/transcribe.js: POST /batch
      → multer upload.array 接收多文件，立即返回 202（任务已受理）
      → 后台 runBatchTranscription 串行处理：
        for each file:
          → services/media.js: fileToAsrDataUrls()
          → services/asr.js: transcribeMedia()
            → provider=mimo 调 MiMo ASR
            → provider=qwen_mlx 调 Mac 本地 Qwen/MLX ASR
          → SSE 推送 file-start / file-progress / file-complete / file-error
        → SSE 推送 completed（带 results / succeeded / failed）
```

**关键设计**：

- **异步模型**：上传校验通过后立即返回 202，实际转录在后台串行进行，避免长任务触发前端 HTTP 超时
- **SSE 进度**：所有进度和最终结果通过 `/api/sse/:taskId` 推送，`phase` 字段区分阶段（`batch-preparing` / `file-start` / `file-progress` / `file-complete` / `file-error` / `completed`）
- **文件隔离**：单文件转录失败不影响其他文件，失败文件在结果中标记 `error` 字段
- **中文文件名**：multer/busboy 默认 latin1 解码 multipart filename，`decodeFileName` 重编码为 utf8 修复中文乱码
- **目录结构**：前端通过 `relativePaths`（JSON 字符串数组）传递 `webkitRelativePath`，保留子目录信息
- **文件数上限**：默认 50，环境变量 `TRANSCRIBE_BATCH_MAX_FILES` 可调

## 计费说明

- 计费：请参考 [按量计费 API](https://platform.xiaomimimo.com/#/docs/pricing) 。
- 查看账单：您可以在控制台的 [账单明细](https://platform.xiaomimimo.com/#/console/usage) 页面查看用量。

更新时间 2026 年 06 月 10 日
