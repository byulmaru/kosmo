## Session Work

각 항목은 PROD-556 구현 담당자가 맡는다. 이번 spec 세션에서는 코드·Cloud를 변경하지 않았다.
이 checklist는 수정 가능한 구현 제안이며 새로운 제품 요구사항이나 archive 승인 gate가 아니다.

- [ ] 1.1 현재 main·PROD-556·상위 PostHog 상태를 재확인하고 TagChip 진입부터 이탈·다른 Hashtag·Account 전환까지 `profile_tag_exploration_session_id` 관측을 연결한다. 확인된 GraphQL Hashtag Node ID를 `hashtag_id`로 고정한다. 실제 route·guard·새 탭·키보드 흐름에서 경계를 검증한다.
- [ ] 1.2 첫 목록 성공·empty·initial 실패·not-found·retry 회복·pagination·첫 선택을 관측한다. cache·network·재렌더·늦은 응답·중복 선택이 첫 결과와 Account 귀속을 바꾸지 않는지 실행으로 검증한다. 1.1 이후 수행한다.
- [ ] 1.3 `profile_tag_exploration_session_id`, `hashtag_id`와 고정 분류값의 typed custom allowlist, Web fail-open과 Native no-op을 검증한다. 같은 Hashtag의 ID 안정성·다른 Hashtag 분리·UUID/타입 기반 identity·raw 이름과 Profile 정보 및 이름의 인코딩 대체값 부재를 실제 capture payload로 확인한다. not-found·확인되지 않은 ID 생략과 수집 누락, 기존 표준 metadata·identify/reset·Replay 상태 보존도 확인한다. 1.1~1.2와 함께 수행한다.
- [ ] 1.4 mock/stub/fault injection으로 A→B 전환의 reset 실패와 reset 성공 후 identify 실패를 재현한다. 이전 session의 마지막 event·새 session의 첫 capture 당시 SDK distinct identity·`$user_id`를 테스트에서 확인하고 정상 B 귀속과 대조한다. production 장애를 유발하거나 공용 fail-open·직접 capture 허용을 강화하지 않으며 별도 identity recovery system을 만들지 않는다. 귀속을 보장할 수 없는 경로와 지표 영향을 검증 결과·handoff에 기록한다. 1.1~1.3 이후 수행한다.
- [ ] 2.1 관측 시점의 인증을 증명하는 WAA와 session별 첫 결과·선택·종료 집계를 구현한다. 환경·제외 목록·중복·Asia/Seoul 주차·지연 수신을 검증한다. 일요일 오류→성공 없이 월요일 이탈과 일요일 오류→월요일 retry 성공을 독립 자료로 검증하고 최초 오류/성공 주 귀속·분모 0·종료 누락을 확인한다. 1.1~1.4 이후 수행한다.
- [ ] 2.2 초기 PostHog Insight·dashboard에 기존 전체 네 비율, 각 분자·분모, WAA, 기간·집계 시각·규칙·제외 목록 버전과 pagination 품질 항목을 연결한다. 합성 자료의 50%·100%·25%·25% 및 경계 자료를 실제 집계와 대조하고 저장 query·Insight·dashboard ID와 검토 책임을 기록한다. 2.1 이후 수행한다.
- [ ] 3.1 변경된 analytics·route·list·navigation 동작의 focused unit·Storybook·browser 검증, app check와 Web·Native export를 수행한다. 공용 계측 변경으로 생긴 회귀를 같은 범위에서 고친다. loopback 보호가 병합됐다면 실제 project 전송 없이 fake endpoint와 non-loopback 검증 경계를 구성한다.
- [ ] 3.2 PROD-795의 실제 개인정보·운영 선행 증거를 확인한 뒤 production 수집·custom payload·표준 metadata·dashboard를 대조한다. 관측 시작점, 제외 목록 관리, 종료 누락 등 한계와 주간 검토 책임을 개인정보 없는 증거로 남긴다. 2.2·3.1 이후 수행하며 선행 증거가 없으면 인수만 pending으로 남긴다.
- [ ] 3.3 구현·canonical·Linear·검증 결과를 대조하고 handoff와 PR에 실제로 남은 책임을 기록한다. 사용을 마친 하네스는 가능하면 같은 구현 PR에서 `--skip-specs`로 archive하되 별도 제품 완료 gate로 만들지 않는다.

## Verification Evidence

- Result: pending — 구현 검증 미착수. 이번 Spec 수정은 fault injection 테스트 구현·실행이나 실제 SDK 귀속 보장을 뜻하지 않는다.
- Checks: 관련 `node --experimental-test-module-mocks --import tsx --test`, Storybook·Playwright 실행, `pnpm --filter @kosmo/app check`, `pnpm --filter @kosmo/app export:web`, `pnpm --filter @kosmo/app exec expo export --platform android`, `pnpm --filter @kosmo/app exec expo export --platform ios`, 변경 파일 Prettier·ESLint, `git diff --check`.
- Limits: 실제 PostHog query·Insight·dashboard는 아직 없다. Spec validation과 구현·production 검증을 구분한다. Hashtag별 저장 Insight·dashboard는 범위 결정 대기이며 위 task에 승인된 작업으로 추가하지 않았다.

## Progress

- Status: Active
- Completed: Linear 관계·검색과 Hashtag identity 조사, 사용자의 명명·수집 계약 변경과 Review Packet P1·P2 수정 반영.
- Next: 한국어 윤문·계약 대조·strict validation 후 사용자 최종 검토, 별도 구현 세션으로 인계.
- Last updated: 2026-09-22
