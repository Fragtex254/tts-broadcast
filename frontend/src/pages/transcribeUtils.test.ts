import { describe, expect, test } from 'vitest';
import {
  formatBytes,
  formatDuration,
  formatTimestamp,
  getErrorMessage,
  getRelativePath,
  isSupportedMedia,
  relativePathToTxtName,
  relativePathToZipEntry,
  sanitizeFileName,
  stripExtension,
} from './transcribeUtils';

describe('transcribeUtils', () => {
  test('isSupportedMedia 只接受支持的音视频扩展名', () => {
    expect(isSupportedMedia(new File(['x'], 'audio.MP3'))).toBe(true);
    expect(isSupportedMedia(new File(['x'], 'video.mov'))).toBe(true);
    expect(isSupportedMedia(new File(['x'], 'notes.txt'))).toBe(false);
  });

  test('getRelativePath 优先使用文件夹上传路径', () => {
    const file = new File(['x'], 'clip.mp3');
    Object.defineProperty(file, 'webkitRelativePath', {
      value: 'folder/clip.mp3',
      configurable: true,
    });

    expect(getRelativePath(file)).toBe('folder/clip.mp3');
  });

  test('getErrorMessage 优先返回后端错误文案', () => {
    expect(getErrorMessage({ response: { data: { error: '后端失败' } } })).toBe('后端失败');
    expect(getErrorMessage(new Error('本地失败'))).toBe('本地失败');
    expect(getErrorMessage(null)).toBe('转录失败，请稍后重试');
  });

  test('格式化文件大小和时长', () => {
    expect(formatBytes(42)).toBe('42 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
    expect(formatDuration(45)).toBe('45 秒');
    expect(formatDuration(125)).toBe('2 分 5 秒');
    expect(formatDuration(3660)).toBe('1 小时 1 分');
  });

  test('文件名和路径转换保持可下载', () => {
    expect(sanitizeFileName(' a/b:c?.mp3 ')).toBe('a_b_c_.mp3');
    expect(sanitizeFileName('   ')).toBe('转录结果');
    expect(stripExtension('folder/audio.name.mp3')).toBe('folder/audio.name');
    expect(relativePathToTxtName('folder/audio.mp3')).toBe('folder_audio.txt');
    expect(relativePathToZipEntry('folder/audio.mp3')).toBe('folder/audio.txt');
  });

  test('formatTimestamp 输出稳定时间戳', () => {
    expect(formatTimestamp(new Date(2026, 6, 9, 8, 5))).toBe('20260709_0805');
  });
});
