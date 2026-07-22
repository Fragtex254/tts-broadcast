const request = require('supertest');
const app = require('../src/app');
const scheduler = require('../src/services/scheduler');

jest.mock('../src/services/scheduler', () => ({
  init: jest.fn(),
  shutdown: jest.fn(),
}));

describe('应用网络边界', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    scheduler.init.mockClear();
  });

  test.each([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ])('允许默认前端来源 %s', async (origin) => {
    const res = await request(app)
      .get('/api/settings')
      .set('Origin', origin);

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
  });

  test('允许不带 Origin 的本机和 CLI 请求', async () => {
    const res = await request(app).get('/api/settings');

    expect(res.status).toBe(200);
  });

  test('拒绝非白名单跨域请求', async () => {
    const res = await request(app)
      .get('/api/settings')
      .set('Origin', 'https://evil.example');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: '不允许的跨域来源' });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('CORS_ORIGINS 只追加非空来源并保留默认白名单', () => {
    const origins = app.getAllowedCorsOrigins('https://studio.example, http://192.168.1.20:5173, ');

    expect(origins).toEqual(new Set([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'https://studio.example',
      'http://192.168.1.20:5173',
    ]));
  });

  test('HTTP 服务默认只监听 127.0.0.1', () => {
    const fakeServer = { close: jest.fn() };
    const listenSpy = jest.spyOn(app, 'listen').mockReturnValue(fakeServer);

    expect(app.start({ manageProcess: false })).toBe(fakeServer);
    expect(scheduler.init).toHaveBeenCalledTimes(1);
    expect(listenSpy).toHaveBeenCalledWith(expect.anything(), '127.0.0.1', expect.any(Function));
  });
});
