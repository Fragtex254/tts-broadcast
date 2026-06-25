const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const asr = require('../services/asr');
const sseManager = require('../services/sseManager');
const { createScopedLogger } = require('../services/logger');

const router = express.Router();
const logger = createScopedLogger('transcribe-route');
const TRANSCRIBE_UPLOAD_LIMIT_BYTES = Number(process.env.TRANSCRIBE_UPLOAD_LIMIT_BYTES || 500 * 1024 * 1024);
const BATCH_MAX_FILES = Number(process.env.TRANSCRIBE_BATCH_MAX_FILES || 50);
const uploadDir = path.join(os.tmpdir(), 'tts-broadcast-transcribe');

fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const safeExt = path.extname(file.originalname || '').toLowerCase() || '.bin';
      cb(null, `upload_${Date.now()}_${Math.random().toString(16).slice(2)}${safeExt}`);
    }
  }),
  limits: { fileSize: TRANSCRIBE_UPLOAD_LIMIT_BYTES }
});

/**
 * multer/busboy 默认用 latin1 解码 multipart 的 filename，导致中文文件名乱码。
 * 将 originalname 从 latin1 重新解码为 utf8 恢复中文。
 */
function decodeFileName(originalname) {
  if (!originalname) return '';
  try {
    return Buffer.from(originalname, 'latin1').toString('utf8');
  } catch {
    return originalname;
  }
}

function cleanUploadedFile(file) {
  if (file && file.path) {
    fs.rmSync(file.path, { force: true });
  }
}

function cleanUploadedFiles(files) {
  if (Array.isArray(files)) {
    files.forEach(cleanUploadedFile);
  }
}

function handleUploadError(error, res) {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: '上传文件过大，请压缩音频或上传 500MB 以内的文件' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: `批量转录文件数超过上限（${BATCH_MAX_FILES} 个），请减少文件数量` });
    }
  }

  logger.error({ err: error }, '转录上传失败');
  return res.status(500).json({ error: error.message || '上传失败' });
}

function buildTaskId(req) {
  const taskId = req.body.taskId;
  return typeof taskId === 'string' && taskId.trim() ? taskId.trim() : null;
}

/**
 * POST /api/transcribe
 * 上传音频或视频并转录为文本
 */
router.post('/', (req, res) => {
  upload.single('media')(req, res, async (uploadError) => {
    if (uploadError) {
      cleanUploadedFile(req.file);
      handleUploadError(uploadError, res);
      return;
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: '请上传需要转录的音频或视频文件' });
      }

      const taskId = buildTaskId(req);
      const fileName = decodeFileName(req.file.originalname);

      if (taskId) {
        sseManager.send(taskId, 'transcribe-start', {
          phase: 'preparing',
          percent: 0,
          text: '',
          fileName,
          timestamp: Date.now()
        });
      }

      const result = await asr.transcribeMedia({
        file: req.file,
        language: req.body.language || 'auto',
        onProgress: taskId
          ? (progress) => sseManager.sendProgress(taskId, { ...progress, timestamp: Date.now() })
          : undefined
      });

      if (taskId) {
        sseManager.sendComplete(taskId, {
          phase: 'completed',
          percent: 100,
          text: result.text,
          usage: result.usage,
          timestamp: Date.now()
        });
      }

      res.json(result);
    } catch (error) {
      const taskId = buildTaskId(req);
      logger.error({ err: error, hasTaskId: Boolean(taskId) }, '转录失败');
      if (taskId) {
        sseManager.sendError(taskId, error.message || '转录失败');
      }
      res.status(500).json({ error: error.message || '转录失败' });
    } finally {
      cleanUploadedFile(req.file);
    }
  });
});

function parseRelativePaths(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => (typeof item === 'string' ? item : '')).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * 等待 SSE 客户端连接建立，避免后台任务开始时早期事件丢失。
 * 没传 taskId 或 sseManager 不支持连接计数时跳过。
 */
async function waitForSseConnection(taskId, timeoutMs = 3000) {
  if (!taskId) return false;
  if (typeof sseManager.getTaskConnectionCount !== 'function') return true;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (sseManager.getTaskConnectionCount(taskId) > 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

/**
 * 后台串行转录批量文件，所有进度与最终结果通过 SSE 推送。
 * 单文件失败隔离，不影响其他文件。
 */
async function runBatchTranscription({ files, taskId, language, relativePaths }) {
  const total = files.length;
  const results = [];

  if (taskId) {
    await waitForSseConnection(taskId);
    sseManager.send(taskId, 'progress', {
      phase: 'batch-preparing',
      total,
      current: 0,
      percent: 0,
      timestamp: Date.now()
    });
  }

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const fileName = decodeFileName(file.originalname);
    const relativePath = relativePaths[index] || fileName;

    if (taskId) {
      sseManager.sendProgress(taskId, {
        phase: 'file-start',
        index,
        fileName,
        total,
        percent: Math.round((index / total) * 100),
        timestamp: Date.now()
      });
    }

    try {
      const result = await asr.transcribeMedia({
        file,
        language,
        onProgress: taskId
          ? (progress) => {
              const filePercent = progress.percent ?? 0;
              const overallPercent = Math.round(((index + filePercent / 100) / total) * 100);
              sseManager.sendProgress(taskId, {
                phase: 'file-progress',
                index,
                fileName,
                total,
                filePercent,
                percent: overallPercent,
                current: progress.current,
                chunkText: progress.chunkText,
                text: progress.text,
                timestamp: Date.now()
              });
            }
          : undefined
      });

      results.push({ fileName, relativePath, text: result.text, usage: result.usage });

      if (taskId) {
        sseManager.sendProgress(taskId, {
          phase: 'file-complete',
          index,
          fileName,
          total,
          text: result.text,
          usage: result.usage,
          percent: Math.round(((index + 1) / total) * 100),
          timestamp: Date.now()
        });
      }
    } catch (error) {
      logger.error({ err: error, index, fileNameLength: fileName.length }, '批量转录单文件失败');
      results.push({ fileName, relativePath, text: '', usage: null, error: error.message || '转录失败' });

      if (taskId) {
        sseManager.sendProgress(taskId, {
          phase: 'file-error',
          index,
          fileName,
          total,
          error: error.message || '转录失败',
          percent: Math.round(((index + 1) / total) * 100),
          timestamp: Date.now()
        });
      }
    } finally {
      cleanUploadedFile(file);
    }
  }

  const succeeded = results.filter((r) => !r.error).length;
  const failed = total - succeeded;

  if (taskId) {
    sseManager.sendComplete(taskId, {
      phase: 'completed',
      percent: 100,
      results,
      total,
      succeeded,
      failed,
      timestamp: Date.now()
    });
  }
}

/**
 * POST /api/transcribe/batch
 * 批量上传音视频文件并逐个转录为文本。
 * 立即返回 202（任务已受理），实际转录在后台串行进行（遵守 MiMo RPM 限流），
 * 单文件失败不影响其他文件；进度与最终结果全部通过 SSE 推送，避免长任务触发 HTTP 超时。
 */
router.post('/batch', (req, res) => {
  upload.array('media', BATCH_MAX_FILES)(req, res, async (uploadError) => {
    if (uploadError) {
      cleanUploadedFiles(req.files);
      handleUploadError(uploadError, res);
      return;
    }

    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ error: '请至少上传一个音频或视频文件' });
    }

    const taskId = buildTaskId(req);
    const language = req.body.language || 'auto';
    const relativePaths = parseRelativePaths(req.body.relativePaths);
    const total = files.length;

    // 立即返回任务受理，转录在后台异步进行，结果通过 SSE 推送
    res.status(202).json({ taskId, total, accepted: true });

    runBatchTranscription({ files, taskId, language, relativePaths }).catch((error) => {
      logger.error({ err: error, hasTaskId: Boolean(taskId) }, '批量转录后台任务异常');
      cleanUploadedFiles(files);
      if (taskId) {
        sseManager.sendError(taskId, error.message || '批量转录失败');
      }
    });
  });
});

module.exports = router;
