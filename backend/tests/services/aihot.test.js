jest.mock('axios', () => ({
  create: jest.fn()
}));

const axios = require('axios');

const apiGet = jest.fn();
axios.create.mockReturnValue({ get: apiGet });

const aihot = require('../../src/services/aihot');

describe('AI HOT 服务', () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  test('获取精选资讯', async () => {
    const selectedItems = [
      {
        title: 'OpenAI 发布新模型',
        url: 'https://example.com/openai',
        source: 'AI HOT'
      }
    ];
    apiGet.mockResolvedValue({ data: { items: selectedItems } });

    const items = await aihot.getSelectedItems({ take: 10 });

    expect(items).toEqual(selectedItems);
    expect(apiGet).toHaveBeenCalledWith('/api/public/items', {
      params: { mode: 'selected', take: 10 }
    });
  });

  test('按分类获取资讯', async () => {
    apiGet.mockResolvedValue({ data: { items: [] } });

    const items = await aihot.getSelectedItems({
      category: 'ai-models',
      take: 5
    });

    expect(items).toEqual([]);
    expect(apiGet).toHaveBeenCalledWith('/api/public/items', {
      params: { mode: 'selected', take: 5, category: 'ai-models' }
    });
  });

  test('关键词搜索', async () => {
    const searchItems = [{ title: 'OpenAI 新闻' }];
    apiGet.mockResolvedValue({ data: { items: searchItems } });

    const items = await aihot.searchItems({
      q: 'OpenAI',
      category: 'industry',
      take: 5
    });

    expect(items).toEqual(searchItems);
    expect(apiGet).toHaveBeenCalledWith('/api/public/items', {
      params: { q: 'OpenAI', take: 5, category: 'industry' }
    });
  });

  test('获取最新日报', async () => {
    const daily = { date: '2026-06-12', items: [] };
    apiGet.mockResolvedValue({ data: daily });

    const result = await aihot.getDaily();

    expect(result).toEqual(daily);
    expect(apiGet).toHaveBeenCalledWith('/api/public/daily');
  });

  test('按日期获取日报', async () => {
    const daily = { date: '2026-06-11', items: [] };
    apiGet.mockResolvedValue({ data: daily });

    const result = await aihot.getDaily('2026-06-11');

    expect(result).toEqual(daily);
    expect(apiGet).toHaveBeenCalledWith('/api/public/daily/2026-06-11');
  });

  test('获取日报归档', async () => {
    const archiveItems = [{ date: '2026-06-12' }];
    apiGet.mockResolvedValue({ data: { items: archiveItems } });

    const items = await aihot.getDailyArchive(5);

    expect(items).toEqual(archiveItems);
    expect(apiGet).toHaveBeenCalledWith('/api/public/dailies', {
      params: { take: 5 }
    });
  });
});
