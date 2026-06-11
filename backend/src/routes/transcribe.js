const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const asr = require('../services/asr');
const sseManager = require('../services/sseManager');

const router = express.Router();
const TRANSCRIBE_UPLOAD_LIMIT_BYTES = Number(process.env.TRANSCRIBE_UPLOAD_LIMIT_BYTES || 500 * 1024 * 1024);
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

function cleanUploadedFile(file) {
  if (file && file.path) {
    fs.rmSync(file.path, { force: true });
  }
}

function handleUploadError(error, res) {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: '上传文件过大，请压缩音频或上传 500MB 以内的文件' });
  }

  console.error('转录上传失败:', error);
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

      if (taskId) {
        sseManager.send(taskId, 'transcribe-start', {
          phase: 'preparing',
          percent: 0,
          text: '',
          fileName: req.file.originalname,
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
      console.error('转录失败:', error);
      const taskId = buildTaskId(req);
      if (taskId) {
        sseManager.sendError(taskId, error.message || '转录失败');
      }
      res.status(500).json({ error: error.message || '转录失败' });
    } finally {
      cleanUploadedFile(req.file);
    }
  });
});

module.exports = router;
