import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isInputObjectType, isObjectType } from 'graphql';

process.env.NODE_ENV = 'production';
process.env.TEMPORAL_ADDRESS ??= '127.0.0.1:7233';
process.env.TEMPORAL_NAMESPACE ??= 'test';

const { schema } = await import('@/graphql/schema');

test('Profile Mute GraphQL contract는 Owner 전용 관계와 영구 입력만 노출한다', () => {
  const profileMute = schema.getType('ProfileMute');
  const muteInput = schema.getType('MuteProfileInput');
  const mutePayload = schema.getType('MuteProfilePayload');
  const unmuteInput = schema.getType('UnmuteProfileInput');
  const unmutePayload = schema.getType('UnmuteProfilePayload');
  const profile = schema.getType('Profile');
  const viewerState = schema.getType('ProfileViewerState');
  const mutation = schema.getMutationType();

  assert.ok(isObjectType(profileMute));
  assert.ok(profileMute.getFields().targetProfile);
  assert.ok(profileMute.getFields().createdAt);
  assert.equal(profileMute.getFields().expiresAt, undefined);

  assert.ok(isInputObjectType(muteInput));
  assert.deepEqual(Object.keys(muteInput.getFields()), ['id']);
  assert.ok(isObjectType(mutePayload));
  assert.equal(String(mutePayload.getFields().profileMute.type), 'ProfileMute!');

  assert.ok(isInputObjectType(unmuteInput));
  assert.deepEqual(Object.keys(unmuteInput.getFields()), ['id']);
  assert.ok(isObjectType(unmutePayload));
  assert.equal(String(unmutePayload.getFields().profileMuteId.type), 'ID');

  assert.ok(isObjectType(profile));
  assert.ok(profile.getFields().profileMutes);
  assert.ok(isObjectType(viewerState));
  assert.equal(String(viewerState.getFields().profileMute.type), 'ProfileMute');
  assert.ok(mutation?.getFields().muteProfile);
  assert.ok(mutation?.getFields().unmuteProfile);
});
