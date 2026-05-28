const aihot = require('../../src/services/aihot');

describe('AI HOT 服务', () => {
  test('获取精选资讯', async () => {
    const items = await aihot.getSelectedItems({ take: 10 });
    expect(Array.isArray(items)).toBe(true);
    if (items.length > 0) {
      expect(items[0]).toHaveProperty('title');
      expect(items[0]).toHaveProperty('url');
      expect(items[0]).toHaveProperty('source');
    }
  });

  test('按分类获取资讯', async () => {
    const items = await aihot.getSelectedItems({
      category: 'ai-models',
      take: 5
    });
    expect(Array.isArray(items)).toBe(true);
  });

  test('关键词搜索', async () => {
    const items = await aihot.searchItems({ q: 'OpenAI', take: 5 });
    expect(Array.isArray(items)).toBe(true);
  });

  test('获取最新日报', async () => {
    const daily = await aihot.getDaily();
    expect(daily).toHaveProperty('date');
  });

  test('获取日报归档', async () => {
    const items = await aihot.getDailyArchive(5);
    expect(Array.isArray(items)).toBe(true);
  });
});
