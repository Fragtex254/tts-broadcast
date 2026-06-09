// backend/tests/utils/validation.test.js
const path = require('path');
const fs = require('fs');
const os = require('os');
const { validateId, cleanAudioFile, audioDir } = require('../../src/utils/validation');

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
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-audio-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('删除存在的文件', () => {
      const fp = path.join(tmpDir, 'test.wav');
      fs.writeFileSync(fp, 'data');
      expect(fs.existsSync(fp)).toBe(true);
      cleanAudioFile(fp);
      expect(fs.existsSync(fp)).toBe(false);
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
  });
});
