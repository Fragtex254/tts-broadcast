import { describe, expect, test } from 'vitest';
import { buildBilibiliPlayerUrl, parseBilibiliVideoUrl } from './bilibiliPlayerModel';

describe('Bilibili 外链播放器模型', () => {
  test('解析 BV、多 P 与来源时间参数', () => {
    expect(parseBilibiliVideoUrl('https://www.bilibili.com/video/BV1B7411m7LV?p=3&t=65.8')).toEqual({
      idType: 'bvid',
      id: 'BV1B7411m7LV',
      page: 3,
      initialSeconds: 65,
    });
  });

  test('兼容 av 地址与官方 player 地址', () => {
    expect(parseBilibiliVideoUrl('https://m.bilibili.com/video/av170001')).toMatchObject({ idType: 'aid', id: '170001' });
    expect(parseBilibiliVideoUrl('https://player.bilibili.com/player.html?bvid=BV1B7411m7LV&p=2')).toMatchObject({
      idType: 'bvid', id: 'BV1B7411m7LV', page: 2,
    });
  });

  test('拒绝伪装域名、非视频页与畸形 ID', () => {
    expect(parseBilibiliVideoUrl('https://bilibili.com.evil.example/video/BV1B7411m7LV')).toBeNull();
    expect(parseBilibiliVideoUrl('https://www.bilibili.com/opus/123')).toBeNull();
    expect(parseBilibiliVideoUrl('https://www.bilibili.com/opus/123?aid=170001')).toBeNull();
    expect(parseBilibiliVideoUrl('javascript:alert(1)')).toBeNull();
  });

  test('播放器地址只使用解析后的白名单参数并把时间取整', () => {
    const video = parseBilibiliVideoUrl('https://www.bilibili.com/video/BV1B7411m7LV?p=2');
    expect(video).not.toBeNull();
    if (!video) return;
    const playerUrl = new URL(buildBilibiliPlayerUrl(video, 29.9, true));
    expect(playerUrl.origin + playerUrl.pathname).toBe('https://player.bilibili.com/player.html');
    expect(Object.fromEntries(playerUrl.searchParams)).toEqual({
      bvid: 'BV1B7411m7LV', p: '2', danmaku: '0', autoplay: '1', t: '29',
    });
  });
});
