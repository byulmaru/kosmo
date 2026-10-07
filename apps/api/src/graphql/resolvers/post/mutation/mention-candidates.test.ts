import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractPostMentionCandidates } from './mention-candidates';

test('keeps source spelling and UTF-16 ranges while normalizing local, remote and IDN identities', () => {
  const bodyText =
    '😀 (@ALICE), @alice@local.example! @alice.name@BÜCHER.example. @alice@𠀀.example.';
  const candidates = extractPostMentionCandidates(bodyText, 'local.example');

  assert.deepEqual(
    candidates.map(({ end, handle, relativeHandle, start }) => ({
      end,
      handle,
      relativeHandle,
      start,
    })),
    [
      {
        end: bodyText.indexOf('@ALICE') + '@ALICE'.length,
        handle: { kind: 'local', handle: 'ALICE', normalizedHandle: 'alice' },
        relativeHandle: '@ALICE',
        start: bodyText.indexOf('@ALICE'),
      },
      {
        end: bodyText.indexOf('@alice@local.example') + '@alice@local.example'.length,
        handle: { kind: 'local', handle: 'alice', normalizedHandle: 'alice' },
        relativeHandle: '@alice@local.example',
        start: bodyText.indexOf('@alice@local.example'),
      },
      {
        end: bodyText.indexOf('@alice.name@BÜCHER.example.') + '@alice.name@BÜCHER.example'.length,
        handle: {
          kind: 'remote',
          domain: 'xn--bcher-kva.example',
          handle: 'alice.name',
          normalizedHandle: 'alice.name',
        },
        relativeHandle: '@alice.name@BÜCHER.example',
        start: bodyText.indexOf('@alice.name@BÜCHER.example.'),
      },
      {
        end: bodyText.indexOf('@alice@𠀀.example') + '@alice@𠀀.example'.length,
        handle: {
          kind: 'remote',
          domain: 'xn--j50i.example',
          handle: 'alice',
          normalizedHandle: 'alice',
        },
        relativeHandle: '@alice@𠀀.example',
        start: bodyText.indexOf('@alice@𠀀.example'),
      },
    ],
  );
});

test('keeps email and URL text plain and does not fall back from qualified to bare handles', () => {
  const bodyText =
    "email@alice foo+@alice foo'@alice mailto:foo+@alice https://example.com/@alice " +
    'https://example.com/path?user=@alice www.example.com/@alice @alice.extra @aliceé ' +
    "'@alice' (@alice) @alice@missing.example @alice@missing.example@other.example @alice@";
  const candidates = extractPostMentionCandidates(bodyText, 'local.example');

  assert.deepEqual(
    candidates.map(({ handle, relativeHandle }) => ({ handle, relativeHandle })),
    [
      {
        handle: { kind: 'local', handle: 'alice', normalizedHandle: 'alice' },
        relativeHandle: '@alice',
      },
      {
        handle: { kind: 'local', handle: 'alice', normalizedHandle: 'alice' },
        relativeHandle: '@alice',
      },
      {
        handle: {
          kind: 'remote',
          domain: 'missing.example',
          handle: 'alice',
          normalizedHandle: 'alice',
        },
        relativeHandle: '@alice@missing.example',
      },
    ],
  );
});
