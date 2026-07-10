import { describe, expect, test } from 'vitest';
import {
  formatBytes,
  formatDuration,
  formatAsrSource,
  formatTimestamp,
  getErrorMessage,
  getRelativePath,
  isSupportedMedia,
  preferredTranscriptionText,
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

  test('ASR 来源按位置和引擎展示，不把 MOSS 当作独立服务', () => {
    expect(formatAsrSource({ provider: 'wsl_asr', engine: 'moss' })).toBe('WSL 局域网 · MOSS');
    expect(formatAsrSource({ provider: 'wsl_asr', engine: 'qwen' })).toBe('WSL 局域网 · Qwen3-ASR');
    expect(formatAsrSource({ provider: 'mimo', engine: '' })).toBe('MiMo 云端');
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

  test('转录文稿优先使用已排版文本', () => {
    const record = {
      id: 1,
      file_name: 'demo.mp3',
      relative_path: 'demo.mp3',
      text: ' 原始文本 ',
      formatted_text: ' 排版文本 ',
      language: 'auto',
      provider: 'mimo',
      engine: '',
      model: 'mimo-v2.5-asr',
      context: '',
      task_id: 'task-1',
      file_size_bytes: 0,
      audio_duration_seconds: 0,
      processing_seconds: 0,
      created_at: '2026-07-10T00:00:00.000Z',
      updated_at: '2026-07-10T00:00:00.000Z',
    } satisfies Parameters<typeof preferredTranscriptionText>[0];
    expect(preferredTranscriptionText(record)).toBe('排版文本');
    expect(preferredTranscriptionText({ ...record, formatted_text: '  ' })).toBe('原始文本');
  });
});
