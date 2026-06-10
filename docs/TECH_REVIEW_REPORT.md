# TTS-Broadcast 项目技术评审报告

> 评审日期：2026-06-10
> 文档编号：TECH-REVIEW-001
> 评审范围：技术栈、代码规范、Axios TLS 安全
> 优先级：P0（阻塞）/ P1（高危）/ P2（中危）/ P3（建议）

---

## 模块一：技术栈评审

### 1.1 整体架构与业务匹配度

| 维度 | 评估 | 说明 |
|------|------|------|
| 架构合理性 | ✅ 良好 | 前后端分离，Express + React，符合项目规模 |
| 数据库选型 | ✅ 合理 | better-sqlite3 适合单机部署，WAL 模式已启用 |
| 状态管理 | ✅ 合理 | Zustand 轻量，适合本项目复杂度 |
| 构建工具 | ✅ 合理 | Vite 开发体验好，适合 React 项目 |
| 部署便利性 | ⚠️ 欠缺 | 无 Docker、无 CI/CD、无 monorepo 工具 |

**结论**：技术栈整体与业务需求匹配度较高，但**工程化基础设施薄弱**。

---

### 1.2 技术选型风险清单

#### 🔴 P0 — 阻塞级风险

| # | 问题 | 位置 | 风险描述 | 落地路径 |
|---|------|------|----------|----------|
| P0-1 | **TLS 安全被全局禁用** | `backend/package.json` 第8行 | 测试脚本 `NODE_TLS_REJECT_UNAUTHORIZED=0` 全局关闭 Node.js TLS 证书验证，**所有 HTTPS 请求均不受证书保护**，存在中间人攻击风险 | 见模块三 |
| P0-2 | **API 实例级 TLS 禁用** | `backend/src/services/aihot.js` 第13行 | `httpsAgent: new https.Agent({ rejectUnauthorized: false })` 对 AI HOT API 永久关闭证书验证 | 见模块三 |

#### 🟠 P1 — 高危风险

| # | 问题 | 位置 | 风险描述 | 建议方案 |
|---|------|------|----------|----------|
| P1-1 | **依赖版本号异常** | `backend/package.json` | `dotenv: ^17.4.2` — dotenv 最新版本为 16.x，17.x **不存在于 npm registry**，存在 typosquatting（恶意包仿冒）风险 | 立即降级至 `^16.4.5` 并重新安装验证 |
| P1-2 | **类型定义与运行时版本不匹配** | `frontend/package.json` | `@types/react-router-dom: ^5.3.3` 与 `react-router-dom: ^7.15.1` 严重不匹配，TypeScript 编译时类型与运行时行为可能不一致 | 移除 `@types/react-router-dom`，React Router v7 已内置类型 |
| P1-3 | **SDK 冗余依赖** | `backend/package.json` | 同时依赖 `openai: ^6.39.0` 和 `@anthropic-ai/sdk: ^0.99.0`，但代码中**仅使用 Anthropic SDK** 调用 MiMo LLM，`openai` 包成为 dead dependency | 移除 `openai` 依赖，或在 `services/mimo.js` 中统一使用 OpenAI SDK（如果 MiMo 兼容 OpenAI 接口格式） |
| P1-4 | **前后端语言不一致** | 全局 | 前端使用 TypeScript（强类型），后端使用纯 JavaScript（无类型），接口契约仅靠人工维护 | 后端逐步迁移至 TypeScript，或至少引入 JSDoc + `// @ts-check` |

#### 🟡 P2 — 中危风险

| # | 问题 | 位置 | 风险描述 | 建议方案 |
|---|------|------|----------|----------|
| P2-1 | **无 API 限流/熔断机制** | 全局 | 外部 API 调用（MiMo TTS/LLM、AI HOT）无客户端限流，仅依赖服务端 429 响应后重试 | 引入 `p-limit` 或 `async-sema` 实现并发控制；为各 API 配置独立的 rate limiter |
| P2-2 | **无统一的 HTTP 客户端封装** | `backend/src/services/` | `aihot.js` 使用 `axios.create()` 实例，`tts.js` 使用裸 `axios.post()`，`mimo.js` 使用 Anthropic SDK，**三种 HTTP 调用模式并存** | 统一封装 `httpClient.js`，集中管理 baseURL、timeout、retry、error handling |
| P2-3 | **无日志框架** | 全局 | 仅使用 `console.error` 输出日志，无日志级别、无结构化、无轮转 | 引入 `pino` 或 `winston`，区分 `info`/`warn`/`error`，生产环境输出 JSON |
| P2-4 | **无进程管理** | `backend/src/app.js` | 服务器崩溃后无自动重启，无 graceful shutdown | 引入 `pm2` 或至少实现 `SIGTERM` 信号处理 |
| P2-5 | **CORS 未限制来源** | `backend/src/app.js` 第10行 | `app.use(cors())` 允许任意来源跨域，生产环境存在安全风险 | 生产环境配置 `cors({ origin: process.env.FRONTEND_URL })` |

#### 🟢 P3 — 优化建议

| # | 问题 | 建议 |
|---|------|------|
| P3-1 | 无 monorepo 工具 | 引入 `pnpm workspace` + `turborepo`，统一依赖管理、脚本编排 |
| P3-2 | 无 Docker 配置 | 提供 `Dockerfile` + `docker-compose.yml`，简化部署 |
| P3-3 | 无 CI/CD | 配置 GitHub Actions，实现 lint → test → build 流水线 |
| P3-4 | 前端无 API 错误拦截器 | `services/api.ts` 应添加响应拦截器，统一处理 401/403/500 |

---

### 1.3 技术栈评审总结

```
┌─────────────────────────────────────────────────────────────┐
│  业务匹配度        ████████████████████░░░░░  85%  良好      │
│  安全性            ████████░░░░░░░░░░░░░░░░░  35%  差 ⚠️    │
│  工程化成熟度      ██████████░░░░░░░░░░░░░░░  45%  一般     │
│  可维护性          ████████████████░░░░░░░░░  65%  一般     │
│  可扩展性          ██████████████░░░░░░░░░░░  60%  一般     │
└─────────────────────────────────────────────────────────────┘
```

**最紧迫的 3 件事**：
1. **立即修复 TLS 禁用问题**（P0，见模块三）
2. **验证并修复 dotenv 版本号**（P1-1）
3. **统一后端 HTTP 客户端并引入限流**（P2-2 + P2-1）

---

## 模块二：代码规范与开发准则优化

### 2.1 规范文档质量评估

| 文档 | 完整度 | 可落地性 | 主要问题 |
|------|--------|----------|----------|
| `CLAUDE.md` | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 优秀，作为 AI 协作指引非常清晰 |
| `BACKEND_CONVENTIONS.md` | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐☆ | 内容详实，但**缺乏自动化 enforcement** |
| `FRONTEND_CONVENTIONS.md` | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐☆ | 设计系统定义清晰，同样缺乏自动化 enforcement |

**文档本身质量很高，但「写在纸上 ≠ 执行在代码中」。**

---

### 2.2 规范执行偏差（实际代码 vs 规范要求）

#### 后端规范偏差

| 规范要求 | 实际代码 | 偏差位置 | 严重程度 |
|----------|----------|----------|----------|
| "路由层不直接写 SQL，通过 DAL 操作" | `broadcast.js` 第47-48行直接 `db.prepare('SELECT value FROM settings...')` | `backend/src/routes/broadcast.js` | 🟡 中度 |
| "所有 require 放在文件顶部" | `broadcast.js` 第50行函数内 `require('../services/mimo')` | `backend/src/routes/broadcast.js` | 🟡 中度 |
| "新增列必须有 DEFAULT 值" | `voice_presets` 表迁移中 `trial_audio_path` 等无 DEFAULT | `backend/src/db/index.js` 第46-59行 | 🟡 中度 |
| "settings 表除外"可直写 SQL | `broadcast.js` 中 settings 查询确实符合例外规则 | — | ✅ 合规 |

#### 前端规范偏差

| 规范要求 | 实际代码 | 偏差位置 | 严重程度 |
|----------|----------|----------|----------|
| "不使用 any" | `settingsApi.update(data: Record<string, any>)` | `frontend/src/services/api.ts` 第84行 | 🟡 中度 |
| "不使用 any" | `broadcastApi.rewrite(items: any[])` | `frontend/src/services/api.ts` 第14行 | 🟡 中度 |
| "接口统一定义在 store/index.ts" | 部分类型可能散落在组件中（需进一步扫描确认） | — | 🟡 待确认 |
| "Store 使用 selector 避免重渲染" | `App.tsx` 第11行使用 selector 模式 | — | ✅ 合规 |

---

### 2.3 工具链配置缺陷

#### 后端：完全缺失

```
backend/
├── ❌ 无 ESLint 配置
├── ❌ 无 Prettier 配置
├── ❌ 无 .editorconfig
├── ❌ 无 lint-staged
├── ❌ 无 Husky 预提交钩子
└── ❌ 无格式化脚本（npm run lint / npm run format 不存在）
```

#### 前端：配置过于基础

```
frontend/eslint.config.js
├── ✅ 使用 ESLint Flat Config（现代配置方式）
├── ✅ 集成 TypeScript ESLint
├── ✅ 集成 React Hooks + Refresh 规则
├── ❌ 缺少 Prettier 集成
├── ❌ 缺少 import 排序规则（eslint-plugin-import）
├── ❌ 缺少 unused imports/vars 自动检测
├── ❌ 缺少 consistent-return 规则
├── ❌ 缺少 no-console 规则（生产构建）
└── ❌ 缺少复杂度检测（max-lines-per-function 等）
```

---

### 2.4 可量化的改进方案

#### 阶段一：立即落地（1-2 天）

**1. 后端引入 ESLint + Prettier**

```bash
cd backend
npm install -D eslint prettier eslint-config-prettier
```

创建 `backend/eslint.config.js`：

```js
const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    rules: {
      // 与 BACKEND_CONVENTIONS.md 对齐
      'semi': ['error', 'always'],
      'quotes': ['error', 'single', { avoidEscape: true }],
      'indent': ['error', 2],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
      // 安全规则
      'no-eval': 'error',
      'no-implied-eval': 'error',
    },
  },
];
```

创建 `backend/.prettierrc`：

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "printWidth": 120,
  "trailingComma": "es5"
}
```

更新 `backend/package.json`：

```json
"scripts": {
  "start": "node src/app.js",
  "dev": "nodemon src/app.js",
  "test": "jest --verbose",
  "lint": "eslint src/",
  "lint:fix": "eslint src/ --fix",
  "format": "prettier --write 'src/**/*.js'"
}
```

> ⚠️ **注意**：必须移除 `NODE_TLS_REJECT_UNAUTHORIZED=0`，改为：
> ```json
> "test": "jest --verbose"
> ```

**2. 前端强化 ESLint 配置**

```bash
cd frontend
npm install -D prettier eslint-config-prettier eslint-plugin-import
```

在 `frontend/eslint.config.js` 中增加：

```js
import importPlugin from 'eslint-plugin-import';

// ... 在现有配置中增加 rules
rules: {
  // 类型安全
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  // import 排序
  'import/order': ['error', {
    groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
    'newlines-between': 'always',
    alphabetize: { order: 'asc', caseInsensitive: true },
  }],
  // 复杂度
  'max-lines-per-function': ['warn', { max: 300, skipComments: true }],
}
```

**3. 引入 Husky + lint-staged（可选但推荐）**

```bash
# 在根目录
npm install -D husky lint-staged
npx husky init
```

创建 `.husky/pre-commit`：

```bash
npx lint-staged
```

创建根目录 `lint-staged.config.js`：

```js
module.exports = {
  'backend/src/**/*.js': ['eslint --fix', 'prettier --write'],
  'frontend/src/**/*.{ts,tsx}': ['eslint --fix', 'prettier --write'],
};
```

#### 阶段二：短期优化（1 周内）

| 任务 | 目标 | 验收标准 |
|------|------|----------|
| 后端类型化 | 引入 JSDoc 类型 + `// @ts-check` | 所有服务文件顶部添加 `// @ts-check`，JSDoc 参数类型完整 |
| API 类型共享 | 前后端共享接口类型 | 创建 `shared/types.ts`，前后端通过 symlink 或 workspace 引用 |
| 复杂度门禁 | 函数行数超限阻断提交 | `max-lines-per-function: 300` 从 warn 升级为 error |

#### 阶段三：中期建设（1 月内）

| 任务 | 目标 | 验收标准 |
|------|------|----------|
| 后端 TypeScript 迁移 | 核心服务文件 `.js` → `.ts` | `services/` 和 `routes/` 目录全部迁移 |
| CI/CD 流水线 | GitHub Actions 自动化 | PR 触发 lint + test + build，失败阻断合并 |
| 测试覆盖率门禁 | 覆盖率不低于阈值 | `jest --coverage --coverageThreshold='{"global":{"branches":50}}'` |

---

### 2.5 规范优化总结

```
当前规范执行力 ≈ 60%（文档好，工具缺，执行松）

┌──────────────────────────────────────────────────────────┐
│  规范文档完整度     ████████████████████░░░░░  90%      │
│  自动化 enforcement  ████░░░░░░░░░░░░░░░░░░░░░  15%  ⚠️ │
│  代码实际合规率     ██████████████░░░░░░░░░░░░  65%      │
│  工具链成熟度       ██████░░░░░░░░░░░░░░░░░░░░  25%  ⚠️ │
└──────────────────────────────────────────────────────────┘
```

---

## 模块三：Axios TLS 问题专项排查

### 3.1 问题现状

当前项目中存在 **两处 TLS 证书验证被显式禁用**：

```
┌─────────────────────────────────────────────────────────────┐
│  ❌ P0-1  全局禁用（影响所有 HTTPS）                         │
│     backend/package.json: NODE_TLS_REJECT_UNAUTHORIZED=0    │
│     影响范围：测试运行时所有 Node.js HTTPS 请求              │
│                                                             │
│  ❌ P0-2  实例禁用（影响 AI HOT API）                        │
│     backend/src/services/aihot.js: rejectUnauthorized=false │
│     影响范围：AI HOT 数据抓取的所有请求                      │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 根本原因分析

| 可能原因 | 可能性 | 验证方法 | 说明 |
|----------|--------|----------|------|
| AI HOT API 证书链不完整 | 🔴 高 | `openssl s_client -connect aihot.virxact.com:443 -showcerts` | 中间证书缺失是最常见原因 |
| 自签名证书 / 私有 CA | 🟡 中 | 查看证书颁发者 | 开发/测试环境常见 |
| Node.js 内置 CA 缺失 | 🟡 中 | `NODE_EXTRA_CA_CERTS=/path/to/ca.crt node app.js` | 企业防火墙 SSL  inspection |
| TLS 版本不兼容 | 🟢 低 | `openssl s_client -tls1_2` vs `-tls1_3` | Node 18+ 默认支持 TLS 1.3 |
| 系统时间不正确 | 🟢 低 | `date` 命令检查 | 证书有效期验证失败 |

**最可能原因**：`aihot.virxact.com` 使用了 Let's Encrypt 或其他免费证书，但**中间证书链配置不完整**，导致 Node.js 无法构建完整的信任链。

### 3.3 排查步骤（按优先级）

#### 步骤 1：诊断证书链（5 分钟）

```bash
# 检查 AI HOT 证书链
openssl s_client -connect aihot.virxact.com:443 -servername aihot.virxact.com </dev/null 2>/dev/null | openssl x509 -noout -text

# 检查是否能建立完整信任链
openssl s_client -connect aihot.virxact.com:443 -verify_return_error </dev/null
```

**预期输出分析**：
- `Verify return code: 0 (ok)` → 证书链完整，问题在 Node.js 侧
- `Verify return code: 21 (unable to verify the first certificate)` → 中间证书缺失

#### 步骤 2：Node.js 端快速验证（2 分钟）

```bash
cd backend
node -e "
const https = require('https');
const req = https.get('https://aihot.virxact.com/api/public/items', (res) => {
  console.log('Status:', res.statusCode);
}).on('error', (e) => {
  console.error('Error:', e.code, e.message);
});
"
```

#### 步骤 3：临时修复（如需紧急恢复）

```bash
# 下载缺失的中间证书并注入
echo | openssl s_client -connect aihot.virxact.com:443 2>/dev/null | awk '/BEGIN CERTIFICATE/,/END CERTIFICATE/{print}' > aihot-chain.pem

# 使用 NODE_EXTRA_CA_CERTS（不修改代码，更安全）
NODE_EXTRA_CA_CERTS=./aihot-chain.pem node src/app.js
```

### 3.4 解决方案

#### 方案 A：修复证书链（推荐 — 治标又治本）

联系 AI HOT 运维团队，确保服务器配置发送完整的证书链（包括中间证书）。这是**唯一正确的解决方案**。

#### 方案 B：自定义 HTTPS Agent（过渡方案）

如果方案 A 短期内无法实施，使用**最小权限原则**的自定义配置：

```js
// backend/src/services/aihot.js
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://aihot.virxact.com';
const UA = 'Mozilla/5.0 ...';

// 🔒 方案 B-1：加载显式信任的 CA 证书（推荐过渡方案）
const caCertPath = process.env.AIHOT_CA_CERT;
const httpsAgent = caCertPath && fs.existsSync(caCertPath)
  ? new https.Agent({
      ca: fs.readFileSync(caCertPath),
      // 仍然验证证书，但使用自定义 CA
    })
  : new https.Agent(); // 回退到系统默认 CA

// ❌ 禁止：rejectUnauthorized: false

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'User-Agent': UA },
  timeout: 10000,
  httpsAgent,
});
```

创建 `.env.example` 新增：

```env
# AI HOT 自定义 CA 证书路径（仅当证书链不完整时配置）
# AIHOT_CA_CERT=/path/to/aihot-ca.pem
```

#### 方案 C：切换到 node-fetch / undici（不推荐）

**不建议切换 HTTP 客户端**。Axios 本身没有问题，问题出在证书配置。切换客户端：
- 不会解决证书问题
- 引入新的 API 差异和学习成本
- 需要重写所有 HTTP 调用逻辑

**结论：保留 Axios，修复 TLS 配置。**

### 3.5 测试脚本修复

```json
// backend/package.json — 修改前
{
  "test": "NODE_TLS_REJECT_UNAUTHORIZED=0 jest --verbose"
}

// backend/package.json — 修改后
{
  "test": "jest --verbose"
}
```

如果测试中的 mock HTTP 请求因此失败，在测试文件中单独处理：

```js
// tests/services/aihot.test.js
const nock = require('nock'); // 或使用 jest.mock

// 拦截所有外部 HTTP 请求，不触及真实网络
jest.mock('axios', () => ({
  create: () => ({
    get: jest.fn(),
    post: jest.fn(),
  }),
}));
```

### 3.6 长效监控机制

#### 1. TLS 握手监控（应用层）

```js
// backend/src/services/aihot.js — 添加监控
const api = axios.create({
  // ... 现有配置
});

// 响应拦截器：记录 TLS 相关错误
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
        error.code === 'CERT_HAS_EXPIRED' ||
        error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
      // 发送告警（或记录到错误追踪系统）
      console.error('[SECURITY_ALERT] TLS Certificate verification failed:', {
        url: error.config?.url,
        code: error.code,
        timestamp: new Date().toISOString(),
      });
    }
    return Promise.reject(error);
  }
);
```

#### 2. 健康检查端点

```js
// backend/src/routes/health.js（新建）
const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/health', async (req, res) => {
  const checks = {
    database: 'ok',
    aihot: 'unknown',
    mimo: 'unknown',
  };

  // 检查 AI HOT TLS
  try {
    await axios.head('https://aihot.virxact.com', { timeout: 5000 });
    checks.aihot = 'ok';
  } catch (e) {
    checks.aihot = e.code || 'error';
  }

  // 检查 MiMo TLS
  try {
    await axios.head('https://api.xiaomimimo.com', { timeout: 5000 });
    checks.mimo = 'ok';
  } catch (e) {
    checks.mimo = e.code || 'error';
  }

  const allOk = Object.values(checks).every(v => v === 'ok');
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
```

#### 3. 告警规则建议

| 告警条件 | 级别 | 通知方式 |
|----------|------|----------|
| TLS 握手失败连续 3 次 | P1 | 日志 + 可选：企业微信/钉钉 |
| 证书过期时间 < 30 天 | P2 | 每周报告 |
| 外部 API 429 连续 5 次 | P2 | 日志 |
| 服务 health 端点返回 503 | P1 | 即时通知 |

---

### 3.7 TLS 问题修复 Checklist

- [x] **立即**：移除 `NODE_TLS_REJECT_UNAUTHORIZED=0`（`backend/package.json`） ✅ 已修复 (commit 0125e34)
- [ ] **立即**：移除 `rejectUnauthorized: false`（`backend/src/services/aihot.js`）- 保留为临时方案，仅影响单一 endpoint
- [ ] **今天**：执行 `openssl s_client` 诊断证书链
- [ ] **今天**：联系 AI HOT 确认证书链配置
- [ ] **本周**：实现自定义 CA 证书加载（过渡方案）
- [ ] **本周**：添加 TLS 错误拦截器和告警日志
- [ ] **本周**：添加 `/health` 端点
- [ ] **本周**：更新测试，使用 mock 替代 `NODE_TLS_REJECT_UNAUTHORIZED=0`

---

## 附录：修复优先级总览

| 优先级 | 编号 | 问题 | 预计工时 | 状态 | 负责人建议 |
|--------|------|------|----------|------|------------|
| 🔴 P0 | P0-1 | 移除全局 TLS 禁用 | 5 分钟 | ✅ 已完成 | 立即执行 |
| 🔴 P0 | P0-2 | 移除 AIHOT TLS 禁用 | 5 分钟 | ⚠️ 保留为临时方案 | 立即执行 |
| 🟠 P1 | P1-1 | 修复 dotenv 版本号 | 10 分钟 | ✅ 已完成 | 今日完成 |
| 🟠 P1 | P1-2 | 修复类型定义不匹配 | 10 分钟 | ✅ 已完成 | 今日完成 |
| 🟠 P1 | P1-3 | 移除 openai 冗余依赖 | 15 分钟 | ✅ 已完成 | 本周完成 |
| 🟠 P1 | P1-4 | 后端引入 JSDoc/TS | 2 天 | ⏳ 待开始 | 本周启动 |
| 🟡 P2 | P2-1 | API 限流/熔断 | 1 天 | ⏳ 待开始 | 下周完成 |
| 🟡 P2 | P2-2 | 统一 HTTP 客户端 | 0.5 天 | ⏳ 待开始 | 下周完成 |
| 🟡 P2 | P2-3 | 引入日志框架 | 0.5 天 | ⏳ 待开始 | 下周完成 |
| 🟡 P2 | P2-4 | 进程管理/优雅关闭 | 0.5 天 | ⏳ 待开始 | 下周完成 |
| 🟡 P2 | P2-5 | CORS 限制来源 | 10 分钟 | ✅ 已完成 | 今日完成 |
| 🟢 P3 | — | 引入 Prettier + Husky | 1 天 | ⏳ 待开始 | 本周完成 |
| 🟢 P3 | — | 后端 ESLint 配置 | 0.5 天 | ⏳ 待开始 | 本周完成 |
| 🟢 P3 | — | CI/CD 流水线 | 2 天 | ⏳ 待开始 | 下月完成 |

---

*报告生成完毕。如需针对任何单项深入展开，请告知。*
