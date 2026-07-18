const audioAsset = require('./audioAsset');
const broadcastStore = require('./broadcastStore');
const contentArtifactStore = require('./contentArtifactStore');
const tts = require('./tts');
const ttsQueue = require('./ttsQueue');
const { createScopedLogger } = require('./logger');
const { cleanAudioFile } = require('../utils/validation');

const logger = createScopedLogger('broadcast-render-service');

const SOURCE_REVISION_UNAVAILABLE = 'SOURCE_REVISION_UNAVAILABLE';
const RENDER_PERSISTENCE_FAILED = 'RENDER_PERSISTENCE_FAILED';
const RENDER_FILE_WRITE_FAILED = 'RENDER_FILE_WRITE_FAILED';

function createRenderError({ code, message, cause }) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function sourceRevisionMatches({ sourceArtifactRevisionId, content }) {
  if (sourceArtifactRevisionId === null || sourceArtifactRevisionId === undefined) return true;
  const context = contentArtifactStore.getRevisionContext({ revisionId: sourceArtifactRevisionId });
  return Boolean(
    context
    && context.artifact.kind === 'audio_script'
    && context.revision.content === content
  );
}

function createPendingRender(params) {
  try {
    if (!sourceRevisionMatches(params)) {
      throw createRenderError({
        code: SOURCE_REVISION_UNAVAILABLE,
        message: '口播稿版本已失效，请重新打开项目后再生成音频',
      });
    }
    return broadcastStore.create({
      title: params.title,
      content: params.content,
      voiceType: params.voiceType,
      voiceConfig: params.voiceConfig,
      sourceItems: params.sourceItems,
      status: 'pending',
      mode: 'whole',
      artifactRevisionId: params.sourceArtifactRevisionId,
    });
  } catch (error) {
    if (error.code === SOURCE_REVISION_UNAVAILABLE) throw error;
    if (!sourceRevisionMatches(params)) {
      throw createRenderError({
        code: SOURCE_REVISION_UNAVAILABLE,
        message: '口播稿版本已失效，请重新打开项目后再生成音频',
        cause: error,
      });
    }
    throw error;
  }
}

function rollbackPendingRender({ broadcastId, audioPath }) {
  let deletedPending = false;
  try {
    deletedPending = broadcastStore.deletePendingWholeGeneration(broadcastId);
  } catch (rollbackError) {
    logger.warn({ err: rollbackError, broadcastId }, '回滚 pending 整篇 Render 失败');
    return;
  }
  // 只有数据库原子确认这条记录仍是未收口 pending，才允许删除候选文件。
  // 若 UPDATE 已完成或状态无法确认，宁可暂留孤儿文件，也不能破坏 generated Render。
  if (!deletedPending) return;
  try {
    cleanAudioFile(audioPath);
  } catch (cleanupError) {
    logger.warn({
      err: cleanupError,
      broadcastId,
      hasAudioPath: Boolean(audioPath),
    }, '补偿清理整篇 Render 音频失败');
  }
}

/**
 * 生成并持久化整篇音频 Render。
 * 先创建 pending Render 固定来源，再调用 TTS；写盘或最终落库失败时补偿清理本次记录与音频。
 * @param {Object} params
 * @param {Object} params.speechParams - 已编译的 TTS 参数
 * @param {string} params.title - Render 标题
 * @param {string} params.content - 创建 Render 时的口播稿快照
 * @param {string} params.voiceType - 音色类型
 * @param {Object} params.voiceConfig - 规范化音色配置
 * @param {Array|string|null} params.sourceItems - 兼容来源资讯快照
 * @param {number|null} params.sourceArtifactRevisionId - 创建 Render 时的来源 Revision ID
 * @returns {Promise<{ broadcast: Object, audioPath: string }>} 已生成 Render 与音频路径
 */
async function generateWholeRender({
  speechParams,
  title,
  content,
  voiceType,
  voiceConfig,
  sourceItems,
  sourceArtifactRevisionId,
}) {
  const pending = createPendingRender({
    title,
    content,
    voiceType,
    voiceConfig,
    sourceItems,
    sourceArtifactRevisionId,
  });
  const expectedAudioPath = `/audio/broadcast_${pending.id}.wav`;
  let audioPath = null;
  let stage = 'tts';

  try {
    const audioBuffer = await ttsQueue.enqueueTts(
      speechParams,
      () => tts.generateSpeech(speechParams)
    );
    stage = 'write';
    audioPath = audioAsset.writeBroadcastAudio(audioBuffer, pending.id);
    stage = 'complete';
    try {
      const broadcast = broadcastStore.completeWholeGeneration({ id: pending.id, audioPath });
      if (!broadcast) throw new Error('待完成的音频 Render 不存在');
      return { broadcast, audioPath };
    } catch (completionError) {
      // UPDATE 可能已经成功、但读取 DTO 时异常；先对账，避免误删已落库的有效音频。
      const settled = broadcastStore.getById(pending.id);
      if (settled?.status === 'generated' && settled.audio_path === audioPath) {
        return { broadcast: settled, audioPath };
      }
      throw completionError;
    }
  } catch (error) {
    rollbackPendingRender({
      broadcastId: pending.id,
      audioPath: audioPath || expectedAudioPath,
    });
    if (stage === 'complete') {
      throw createRenderError({
        code: RENDER_PERSISTENCE_FAILED,
        message: '音频生成结果保存失败，请重试',
        cause: error,
      });
    }
    if (stage === 'write') {
      throw createRenderError({
        code: RENDER_FILE_WRITE_FAILED,
        message: '音频文件保存失败，请重试',
        cause: error,
      });
    }
    throw error;
  }
}

module.exports = {
  RENDER_FILE_WRITE_FAILED,
  RENDER_PERSISTENCE_FAILED,
  SOURCE_REVISION_UNAVAILABLE,
  generateWholeRender,
};
