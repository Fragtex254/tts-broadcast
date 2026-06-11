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

> 以下为本项目当前的 ASR 集成方式。历史设计见 [ASR + LiteLLM 设计文档](../superpowers/specs/2026-06-10-asr-litellm-design.md) 和 [ASR 上传转录设计文档](../superpowers/specs/2026-06-11-asr-transcribe-design.md)。

### 调用方式

项目使用独立的 MiMo 标准 API client 调用 ASR，不经过 Anthropic SDK：

```
前端页面
  → transcribeApi
    → routes/transcribe.js
      → services/media.js: fileToAsrDataUrls()
      → services/asr.js: transcribeMedia()
        → POST https://api.xiaomimimo.com/v1/chat/completions
          (model: mimo-v2.5-asr)
```

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

## 计费说明

- 计费：请参考 [按量计费 API](https://platform.xiaomimimo.com/#/docs/pricing) 。
- 查看账单：您可以在控制台的 [账单明细](https://platform.xiaomimimo.com/#/console/usage) 页面查看用量。

更新时间 2026 年 06 月 10 日
