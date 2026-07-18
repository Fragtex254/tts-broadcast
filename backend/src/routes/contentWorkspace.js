const express = require('express');
const contentArtifactStore = require('../services/contentArtifactStore');
const contentSourceStore = require('../services/contentSourceStore');
const contentWorkspaceService = require('../services/contentWorkspaceService');
const { createScopedLogger } = require('../services/logger');
const { validateId } = require('../utils/validation');

const router = express.Router();
const logger = createScopedLogger('content-workspace-route');

const MAX_SOURCE_CONTENT_LENGTH = 2000000;
const MAX_ARTIFACT_CONTENT_LENGTH = 5000000;

function trimmedString(value, fallback = '', max = 1000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : fallback;
}

function parseMetadataInput(body) {
  const value = body.metadata !== undefined ? body.metadata : body.metadataJson;
  if (value === undefined) return { valid: true, json: '{}' };

  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return { valid: false, error: '来源元数据必须是 JSON 对象' };
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, error: '来源元数据必须是 JSON 对象' };
  }
  return { valid: true, json: JSON.stringify(parsed) };
}

function validateScopedArtifactIds(req, res) {
  const projectCheck = validateId(req.params.id, '内容项目 ID');
  if (!projectCheck.valid) {
    res.status(400).json({ error: projectCheck.error });
    return undefined;
  }
  const artifactCheck = validateId(req.params.artifactId, '内容稿件 ID');
  if (!artifactCheck.valid) {
    res.status(400).json({ error: artifactCheck.error });
    return undefined;
  }
  return { projectId: projectCheck.id, artifactId: artifactCheck.id };
}

/**
 * GET /api/content-projects/:id/workspace
 * 获取项目的 Brief、来源与版本化稿件。
 */
router.get('/:id/workspace', (req, res) => {
  const check = validateId(req.params.id, '内容项目 ID');
  if (!check.valid) return res.status(400).json({ error: check.error });
  try {
    const workspace = contentWorkspaceService.getWorkspace({ projectId: check.id });
    if (!workspace) return res.status(404).json({ error: '内容项目不存在' });
    res.json({ workspace });
  } catch (error) {
    logger.error({ err: error, projectId: check.id }, '获取内容项目工作区失败');
    res.status(500).json({ error: '获取内容项目工作区失败' });
  }
});

/**
 * POST /api/content-projects/:id/sources
 * 创建并关联来源，或关联已有来源。
 */
router.post('/:id/sources', (req, res) => {
  const projectCheck = validateId(req.params.id, '内容项目 ID');
  if (!projectCheck.valid) return res.status(400).json({ error: projectCheck.error });
  const body = req.body || {};

  let sourceId;
  if (body.sourceId !== undefined) {
    const sourceCheck = validateId(String(body.sourceId), '来源 ID');
    if (!sourceCheck.valid || Number(body.sourceId) !== sourceCheck.id) {
      return res.status(400).json({ error: '无效的来源 ID' });
    }
    sourceId = sourceCheck.id;
  }

  const usageNote = trimmedString(body.usageNote, '', 2000);
  let sortOrder;
  if (body.sortOrder !== undefined) {
    if (!Number.isInteger(body.sortOrder) || body.sortOrder < 0) {
      return res.status(400).json({ error: '来源排序必须是非负整数' });
    }
    sortOrder = body.sortOrder;
  }

  let sourceType = 'manual';
  let title = '';
  let content = '';
  let url = '';
  let externalRef = '';
  let metadataJson = '{}';
  if (!sourceId) {
    sourceType = trimmedString(body.sourceType, 'manual', 50);
    title = trimmedString(body.title, '', 500);
    url = trimmedString(body.url, '', 4000);
    externalRef = trimmedString(body.externalRef, '', 1000);
    if (!sourceType) return res.status(400).json({ error: '请提供来源类型' });
    if (body.content !== undefined && typeof body.content !== 'string') {
      return res.status(400).json({ error: '来源正文必须是字符串' });
    }
    content = body.content ?? '';
    if (content.length > MAX_SOURCE_CONTENT_LENGTH) {
      return res.status(400).json({ error: '来源正文过长，请控制在 200 万字以内' });
    }
    if (!title && !content && !url && !externalRef) {
      return res.status(400).json({ error: '请至少提供来源标题、正文、URL 或外部标识中的一项' });
    }
    const metadataCheck = parseMetadataInput(body);
    if (!metadataCheck.valid) return res.status(400).json({ error: metadataCheck.error });
    metadataJson = metadataCheck.json;
  }

  try {
    const source = contentSourceStore.createAndLink({
      projectId: projectCheck.id,
      sourceId,
      sourceType,
      title,
      content,
      url,
      externalRef,
      metadataJson,
      usageNote,
      sortOrder,
    });
    if (!source) return res.status(404).json({ error: '内容项目或来源不存在' });
    res.status(201).json({ source });
  } catch (error) {
    logger.error({ err: error, projectId: projectCheck.id, hasExistingSource: Boolean(sourceId) }, '关联内容来源失败');
    res.status(500).json({ error: '关联内容来源失败' });
  }
});

/**
 * POST /api/content-projects/:id/artifacts
 * 创建稿件，可选在同一事务中创建首个版本。
 */
router.post('/:id/artifacts', (req, res) => {
  const check = validateId(req.params.id, '内容项目 ID');
  if (!check.valid) return res.status(400).json({ error: check.error });
  const body = req.body || {};

  const kind = trimmedString(body.kind, '', 100);
  const title = trimmedString(body.title, '', 500);
  const platform = trimmedString(body.platform, 'general', 50);
  const status = trimmedString(body.status, 'draft', 50);
  if (!kind) return res.status(400).json({ error: '请提供稿件类型' });
  if (!platform) return res.status(400).json({ error: '稿件平台不能为空' });
  if (!status) return res.status(400).json({ error: '稿件状态不能为空' });

  const hasContent = Object.prototype.hasOwnProperty.call(body, 'content');
  if (hasContent && typeof body.content !== 'string') {
    return res.status(400).json({ error: '稿件正文必须是字符串' });
  }
  const content = hasContent ? body.content : '';
  if (content.length > MAX_ARTIFACT_CONTENT_LENGTH) {
    return res.status(400).json({ error: '稿件正文过长，请控制在 500 万字以内' });
  }
  const changeReason = trimmedString(body.changeReason, 'manual', 1000) || 'manual';

  try {
    const artifact = contentArtifactStore.create({
      projectId: check.id,
      kind,
      title,
      platform,
      status,
      hasContent,
      content,
      changeReason,
    });
    if (!artifact) return res.status(404).json({ error: '内容项目不存在' });
    res.status(201).json({ artifact });
  } catch (error) {
    logger.error({ err: error, projectId: check.id, kind }, '创建内容稿件失败');
    res.status(500).json({ error: '创建内容稿件失败' });
  }
});

/**
 * POST /api/content-projects/:id/artifacts/:artifactId/revisions
 * 为稿件追加一个不可变版本。
 */
router.post('/:id/artifacts/:artifactId/revisions', (req, res) => {
  const ids = validateScopedArtifactIds(req, res);
  if (!ids) return undefined;
  const body = req.body || {};
  if (!Object.prototype.hasOwnProperty.call(body, 'content') || typeof body.content !== 'string') {
    return res.status(400).json({ error: '请提供字符串格式的稿件正文' });
  }
  if (body.content.length > MAX_ARTIFACT_CONTENT_LENGTH) {
    return res.status(400).json({ error: '稿件正文过长，请控制在 500 万字以内' });
  }
  const changeReason = trimmedString(body.changeReason, 'manual', 1000) || 'manual';

  try {
    const result = contentArtifactStore.addRevision({
      projectId: ids.projectId,
      artifactId: ids.artifactId,
      content: body.content,
      changeReason,
    });
    if (!result) return res.status(404).json({ error: '内容稿件不存在' });
    res.status(201).json(result);
  } catch (error) {
    logger.error({ err: error, projectId: ids.projectId, artifactId: ids.artifactId }, '保存稿件新版本失败');
    res.status(500).json({ error: '保存稿件新版本失败' });
  }
});

/**
 * GET /api/content-projects/:id/artifacts/:artifactId/revisions
 * 获取稿件的全部历史版本。
 */
router.get('/:id/artifacts/:artifactId/revisions', (req, res) => {
  const ids = validateScopedArtifactIds(req, res);
  if (!ids) return undefined;
  try {
    const revisions = contentArtifactStore.listRevisions({
      projectId: ids.projectId,
      artifactId: ids.artifactId,
    });
    if (!revisions) return res.status(404).json({ error: '内容稿件不存在' });
    res.json({ revisions });
  } catch (error) {
    logger.error({ err: error, projectId: ids.projectId, artifactId: ids.artifactId }, '获取稿件版本失败');
    res.status(500).json({ error: '获取稿件版本失败' });
  }
});

module.exports = router;
