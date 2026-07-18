// backend/tests/utils/validation.test.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
  validateId,
  cleanAudioFile,
  cleanAssetFile,
  resolveAudioFilePath,
  audioDir,
  assetDir,
} = require('../../src/utils/validation');

describe('validation 工具', () => {
  describe('validateId', () => {
    test('有效正整数返回 { valid: true, id }', () => {
      const result = validateId('42');
      expect(result).toEqual({ valid: true, id: 42 });
    });

    test('自定义 label 出现在错误消息中', () => {
      const result = validateId('abc', '播报 ID');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('无效的播报 ID');
    });

    test('默认 label 为 ID', () => {
      const result = validateId('-1');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('无效的ID');
    });

    test('零返回无效', () => {
      expect(validateId('0').valid).toBe(false);
    });

    test('负数返回无效', () => {
      expect(validateId('-5').valid).toBe(false);
    });

    test('浮点数截断后有效', () => {
      const result = validateId('3.7');
      expect(result).toEqual({ valid: true, id: 3 });
    });

    test('空字符串返回无效', () => {
      expect(validateId('').valid).toBe(false);
    });

    test('非数字字符串返回无效', () => {
      expect(validateId('hello').valid).toBe(false);
    });
  });

  describe('cleanAudioFile', () => {
    const testFiles = [];

    beforeEach(() => {
      fs.mkdirSync(audioDir, { recursive: true });
    });

    afterEach(() => {
      // 清理测试创建的文件
      for (const fp of testFiles) {
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
      testFiles.length = 0;
    });

    test('删除存在的绝对路径文件（audioDir 内）', () => {
      const fp = path.join(audioDir, `_test_${Date.now()}.wav`);
      fs.writeFileSync(fp, 'data');
      testFiles.push(fp);
      expect(fs.existsSync(fp)).toBe(true);
      cleanAudioFile(fp);
      expect(fs.existsSync(fp)).toBe(false);
    });

    test('通过 /audio/ 前缀删除文件', () => {
      const filename = `_test_prefix_${Date.now()}.wav`;
      const fp = path.join(audioDir, filename);
      fs.writeFileSync(fp, 'data');
      testFiles.push(fp);
      expect(fs.existsSync(fp)).toBe(true);
      cleanAudioFile(`/audio/${filename}`);
      expect(fs.existsSync(fp)).toBe(false);
    });

    test('不删除 audioDir 外的文件（路径安全）', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-safe-'));
      const fp = path.join(tmpDir, 'outside.wav');
      fs.writeFileSync(fp, 'data');
      cleanAudioFile(fp);
      // 文件不应被删除（在 audioDir 外）
      expect(fs.existsSync(fp)).toBe(true);
      fs.unlinkSync(fp);
      fs.rmdirSync(tmpDir);
    });

    test('文件不存在时静默跳过', () => {
      expect(() => cleanAudioFile('/nonexistent/path.wav')).not.toThrow();
    });

    test('路径为空时静默跳过', () => {
      expect(() => cleanAudioFile(null)).not.toThrow();
      expect(() => cleanAudioFile(undefined)).not.toThrow();
      expect(() => cleanAudioFile('')).not.toThrow();
    });
  });

  describe('audioDir', () => {
    test('导出为字符串路径', () => {
      expect(typeof audioDir).toBe('string');
      expect(audioDir).toContain('audio');
    });

    test('测试环境使用隔离音频目录，不触碰真实 audio 资产', () => {
      expect(audioDir).toContain('.test-audio');
    });

    test('把公开 /audio/ 路径解析到当前环境的隔离目录', () => {
      expect(resolveAudioFilePath('/audio/example.wav')).toBe(path.join(audioDir, 'example.wav'));
    });

    test('拒绝越过音频根目录的公开路径', () => {
      expect(() => resolveAudioFilePath('/audio/../outside.wav')).toThrow('音频路径无效');
    });
  });

  describe('cleanAssetFile', () => {
    const testFiles = [];

    beforeEach(() => {
      fs.mkdirSync(assetDir, { recursive: true });
    });

    afterEach(() => {
      for (const fp of testFiles) {
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
      }
      testFiles.length = 0;
    });

    test('通过 /assets/ 前缀删除文件', () => {
      const filename = `_test_asset_${Date.now()}.png`;
      const fp = path.join(assetDir, filename);
      fs.writeFileSync(fp, 'data');
      testFiles.push(fp);

      cleanAssetFile(`/assets/${filename}`);

      expect(fs.existsSync(fp)).toBe(false);
    });

    test('不删除 assetDir 外的文件（路径安全）', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-asset-safe-'));
      const fp = path.join(tmpDir, 'outside.png');
      fs.writeFileSync(fp, 'data');

      cleanAssetFile(fp);

      expect(fs.existsSync(fp)).toBe(true);
      fs.unlinkSync(fp);
      fs.rmdirSync(tmpDir);
    });
  });
});
