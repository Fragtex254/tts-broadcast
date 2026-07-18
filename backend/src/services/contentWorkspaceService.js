const contentArtifactStore = require('./contentArtifactStore');
const contentProjectStore = require('./contentProjectStore');
const contentSourceStore = require('./contentSourceStore');

/**
 * 聚合内容项目、来源与版本化稿件，形成工作区读取模型。
 * @param {Object} params
 * @param {number} params.projectId - 内容项目 ID
 * @returns {{ project: Object, sources: Array<Object>, artifacts: Array<Object> }|undefined} 工作区 DTO
 */
function getWorkspace({ projectId }) {
  const project = contentProjectStore.getById(projectId);
  if (!project) return undefined;
  return {
    project,
    sources: contentSourceStore.listForProject({ projectId }),
    artifacts: contentArtifactStore.listForProject({ projectId }),
  };
}

module.exports = { getWorkspace };
