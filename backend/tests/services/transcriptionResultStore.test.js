const db = require('../../src/db');
const transcriptionResultStore = require('../../src/services/transcriptionResultStore');

describe('转录结果数据访问层', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM content_projects').run();
    db.prepare('DELETE FROM transcription_results').run();
  });

  test('原子阻止删除含项目引用观点的转录结果', () => {
    const transcription = db.prepare(`
      INSERT INTO transcription_results (file_name, relative_path, text, language, provider, model)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('referenced.wav', 'referenced.wav', '研究原文', 'zh', 'mimo', 'mimo-v2.5-asr');
    const claim = db.prepare(`
      INSERT INTO transcription_claims (
        transcription_id, speaker_key, question, claim, evidence_excerpt,
        evidence_start_index, evidence_end_index, start_seconds, end_seconds
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(transcription.lastInsertRowid, 'SPEAKER_00', '问题', '观点', '证据', 0, 0, 0, 1);
    const project = db.prepare('INSERT INTO content_projects (title) VALUES (?)').run('内容项目');
    db.prepare('INSERT INTO content_project_claims (project_id, claim_id) VALUES (?, ?)')
      .run(project.lastInsertRowid, claim.lastInsertRowid);

    expect(() => transcriptionResultStore.remove(Number(transcription.lastInsertRowid))).toThrow(
      expect.objectContaining({
        code: 'TRANSCRIPTION_RESULT_IN_USE',
        message: '该转录中的观点已被内容项目引用，请先从内容项目移除观点后再删除转录结果',
      })
    );
    expect(transcriptionResultStore.getById(Number(transcription.lastInsertRowid))).toBeDefined();
  });

  test('未被项目引用时保持原有删除行为', () => {
    const transcription = transcriptionResultStore.create({
      fileName: 'unreferenced.wav',
      text: '未引用原文',
      language: 'zh',
      provider: 'mimo',
      model: 'mimo-v2.5-asr',
    });

    expect(transcriptionResultStore.remove(transcription.id)).toBe(true);
    expect(transcriptionResultStore.getById(transcription.id)).toBeUndefined();
  });
});
