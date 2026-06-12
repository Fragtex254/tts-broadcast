const path = require('path');
const { spawnSync } = require('child_process');

describe('测试数据库隔离', () => {
  test('NODE_ENV=test 时不使用开发数据库文件', () => {
    const backendRoot = path.join(__dirname, '../..');
    const devDbPath = path.join(backendRoot, 'data/broadcast.db');

    const result = spawnSync(
      process.execPath,
      ['-e', "const db = require('./src/db'); console.log(db.name); db.close();"],
      {
        cwd: backendRoot,
        env: { ...process.env, NODE_ENV: 'test' },
        encoding: 'utf8',
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).not.toBe(devDbPath);
  });
});
