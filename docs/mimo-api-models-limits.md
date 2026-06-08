---
title: "Xiaomi MiMo API 开放平台 Token Plan 全球上线"
source: "https://platform.xiaomimimo.com/docs/zh-CN/quick-start/model?target=%E6%A8%A1%E5%9E%8B%E4%B8%8E%E9%99%90%E9%80%9F"
author:
published:
created: 2026-06-08
description: "一次购买，畅用 MiMo-V2.5 两款全新顶级旗舰模型，更有 TTS 模型全档位套餐限时免费。诚邀全球用户释放 Xiaomi MiMo 大模型的强大生产力"
tags:
  - "clippings"
---
产品定价

Token Plan

新闻

往期新闻

集成扩展

使用指南

工具调用

多模态理解

精彩活动

更新日志

条款与协议

开发者交流群

## 模型与限速

本页列出 Xiaomi MiMo API 开放平台当前支持的所有模型，包含模型能力、长度限制和限流配额，帮助您根据使用场景选择合适的模型。

### 限流说明

平台对每个账号设有模型并发上限，服务器负载较高时可能出现响应延迟或 `429` 报错。建议您合理规划请求频率，在高并发场景下实现请求重试与退避策略，以避免触发限流。

- **RPM（Requests Per Minute）** ：每分钟最多发起的请求数。计算范围为调用同一模型时，单个账号下所有 API Key 的请求总数之和。
- **TPM（Tokens Per Minute）** ：每分钟最多交互的 Token 数。计算范围为调用同一模型时，单个账号下所有 API Key 的请求 Token 总数之和。

### 文本生成模型

<table><colgroup><col> <col> <col> <col> <col></colgroup><thead><tr><th><strong>模型系列</strong></th><th><strong>模型 ID (Model ID)</strong></th><th><strong>能力支持</strong></th><th><strong>长度限制（token）</strong></th><th><strong>限流</strong></th></tr></thead><tbody><tr><td rowspan="2"><strong>Pro 系列</strong></td><td><code>mimo-v2.5-pro</code></td><td rowspan="2">文本生成<br>深度思考<br>流式输出<br>函数调用<br>结构化输出<br>联网搜索</td><td rowspan="2">上下文窗口：1M<br>最大输出：128K</td><td rowspan="5">最大 RPM：100<br>最大 TPM：10M</td></tr><tr><td><code>mimo-v2-pro</code></td></tr><tr><td rowspan="2"><strong>Omni 系列</strong></td><td><code>mimo-v2.5</code></td><td rowspan="2">文本生成<br>全模态理解<br>深度思考<br>流式输出<br>函数调用<br>结构化输出<br>联网搜索</td><td>上下文窗口：1M<br>最大输出：128K</td></tr><tr><td><code>mimo-v2-omni</code></td><td>上下文窗口：256K<br>最大输出：128K</td></tr><tr><td><strong>Flash 系列</strong></td><td><code>mimo-v2-flash</code></td><td>文本生成<br>深度思考<br>流式输出<br>函数调用<br>结构化输出<br>联网搜索</td><td>上下文窗口：256K<br>最大输出：64K</td></tr></tbody></table>

### 语音识别模型（ASR）

| **模型 ID (Model ID)** | **能力支持** | **长度限制（token）** | **限流** |
| --- | --- | --- | --- |
| `mimo-v2.5-asr` | 语音识别 | 上下文窗口：8k   最大输出：2k | 最大 RPM：100   最大 TPM：10k |

### 语音合成模型（TTS）

<table><colgroup><col> <col> <col> <col></colgroup><thead><tr><th><strong>模型 ID (Model ID)</strong></th><th><strong>能力支持</strong></th><th><strong>长度限制（token）</strong></th><th><strong>限流</strong></th></tr></thead><tbody><tr><td><code>mimo-v2.5-tts</code></td><td>语音合成</td><td rowspan="4">上下文窗口：8K<br>最大输出：8K</td><td rowspan="4">最大 RPM：100<br>最大 TPM：10M</td></tr><tr><td><code>mimo-v2.5-tts-voiceclone</code></td><td>语音合成<br>音色克隆</td></tr><tr><td><code>mimo-v2.5-tts-voicedesign</code></td><td>语音合成<br>音色设计</td></tr><tr><td><code>mimo-v2-tts</code></td><td>语音合成</td></tr></tbody></table>

### 快速选型指南

| 需求场景 | 推荐模型 |
| --- | --- |
| 复杂推理、深度分析、长文档处理 | `mimo-v2.5-pro` |
| 图片、音频、视频内容理解 | `mimo-v2.5` 或 `mimo-v2-omni` |
| 低成本、快速响应 | `mimo-v2-flash` |
| 语音转文字（支持中英双语） | `mimo-v2.5-asr` |
| 文字转语音（标准预置音色） | `mimo-v2.5-tts` |
| 声音克隆（上传音频样本） | `mimo-v2.5-tts-voiceclone` |
| 自定义音色设计 | `mimo-v2.5-tts-voicedesign` |

更新时间 2026 年 06 月 02 日