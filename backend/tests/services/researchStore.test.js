const db = require('../../src/db');
const researchStore = require('../../src/services/researchStore');

describe('播客观点数据访问层', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM content_projects').run();
    db.prepare('DELETE FROM transcription_results').run();
  });

  test('原子阻止删除已被内容项目引用的观点', () => {
    const transcription = db.prepare(`
      INSERT INTO transcription_results (file_name, relative_path, text, language, provider, model)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('referenced.wav', 'referenced.wav', '研究原文', 'zh', 'mimo', 'mimo-v2.5-asr');
    const claim = db.prepare(`
      INSERT INTO transcription_claims (
        transcription_id, speaker_key, question, claim, evidence_excerpt,
        evidence_start_index, evidence_end_index, start_seconds, end_seconds
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(transcription.lastInsertRowid, 'speaker-0001', '问题', '观点', '证据', 0, 0, 0, 1);
    const project = db.prepare('INSERT INTO content_projects (title) VALUES (?)').run('内容项目');
    db.prepare('INSERT INTO content_project_claims (project_id, claim_id) VALUES (?, ?)')
      .run(project.lastInsertRowid, claim.lastInsertRowid);

    expect(() => researchStore.removeClaim(Number(claim.lastInsertRowid))).toThrow(
      expect.objectContaining({
        code: 'TRANSCRIPTION_CLAIM_IN_USE',
        message: '该观点已被内容项目引用，请先从内容项目移除观点后再删除',
      })
    );
    expect(researchStore.getClaim(Number(claim.lastInsertRowid))).toBeDefined();
    expect(db.prepare('SELECT COUNT(*) AS count FROM content_project_claims WHERE claim_id = ?')
      .get(claim.lastInsertRowid).count).toBe(1);
  });

  test('观点未被引用时保持原有删除行为', () => {
    const transcription = db.prepare(`
      INSERT INTO transcription_results (file_name, relative_path, text, language, provider, model)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('unreferenced.wav', 'unreferenced.wav', '研究原文', 'zh', 'mimo', 'mimo-v2.5-asr');
    const claim = db.prepare(`
      INSERT INTO transcription_claims (
        transcription_id, speaker_key, question, claim, evidence_excerpt,
        evidence_start_index, evidence_end_index, start_seconds, end_seconds
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(transcription.lastInsertRowid, 'speaker-0001', '问题', '观点', '证据', 0, 0, 0, 1);

    expect(researchStore.removeClaim(Number(claim.lastInsertRowid))).toBe(true);
    expect(researchStore.getClaim(Number(claim.lastInsertRowid))).toBeUndefined();
  });
});
