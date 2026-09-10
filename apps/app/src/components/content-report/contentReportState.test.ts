import assert from 'node:assert/strict';
import test from 'node:test';
import { ContentReportDeliveryStatus, ContentReportReason } from '@kosmo/core/enums';
import { getContentReportFormState, getContentReportOutcome } from './contentReportState';

test('Content Report form state treats changed reason/details as a dirty draft', () => {
  assert.deepEqual(
    getContentReportFormState({
      details: '',
      reason: ContentReportReason.HARMFUL_CONTENT,
      submitting: false,
    }),
    { dirty: false, submitting: false },
  );
  assert.deepEqual(
    getContentReportFormState({
      details: '',
      reason: ContentReportReason.OTHER,
      submitting: true,
    }),
    { dirty: true, submitting: true },
  );
  assert.deepEqual(
    getContentReportFormState({
      details: '설명',
      reason: ContentReportReason.HARMFUL_CONTENT,
      submitting: false,
    }),
    { dirty: true, submitting: false },
  );
});

test('Content Report maps server and transport outcomes to user-visible states', () => {
  assert.equal(getContentReportOutcome(ContentReportDeliveryStatus.DELIVERED), 'success');
  assert.equal(getContentReportOutcome(ContentReportDeliveryStatus.REJECTED), 'rejected');
  assert.equal(getContentReportOutcome(ContentReportDeliveryStatus.UNKNOWN), 'unknown');
  assert.equal(getContentReportOutcome(null), 'unknown');
});
