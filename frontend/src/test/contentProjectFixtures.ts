import type { ContentArtifactRevision } from '../store';

export const CONTENT_REVISION_DEFAULTS: Pick<
  ContentArtifactRevision,
  'parent_revision_id' | 'generation_job_id' | 'request_key' | 'provenance' | 'citations' | 'citation_status'
> = {
  parent_revision_id: null,
  generation_job_id: null,
  request_key: '',
  provenance: {
    blocks: [],
    origin: 'manual',
    operation: 'manual_save',
    prompt_version: '',
    model: '',
    provider: '',
    input_fingerprint: '',
    creator_input_keys: [],
    creator_inputs: {},
    outline_revision_id: null,
    evidence_ids: [],
  },
  citations: [],
  citation_status: 'not_applicable',
};
