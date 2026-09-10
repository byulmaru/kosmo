import assert from 'node:assert/strict';
import test from 'node:test';
import { ContentReportReason } from '@kosmo/core/enums';
import { getContentReportFormState } from './contentReportState';

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
