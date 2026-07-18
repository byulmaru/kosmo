import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toProfileFollowRecipient } from './profile-follow-delivery';

const actor = {
  inboxUri: 'https://remote.example/users/alice/inbox',
  sharedInboxUri: 'https://remote.example/inbox',
  uri: 'https://remote.example/users/alice',
};

test('stored actor endpoint를 Recipient로 변환한다', () => {
  const recipient = toProfileFollowRecipient(actor);

  assert.equal(recipient.id?.href, actor.uri);
  assert.equal(recipient.inboxId?.href, actor.inboxUri);
  assert.equal(recipient.endpoints?.sharedInbox?.href, actor.sharedInboxUri);
});

test('저장 actor inbox가 없으면 명시적으로 실패한다', () => {
  assert.throws(() => toProfileFollowRecipient({ ...actor, inboxUri: null }), /must have an inbox/);
});
