const publishPackage = require('../../src/services/publishPackage');

describe('发布内容包服务', () => {
  test('字幕文本按标点和长度拆分', () => {
    const parts = publishPackage.splitSubtitleText('这是第一句话，这是第二句话，而且这一句话需要继续显示。', 10);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join('')).toBe('这是第一句话，这是第二句话，而且这一句话需要继续显示。');
  });
});
