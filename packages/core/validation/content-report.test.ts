import assert from 'node:assert/strict';
import test from 'node:test';
import { ContentReportReason } from '../enums';
import { contentReportDetailsMaxLength, contentReportInputSchema } from './content-report';

test('Content Report accepts exactly the five reasons', () => {
  const reasons = Object.values(ContentReportReason);

  assert.deepEqual(reasons, [
    'HARMFUL_CONTENT',
    'HARASSMENT_HATE_THREAT',
    'SPAM_FRAUD',
    'CHILD_SAFETY',
    'OTHER',
  ]);

  for (const reason of reasons) {
    const result = contentReportInputSchema.safeParse({ reason });
    assert.equal(result.success, reason !== ContentReportReason.OTHER, reason);
  }
});

test('Content Report trims details and requires non-empty details for Other', () => {
  assert.deepEqual(
    contentReportInputSchema.parse({
      reason: ContentReportReason.OTHER,
      details: '  additional context  ',
    }),
    { reason: ContentReportReason.OTHER, details: 'additional context' },
  );

  assert.equal(
    contentReportInputSchema.safeParse({
      reason: ContentReportReason.OTHER,
      details: '   ',
    }).success,
    false,
  );
});

test('Content Report allows omitted details for other reasons and enforces the shared limit', () => {
  assert.deepEqual(contentReportInputSchema.parse({ reason: ContentReportReason.SPAM_FRAUD }), {
    reason: ContentReportReason.SPAM_FRAUD,
  });

  assert.equal(
    contentReportInputSchema.safeParse({
      reason: ContentReportReason.SPAM_FRAUD,
      details: 'x'.repeat(contentReportDetailsMaxLength),
    }).success,
    true,
  );
  assert.equal(
    contentReportInputSchema.safeParse({
      reason: ContentReportReason.SPAM_FRAUD,
      details: 'x'.repeat(contentReportDetailsMaxLength + 1),
    }).success,
    false,
  );
});
