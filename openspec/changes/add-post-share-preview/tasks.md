## Session Work

PROD-1107의 단일 전달 범위다. 1.1~1.4는 Implement 담당, 1.5~1.8은 구현자와 후속 Test 담당이 수행한다.
구현 수단은 현재 canonical·Linear의 결과를 만족하는 범위에서 조정할 수 있다.

- [x] 1.1 현재 canonical·Linear와 branch/HEAD를 재확인하고 guest 전용 Post 조회를 연결한다. Post global ID·작성자·현재 Content·순수 Repost의 직접 Source 선택을 검증한다.
- [x] 1.2 작성자·Plain Text·현재 revision의 Mention·Media 순서를 projection하고 CW·Sensitive Media·조회 불가·이미지 unavailable fallback을 적용한다. 1.1에 의존한다.
- [x] 1.3 빌드된 앱 shell을 보존하며 title·description·OG·Twitter Card를 중복 없이 생성하고 안전하게 인코딩한다. canonical origin·공개 이미지 URL·확인 가능한 속성을 검증한다. 1.2에 의존한다.
- [x] 1.4 지원 경로의 GET·HEAD와 Accept 분기를 연결하고 일시적인 DB 실패, 캐시·압축·validator와 기존 federation·BFF 응답을 처리한다. 1.3에 의존한다.
- [ ] 1.5 실제 DB fixtures로 guest 공개·삭제·Profile/Instance·Media 상태와 세션·User-Agent 불변성을 검증하고 실제 HTTP 응답을 파싱한다. Post·Reply·Quote·Repost, Mention·특수문자·복수 이미지와 가려진 정보의 응답 전체 비노출을 포함한다. 1.1~1.4에 의존한다.
- [ ] 1.6 이전 validator를 포함한 변경 후 재요청, 표현·Post·deployment 간 캐시 격리, 실제 federation의 Accept·인증·404/406 및 기존 GraphQL·로그인·정적 자산 회귀를 검증한다. federation mock만으로 실제 negotiation 검증을 대신하지 않는다.
- [ ] 1.7 브라우저 직접 상세 진입·순수 Repost canonical 이동과 인증 없는 공개 이미지 조회를 확인한다. 기존 Post 공유 E2E와 필요한 회귀를 유지한다.
- [ ] 1.8 허용된 공개 Post·테스트 공간에서 Slack·카카오톡·X의 실제 카드를 확인하고 서비스별 결과·차이·접근 제한을 기록한다. 최신 PR head의 필요한 CI와 코드·배포·외부 카드 증거를 구분해 PR과 후속 handoff에 남긴다.

## Verification Evidence

- Result: 1.1~1.4 구현과 1.5~1.7의 회귀 테스트 코드를 작성했다. DB 기반 E2E·실제 federation·브라우저 테스트 실행과 실제 카드 확인은 pending이다.
- Checks: 변경 파일 ESLint와 Prettier 검사를 통과했다. `apps/web/tsconfig.json`과 Core PostContent 테스트 파일을 TypeScript로 검사했다.
  표준 `pnpm --filter @kosmo/web check`는 clone에 의존성이 없어 자동 설치를 시도했지만 registry DNS `ENOTFOUND`로 중단했다.
  제품 테스트는 실행하지 않았다. 후속 Test phase에서 최신 PR head의 GitHub CI를 확인한다.
- Limits: Domain Block 모델·공통 정책 도입은 별도 범위다. 배포 origin·외부 이미지 접근·실제 카드는 미확인이다.
  공개 테스트 대상과 전송 공간의 권한을 확인한 뒤에만 외부 테스트 메시지를 보낸다.

## Progress

- Status: Active
- Completed: 최신 main 재정렬, guest Post 조회·projection·초기 HTML·GET/HEAD 처리와 focused regression test 코드 작성.
- Next: Draft PR 전달 후 Test phase에서 DB E2E·실제 federation·브라우저 검증과 최신 head의 GitHub CI를 확인한다. 1.8 서비스별 카드 결과는 공개 테스트 대상과 공간 권한 확인 뒤 수행한다.
- Last updated: 2026-10-14
