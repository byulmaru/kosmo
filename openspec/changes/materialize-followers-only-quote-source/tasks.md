# PROD-793 진행

- [x] #1094 공통 모델을 사용하는 #961 위에 Stack 유지
- [x] 검증된 Source-author proof와 deterministic signer, signed fetch 유지
- [x] 동일 identity/Follow 재확인과 exact author/audience 검증 유지
- [x] Source 저장과 공통 consent CAS를 같은 transaction으로 연결
- [x] consent 경쟁 시 Source와 postCommit rollback 테스트 복구
- [x] signed fetch 일시 장애의 retry input 보존 테스트 추가
- [ ] 최종 HEAD 전체 CI를 확인하고 실패 수정
- [ ] PR과 handoff에 실행 결과 및 parent rollout 제한 기록

이 체크리스트는 canonical/Linear 요구사항을 추가하거나 재정의하지 않는다.
