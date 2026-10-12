# PROD-792 구현 메모

이 문서는 변경 가능한 세션 하네스다. 제품 계약은 `docs/domain/objects/post.md`와 accepted ADR 0029, Linear가 소유한다.
PR #1094 병합과 [robin-maki의 #961 리뷰](https://github.com/byulmaru/kosmo/pull/961#issuecomment-5969879335)에 맞춰 이전 별도 table/revision 설계를 대체한다.

## 현재 구현

- Fedify 2.4.0의 vocabulary와 interaction-controls로 actor, Note, Source, Authorization을 검증한다.
- 동의는 Posts의 quoteConsentStatus/quoteConsentApprovalUri/repostSourceId와 applyPostQuoteConsent를 사용한다.
- 검증 전에 상태·승인 URI·Source 관계 및 Quote/Source identity를 캡처하고 같은 snapshot으로 CAS한다.
- 새 입력의 invalid/unverified 증거는 PENDING이다. REJECTED는 명시적 거절이며 REVOKED는 현재 issuer 증거 없이는 복구하지 않는다.
- 같은 URI와 다른 URI 모두 현재 issuer Authorization으로 재승인 가능하다. 승인서 Delete는 현재 grant를 다시 확인한다. 일시적인 조회 실패는 retry한다.
- 미해결 targetUri, format, candidate approvalUri와 expected snapshot은 Workflow 입력에 둔다. 새 durable revision/identity/receipt는 없다.
- Post별 Workflow는 signal을 받고 candidate별 retry를 보존한다. Source 연결 결과의 새 snapshot을 다음 retry에 사용한다. stale 입력은 CAS에서 종료한다.
- 기존 main의 consent-aware Source 노출 경계를 재사용한다. Post lifecycle, Source 가용성과 viewer ACL은 독립적으로 유지한다.
- Public/Unlisted Source materialization은 기존 경계를 재사용한다. 신규 private Source admission은 child PROD-793이 담당한다.

## Migration 및 rollout

공통 consent의 additive migration과 Source index가 먼저 적용되어야 한다. 별도 AP Quote table은 runtime schema와 참조에서 제거했다.
과거 migration 파일은 적용 이력이 확인되지 않아 임의 재작성하거나 DROP하지 않았다. 배포 자동화는 main을 대상으로 하지만 운영 DB/history를 직접 확인한 것은 아니다.
이전 revision 기반 Workflow가 운영에 존재하는지 배포 전 확인해야 한다. 존재한다면 그 실행을 새 입력으로 조용히 처리하지 않고 호환 전환 또는 drain을 별도로 검증한다.
이번 작업은 코드·PR 대응이며 production migration 적용·배포의 완료 증거가 아니다.

## 검증

실제 Fedify proof, third-instance/no-Request, 같은 URI 재승인/오래된 Delete, CAS 경쟁, 본문·관계 보존,
Workflow retry·signal 경쟁·한도 종료와 API Source ACL 회귀를 현재 HEAD CI에서 확인한다.
검증 결과는 PR과 CI가 소유하며 과거 HEAD의 성공을 재사용하지 않는다.
