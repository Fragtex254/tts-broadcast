jest.mock('axios', () => ({
  get: jest.fn()
}));

const axios = require('axios');
const asrModels = require('../../src/services/asrModels');

describe('ASR 模型发现服务', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Base URL 不含版本时优先探测 /v1/models', () => {
    expect(asrModels.buildAsrModelEndpointCandidates('http://192.168.31.137:18080')).toEqual([
      'http://192.168.31.137:18080/v1/models',
      'http://192.168.31.137:18080/models'
    ]);
  });

  test('Base URL 含 /v1 时探测 /models', () => {
    expect(asrModels.buildAsrModelEndpointCandidates('http://192.168.31.137:18080/v1')).toEqual([
      'http://192.168.31.137:18080/v1/models'
    ]);
  });

  test('获取模型列表并排序，API Key 可选', async () => {
    axios.get.mockResolvedValue({
      data: {
        data: [
          { id: 'moss-z', owned_by: 'moss' },
          { id: 'moss-a' }
        ]
      }
    });

    const result = await asrModels.fetchAsrModelsForConfig({
      baseUrl: 'http://192.168.31.137:18080/v1'
    });

    expect(result).toEqual({
      models: [
        { id: 'moss-a' },
        { id: 'moss-z', owned_by: 'moss' }
      ],
      resolvedUrl: 'http://192.168.31.137:18080/v1/models'
    });
    expect(axios.get).toHaveBeenCalledWith(
      'http://192.168.31.137:18080/v1/models',
      expect.objectContaining({
        headers: { 'User-Agent': 'tts-broadcast' },
        proxy: false,
        timeout: 15000
      })
    );
  });

  test('带 API Key 时发送 Bearer 和 api-key header', async () => {
    axios.get.mockResolvedValue({ data: { data: [{ id: 'moss-asr' }] } });

    await asrModels.fetchAsrModelsForConfig({
      baseUrl: 'http://192.168.31.137:18080/v1',
      apiKey: 'local-key'
    });

    expect(axios.get).toHaveBeenCalledWith(
      'http://192.168.31.137:18080/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer local-key',
          'api-key': 'local-key'
        })
      })
    );
  });

  test('兼容 MOSS 服务返回的 models 字段', async () => {
    axios.get.mockResolvedValue({
      data: {
        models: [
          { id: 'moss-transcribe-diarize-0.9b', provider: 'OpenMOSS-Team' }
        ]
      }
    });

    const result = await asrModels.fetchAsrModelsForConfig({
      baseUrl: 'http://192.168.31.137:18080/v1'
    });

    expect(result.models).toEqual([{ id: 'moss-transcribe-diarize-0.9b' }]);
  });

  test('保留服务端声明的模型能力供客户端约束任务配置', async () => {
    axios.get.mockResolvedValue({
      data: {
        data: [{
          id: 'structured-asr',
          capabilities: {
            transcription: true,
            diarization: true,
            segment_timestamps: true,
            languages: ['auto'],
            speaker_resolution_modes: ['off', 'auto', 'required']
          }
        }]
      }
    });

    const result = await asrModels.fetchAsrModelsForConfig({
      baseUrl: 'http://192.168.31.137:18080/v1'
    });

    expect(result.models[0]).toEqual({
      id: 'structured-asr',
      capabilities: {
        transcription: true,
        diarization: true,
        segment_timestamps: true,
        languages: ['auto'],
        speaker_resolution_modes: ['off', 'auto', 'required']
      }
    });
  });
});
