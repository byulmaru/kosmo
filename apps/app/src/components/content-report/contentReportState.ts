import { ContentReportDeliveryStatus, ContentReportReason } from '@kosmo/core/enums';

export type ContentReportFormState = {
  dirty: boolean;
  submitting: boolean;
};

export type ContentReportOutcome = 'rejected' | 'success' | 'unknown';

export const getContentReportFormState = ({
  details,
  reason,
  submitting,
}: {
  details: string;
  reason: ContentReportReason;
  submitting: boolean;
}): ContentReportFormState => ({
  dirty: reason !== ContentReportReason.HARMFUL_CONTENT || details.length > 0,
  submitting,
});

export const getContentReportOutcome = (
  status: ContentReportDeliveryStatus | null,
): ContentReportOutcome => {
  if (status === ContentReportDeliveryStatus.DELIVERED) {
    return 'success';
  }
  if (status === ContentReportDeliveryStatus.REJECTED) {
    return 'rejected';
  }
  return 'unknown';
};
