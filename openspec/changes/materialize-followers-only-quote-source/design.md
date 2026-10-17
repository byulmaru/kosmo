# PROD-793 구현 메모

이 파일은 세션 하네스다. 제품 계약은 canonical Post/Follow/Profile 문서와 Linear가 소유한다.
[robin-maki의 #962 리뷰](https://github.com/byulmaru/kosmo/pull/962#issuecomment-5969882973)에 따라 #961의 공통 Post consent를 기반으로 private Source 경계를 유지한다.

## 현재 연결

- 실제 Fedify Authorization 검증으로 Quote·Source URI·Source author 대응을 확보한다. URI-only 또는 전달 actor만으로 작성자를 추정하지 않는다.
- 이미 저장된 Active Source author의 established Follow 중 Active Local Profile/Instance를 확인하고 Profile ID 순으로 signer를 선택한다.
- 선택 identity의 key와 authenticated loader로 exact Source URI를 조회한다. unsigned/shared identity fallback은 없다.
- exact Note ID, 단일 author, canonical followers audience를 검사한다. Public/Unlisted는 기존 public 경계를 재사용한다.
- Source 저장 직전에 같은 follower, Follow, Profile/Instance와 actor/followers URI를 다시 검사한다. social admission 전체를 직렬화하는 FOR UPDATE는 사용하지 않는다.
- private Source·Content·Media·mapping 저장과 applyPostQuoteConsent를 같은 outer transaction에 참여시킨다. 검증 전에 캡처한 consent/approval/source snapshot의 CAS가 실패하면 새 Source 저장도 rollback한다.
- URI 경합 winner의 author와 Followers visibility를 확인하고, postCommit effect는 outer commit 뒤 실행한다.
- signed fetch 일시 장애는 parent Workflow가 candidate와 snapshot을 보존하여 재시도한다. 새 durable revision/identity/transport receipt는 추가하지 않는다.
- 성공한 fetch나 consent은 viewer ACL을 대신하지 않는다. 본문·Quote identity·audience와 Source 가용성 정책은 유지한다.

## 검증과 배포 경계

테스트는 실제 Fedify proof에서 signer를 선택하고, fetch 중 권한 변경·저장 중 consent/approval 경쟁·동시 Source materialization·postCommit 0회 rollback을 실행한다.
최종 HEAD의 전체 CI 결과는 PR #962에 기록한다. 선행 #961의 공통 consent migration/index 및 Workflow 호환 확인 뒤 활성화해야 한다.
운영 DB와 진행 중 Workflow history는 직접 확인하지 않았으며 이번 PR 검증을 production acceptance로 표현하지 않는다.
