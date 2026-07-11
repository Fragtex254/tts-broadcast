import { broadcastApi } from '../services/api';
import { createScopedLogger, toLogError } from '../services/logger';
import { createPublishZip, sanitizePublishFileName } from '../services/publishBundle';
import { BroadcastSchema, PublishMetadataSchema, PublishPackageSchema, safeParseStrict } from '../services/schemas';
import type { AppState } from './types';
import type { StoreSet } from './storeTypes';

const logger = createScopedLogger('publish-package-slice');

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function createPublishPackageSlice(set: StoreSet): Pick<
  AppState,
  | 'isGeneratingPublishMetadata'
  | 'isDownloadingPublishPackage'
  | 'publishPackageError'
  | 'generatePublishMetadata'
  | 'savePublishMetadata'
  | 'downloadPublishPackage'
> {
  return {
    isGeneratingPublishMetadata: false,
    isDownloadingPublishPackage: false,
    publishPackageError: null,

    generatePublishMetadata: async (broadcastId) => {
      set({ isGeneratingPublishMetadata: true, publishPackageError: null });
      try {
        const response = await broadcastApi.generatePublishMetadata(broadcastId);
        const metadata = safeParseStrict(PublishMetadataSchema, response.data.metadata);
        const broadcast = safeParseStrict(BroadcastSchema, response.data.broadcast);
        set((state) => ({
          isGeneratingPublishMetadata: false,
          currentBroadcast: state.currentBroadcast?.id === broadcastId ? broadcast : state.currentBroadcast,
          broadcasts: state.broadcasts.map((item) => item.id === broadcastId ? broadcast : item),
        }));
        return metadata;
      } catch (error) {
        set({ isGeneratingPublishMetadata: false, publishPackageError: '生成发布信息失败' });
        logger.error({ err: toLogError(error), broadcastId }, '生成发布信息失败');
        throw error;
      }
    },

    savePublishMetadata: async (broadcastId, metadata) => {
      try {
        const response = await broadcastApi.savePublishMetadata(broadcastId, metadata);
        const savedMetadata = safeParseStrict(PublishMetadataSchema, response.data.metadata);
        const broadcast = safeParseStrict(BroadcastSchema, response.data.broadcast);
        set((state) => ({
          currentBroadcast: state.currentBroadcast?.id === broadcastId ? broadcast : state.currentBroadcast,
          broadcasts: state.broadcasts.map((item) => item.id === broadcastId ? broadcast : item),
        }));
        return savedMetadata;
      } catch (error) {
        logger.error({ err: toLogError(error), broadcastId }, '保存发布信息失败');
        throw error;
      }
    },

    downloadPublishPackage: async (broadcastId) => {
      set({ isDownloadingPublishPackage: true, publishPackageError: null });
      try {
        const [packageResponse, audioResponse] = await Promise.all([
          broadcastApi.getPublishPackage(broadcastId),
          broadcastApi.getPublishAudio(broadcastId),
        ]);
        const publishPackage = safeParseStrict(PublishPackageSchema, packageResponse.data.publishPackage);
        const zip = await createPublishZip(publishPackage, audioResponse.data);
        downloadBlob(zip, `${sanitizePublishFileName(publishPackage.metadata.primaryTitle)}.zip`);
        set({ isDownloadingPublishPackage: false });
      } catch (error) {
        set({ isDownloadingPublishPackage: false, publishPackageError: '生成发布包失败' });
        logger.error({ err: toLogError(error), broadcastId }, '生成发布包失败');
        throw error;
      }
    },
  };
}
