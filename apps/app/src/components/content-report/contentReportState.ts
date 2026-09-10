import { ContentReportReason } from '@kosmo/core/enums';

export type ContentReportFormState = {
  dirty: boolean;
  submitting: boolean;
};

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
