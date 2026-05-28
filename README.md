# TTS 每日 AI 简讯播报系统

基于 AI HOT 资讯数据源，自动抓取、改写、生成 TTS 语音播报的全栈应用。支持定时任务自动播报、多语音风格选择、历史记录管理等功能。

## 功能特性

- **AI 资讯获取** - 从 AI HOT 获取每日精选 AI 资讯，支持按分类筛选
- **智能改写** - 使用 MiMo 大模型将资讯改写为口播稿，支持自定义开场白和结束语
- **TTS 语音生成** - 支持预设音色、语音克隆、音色设计等多种语音模式
- **定时播报** - 基于 Cron 表达式的定时任务调度，自动执行播报流程
- **历史管理** - 播报历史记录查看、音频回放、分页浏览
- **设置管理** - API Key 配置、语音偏好、开场白/结束语自定义
- **响应式前端** - 基于 React + Tailwind CSS 的现代化管理界面

## 技术栈

### 后端

| 技术 | 说明 |
|------|------|
| Node.js | 运行环境 |
| Express | Web 框架 |
| better-sqlite3 | 嵌入式数据库 |
| OpenAI SDK | MiMo API 调用 |
| node-cron | 定时任务调度 |
| axios | HTTP 请求 |

### 前端

| 技术 | 说明 |
|------|------|
| React 19 | UI 框架 |
| TypeScript | 类型安全 |
| Vite | 构建工具 |
| Tailwind CSS 4 | 样式方案 |
| Zustand | 状态管理 |
| React Router | 路由管理 |
| Axios | HTTP 客户端 |

## 快速开始

### 前置要求

- Node.js >= 18.0.0
- npm >= 9.0.0
- MiMo API Key（用于 TTS 语音生成和文本改写）

### 安装

```bash
# 克隆项目
git clone <repository-url>
cd tts-broadcast

# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

### 配置

1. 在 `backend` 目录下创建 `.env` 文件：

```bash
cp backend/.env.example backend/.env
```

2. 编辑 `.env`，填入你的 MiMo API Key：

```env
MIMO_API_KEY=your_mimo_api_key_here
PORT=3001
NODE_ENV=development
```

### 启动

**一键启动（推荐）：**

```bash
./start.sh
```

脚本会自动检查并安装依赖，同时启动前端和后端服务。按 `Ctrl+C` 停止所有服务。

**手动启动：**

```bash
# 终端 1：启动后端
cd backend
npm run dev

# 终端 2：启动前端
cd frontend
npm run dev
```

启动后访问 `http://localhost:5173`，后端运行在 `http://localhost:3001`。

## API 文档

### 播报接口

#### 获取今日资讯

```
GET /api/broadcast/today
```

**查询参数：**
- `category` (string, 可选) - 资讯分类
- `take` (number, 可选, 默认 30) - 返回数量，最大 100

**响应示例：**
```json
{
  "items": [
    {
      "title": "资讯标题",
      "content": "资讯内容",
      "category": "AI"
    }
  ]
}
```

#### 改写口播稿

```
POST /api/broadcast/rewrite
```

**请求体：**
```json
{
  "items": [{ "title": "...", "content": "..." }],
  "opening": "自定义开场白",
  "closing": "自定义结束语"
}
```

**响应示例：**
```json
{
  "script": "改写后的口播稿内容..."
}
```

#### 生成 TTS 语音

```
POST /api/broadcast/generate
```

**请求体：**
```json
{
  "text": "口播稿内容",
  "voice": "预设音色名称",
  "voiceType": "preset | clone | design",
  "voiceDesign": "音色描述",
  "voiceClone": "克隆音频 URL",
  "stylePrompt": "风格提示词",
  "sourceItems": [{ "title": "...", "content": "..." }]
}
```

**响应示例：**
```json
{
  "broadcast": {
    "id": 1,
    "title": "口播稿标题...",
    "content": "口播稿内容",
    "audio_path": "/audio/broadcast_1234567890.wav",
    "status": "generated"
  },
  "audioUrl": "/audio/broadcast_1234567890.wav"
}
```

#### 获取历史播报

```
GET /api/broadcast/history
```

**查询参数：**
- `page` (number, 可选, 默认 1) - 页码
- `limit` (number, 可选, 默认 20) - 每页数量

**响应示例：**
```json
{
  "broadcasts": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

#### 获取播报详情

```
GET /api/broadcast/:id
```

#### 获取播报音频

```
GET /api/broadcast/:id/audio
```

返回 WAV 格式音频文件。

---

### 设置接口

#### 获取设置

```
GET /api/settings
```

**响应示例：**
```json
{
  "settings": {
    "api_key": "sk-...",
    "default_voice": "zh-CN-YunxiNeural",
    "opening_script": "大家好，欢迎收听今日 AI 简讯。",
    "closing_script": "以上就是今天的 AI 简讯，我们下期再见。"
  }
}
```

#### 更新设置

```
PUT /api/settings
```

**请求体：**
```json
{
  "default_voice": "zh-CN-YunxiNeural",
  "opening_script": "自定义开场白",
  "closing_script": "自定义结束语"
}
```

#### 测试 API Key

```
POST /api/settings/test-key
```

**响应示例：**
```json
{
  "valid": true
}
```

---

### 定时任务接口

#### 获取任务列表

```
GET /api/schedules
```

**响应示例：**
```json
{
  "schedules": [
    {
      "id": 1,
      "name": "每日早间播报",
      "cron_expression": "0 8 * * *",
      "content_types": "[\"AI\"]",
      "is_active": 1,
      "last_run_at": "2025-05-27T08:00:00.000Z"
    }
  ]
}
```

#### 创建定时任务

```
POST /api/schedules
```

**请求体：**
```json
{
  "name": "每日早间播报",
  "cron_expression": "0 8 * * *",
  "content_types": "[\"AI\", \"LLM\"]"
}
```

#### 更新定时任务

```
PUT /api/schedules/:id
```

#### 删除定时任务

```
DELETE /api/schedules/:id
```

#### 切换任务状态

```
POST /api/schedules/:id/toggle
```

启用或禁用定时任务。

## Cron 表达式示例

```
┌────────── 分钟 (0-59)
│ ┌──────── 小时 (0-23)
│ │ ┌────── 日 (1-31)
│ │ │ ┌──── 月 (1-12)
│ │ │ │ ┌── 星期 (0-7, 0 和 7 都是周日)
│ │ │ │ │
* * * * *
```

| 表达式 | 说明 |
|--------|------|
| `0 8 * * *` | 每天早上 8:00 |
| `0 12 * * *` | 每天中午 12:00 |
| `0 20 * * 1-5` | 工作日晚上 8:00 |
| `0 9 * * 1` | 每周一早上 9:00 |
| `30 8,12,18 * * *` | 每天 8:30、12:30、18:30 |
| `0 */2 * * *` | 每隔 2 小时 |
| `0 8 1 * *` | 每月 1 号早上 8:00 |

## 项目结构

```
tts-broadcast/
├── backend/
│   ├── src/
│   │   ├── app.js            # Express 应用入口
│   │   ├── db/
│   │   │   ├── index.js      # 数据库初始化
│   │   │   └── schema.sql    # 数据库表结构
│   │   ├── routes/
│   │   │   ├── broadcast.js  # 播报相关路由
│   │   │   ├── settings.js   # 设置相关路由
│   │   │   └── schedule.js   # 定时任务路由
│   │   └── services/
│   │       ├── aihot.js      # AI HOT 资讯服务
│   │       ├── mimo.js       # MiMo TTS/LLM 服务
│   │       └── scheduler.js  # 定时调度服务
│   ├── audio/                # 生成的音频文件（git 忽略）
│   ├── data/                 # SQLite 数据库文件（git 忽略）
│   ├── tests/                # 测试文件
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/       # React 组件
│   │   ├── pages/            # 页面组件
│   │   ├── services/         # API 服务层
│   │   ├── store/            # Zustand 状态管理
│   │   ├── App.tsx           # 路由配置
│   │   └── main.tsx          # 应用入口
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── README.md
└── .gitignore
```

## 许可证

ISC License
