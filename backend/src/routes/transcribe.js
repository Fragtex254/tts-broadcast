const express = require('express');
const multer = require('multer');
const asr = require('../services/asr');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

/**
 * POST /api/transcribe
 * 上传音频或视频并转录为文本
 */
router.post('/', upload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传需要转录的音频或视频文件' });
    }

    const result = await asr.transcribeMedia({
      file: req.file,
      language: req.body.language || 'auto'
    });

    res.json(result);
  } catch (error) {
    console.error('转录失败:', error);
    res.status(500).json({ error: error.message || '转录失败' });
  }
});

module.exports = router;
