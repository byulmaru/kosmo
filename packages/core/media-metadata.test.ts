import assert from 'node:assert/strict';
import test from 'node:test';
import { MediaUsePermission } from './enums';
import { isValidMediaPublicationRights, mediaProviderPublicationMetadata } from './media-metadata';
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
