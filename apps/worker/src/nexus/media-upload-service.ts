import { operation, service } from 'nexus-rpc';
import type {
  MediaUploadWorkflowInput,
  MediaUploadWorkflowResult,
} from '@kosmo/core/temporal/media-upload';

export const mediaUploadService = service('kosmoMediaUpload', {
  processUpload: operation<MediaUploadWorkflowInput, MediaUploadWorkflowResult>(),
});
