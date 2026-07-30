import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8').replace(/\s+/g, ' ');

function assertOrdered(value: string, tokens: readonly string[]): void {
  let offset = 0;
  for (const token of tokens) {
    const index = value.indexOf(token, offset);
    assert.notEqual(index, -1, `Expected ${JSON.stringify(token)} after offset ${offset}`);
    offset = index + token.length;
  }
}

describe('분석 성공 경계 호출 계약', () => {
  it('Post 성공 뒤에만 실제 Profile과 visibility payload를 보낸다', () => {
    const postComposer = source('../components/post/PostComposer.tsx');

    assertOrdered(postComposer, [
      'onCompleted: (_response, errors) => {',
      "if (errors?.length) { setError('게시글을 작성하지 못했습니다.'); return; }",
      "trackAnalytics('post_created', { selected_profile_id: profile.id, visibility, });",
    ]);
  });

  it('Follow 성공 뒤에만 결과 종류와 선택 Profile payload를 보낸다', () => {
    const followButton = source('../components/profile/FollowButton.tsx');

    assertOrdered(followButton, [
      'onCompleted: (response, errors) => { const failed = Boolean(errors?.length);',
      'if (failed || !selectedProfileId) { return; }',
      "trackAnalytics('follow_succeeded', {",
      "? 'request' : 'follow', selected_profile_id: selectedProfileId,",
    ]);
  });

  it('Profile 생성과 선택의 실제 성공 상태를 각각 기록한다', () => {
    const profileSwitcher = source('../components/shell/ProfileSwitcher.tsx');

    assertOrdered(profileSwitcher.slice(profileSwitcher.indexOf('const selectProfile =')), [
      'onCompleted: (response, errors) => {',
      "if (errors?.length) { setOperationError(operationVersion, '프로필을 전환하지 못했습니다.'); return; }",
      'const selectedProfileId = response.selectProfile.session.selectedProfile?.id ?? id;',
      "trackAnalytics('profile_selected', { selected_profile_id: selectedProfileId });",
    ]);
    assertOrdered(profileSwitcher.slice(profileSwitcher.indexOf('const createProfile =')), [
      'onCompleted: (response, errors) => {',
      "if (errors?.length) { setOperationError(operationVersion, '프로필을 생성하지 못했습니다.'); return; }",
      "trackAnalytics('profile_created', { selected_profile_id: active?.id ?? null, });",
    ]);
  });

  it('검색은 원문 없이 제출·network 완료·결과 선택 payload만 기록한다', () => {
    const search = source('../app/(tabs)/(protected)/search.tsx');

    assertOrdered(search, [
      'complete: () => { if (!failed && hasResults !== null) {',
      "trackAnalytics('search_results_loaded', { has_results: hasResults, tab: 'people', });",
    ]);
    assert.ok(
      search.includes("trackAnalytics('search_submitted', { source, tab });"),
      '검색 제출 payload는 source와 tab만 포함해야 한다.',
    );
    assert.ok(
      search.includes("trackAnalytics('search_result_selected', { tab: 'people' })"),
      '검색 결과 선택 payload는 tab만 포함해야 한다.',
    );
    assert.ok(!search.includes('search_more_results_loaded'));
  });
});
