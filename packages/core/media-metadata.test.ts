import assert from 'node:assert/strict';
import test from 'node:test';
import { MediaUsePermission } from './enums';
import {
  isValidMediaPublicationRights,
  mediaProviderPublicationMetadata,
  parseMediaUseTermsRights,
} from './media-metadata';
import type { MediaPublicationMetadata, MediaPublicationRights } from './media-metadata';

const permission = MediaUsePermission;

test('media publication rights allow only monotone permissions from personal to commercial', () => {
  const accepted: MediaPublicationRights[] = [
    { personal: permission.DENY, noncommercial: permission.DENY, commercial: permission.DENY },
    { personal: permission.ORIGINAL, noncommercial: permission.DENY, commercial: permission.DENY },
    {
      personal: permission.ORIGINAL,
      noncommercial: permission.ORIGINAL,
      commercial: permission.DENY,
    },
    {
      personal: permission.ORIGINAL,
      noncommercial: permission.ORIGINAL,
      commercial: permission.ORIGINAL,
    },
    { personal: permission.EDIT, noncommercial: permission.DENY, commercial: permission.DENY },
    { personal: permission.EDIT, noncommercial: permission.ORIGINAL, commercial: permission.DENY },
    {
      personal: permission.EDIT,
      noncommercial: permission.ORIGINAL,
      commercial: permission.ORIGINAL,
    },
    { personal: permission.EDIT, noncommercial: permission.EDIT, commercial: permission.DENY },
    { personal: permission.EDIT, noncommercial: permission.EDIT, commercial: permission.ORIGINAL },
    { personal: permission.EDIT, noncommercial: permission.EDIT, commercial: permission.EDIT },
  ];
  const rejected: MediaPublicationRights[] = [
    { personal: permission.DENY, noncommercial: permission.ORIGINAL, commercial: permission.DENY },
    { personal: permission.ORIGINAL, noncommercial: permission.EDIT, commercial: permission.DENY },
    { personal: permission.EDIT, noncommercial: permission.DENY, commercial: permission.ORIGINAL },
    { personal: permission.DENY, noncommercial: permission.DENY, commercial: permission.ORIGINAL },
  ];

  for (const rights of accepted) {
    assert.equal(isValidMediaPublicationRights(rights), true, JSON.stringify(rights));
  }
  for (const rights of rejected) {
    assert.equal(isValidMediaPublicationRights(rights), false, JSON.stringify(rights));
  }
});

test('parses exact image-use terms parameters from scalar and query-array values', () => {
  const rights: MediaPublicationRights = {
    personal: permission.EDIT,
    noncommercial: permission.ORIGINAL,
    commercial: permission.DENY,
  };

  assert.deepEqual(
    parseMediaUseTermsRights({
      personal: ['EDIT'],
      noncommercial: 'ORIGINAL',
      commercial: ['DENY'],
    }),
    rights,
  );
  assert.deepEqual(parseMediaUseTermsRights(rights), rights);
});

test('rejects incomplete, ambiguous, unknown, invalid, or unordered image-use terms parameters', () => {
  const invalidParameters: ReadonlyArray<
    Readonly<Record<string, string | readonly string[] | undefined>>
  > = [
    { personal: 'DENY', noncommercial: 'DENY' },
    { personal: 'DENY', noncommercial: 'DENY', commercial: 'DENY', extra: 'value' },
    { personal: 'DENY', noncommercial: undefined, commercial: 'DENY' },
    { personal: [], noncommercial: 'DENY', commercial: 'DENY' },
    { personal: ['DENY', 'EDIT'], noncommercial: 'DENY', commercial: 'DENY' },
    { personal: 'deny', noncommercial: 'DENY', commercial: 'DENY' },
    { personal: ' DENY', noncommercial: 'DENY', commercial: 'DENY' },
    { personal: 'DENY', noncommercial: 'ORIGINAL', commercial: 'ORIGINAL' },
  ];

  for (const parameters of invalidParameters) {
    assert.equal(parseMediaUseTermsRights(parameters), null, JSON.stringify(parameters));
  }
});

test('provider publication metadata keeps Profile attribution without optional rights', () => {
  const metadata: MediaPublicationMetadata = {
    attributionName: 'Public author',
    attributionUrl: 'https://kosmo.example/@author',
  };

  assert.deepEqual(mediaProviderPublicationMetadata(metadata), {
    credit: 'Public author (https://kosmo.example/@author)',
  });
});

test('provider publication metadata maps optional rights to an absolute v1 terms URL', () => {
  const metadata: MediaPublicationMetadata = {
    attributionName: 'Public author',
    attributionUrl: 'https://kosmo.example/@author',
    rights: {
      personal: permission.EDIT,
      noncommercial: permission.ORIGINAL,
      commercial: permission.DENY,
    },
  };

  const result = mediaProviderPublicationMetadata(metadata);

  assert.equal(result.credit, 'Public author (https://kosmo.example/@author)');
  assert.equal(result.copyright, 'Public author (https://kosmo.example/@author)');
  assert.ok(result.usageTerms);
  assert.equal(
    result.webStatement,
    'https://kosmo.example/terms/image-use/v1?personal=EDIT&noncommercial=ORIGINAL&commercial=DENY',
  );
  assert.deepEqual(Object.keys(result).sort(), [
    'copyright',
    'credit',
    'usageTerms',
    'webStatement',
  ]);
});
