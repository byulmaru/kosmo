# Quote Stack 최신 main 통합 검증

대상은 Stack #1149 `main → #961 (PROD-792) → #940 (PROD-924) → #962 (PROD-793)`이다.
`df704d45d`, `a16d8a68e`, `fd00aeb14`를 보존하고 main `0b450209c44ec3cbe90ae8077dcb04d428b50dd0`을 아래부터 merge했다.
기존 PR·리뷰·사용자 변경을 보존하며 rebase/force push·PR merge·production 배포는 수행하지 않는다.

## 변경과 충돌

- #961: main의 Account 알림 snapshot·fanout·migration을 유지했다. 알림 fixture 충돌 4개는 typed Mention 입력, Account별 수신자와 중복 방지를 함께 보존했다.
- main의 새 `PROFILE_LIMIT_EXCEEDED` 오류를 Post transition 결과에서 복원하고 행동 테스트를 추가했다. 자동 병합된 새 Post Account 테스트의 기존 import 별칭도 수정했다.
- Quote timeout 회귀에 실제 Account를 넣어 늦은 commit/재제출 뒤 `actorAccountId` 유지와 Account payload 변경 거절을 검증했다.
- #961 Local Source URI는 actor 행과 독립적으로 공통 `resolveActivityPubPostUri`를 사용한다. Local actor 유무, 원격 URI 보존과 미해석 URI 종료를 실제 inbound 흐름에서 검증했다. 새 Local 사례는 LEGACY Quote이며 새 FEP 승인·철회 전체 재현으로 확대하지 않는다.
- #940는 하위 merge를 충돌 없이 통합했다. Quote resolver의 공통 admission, 작성 Profile 변경 정책 초기화와 키보드 focus 처리를 유지했다.
- #962의 import 충돌은 private Source 코드와 URI helper를 함께 유지했다. 삭제된 Reply Parent에 한해 동일 Post ID·outer transaction/savepoint에서 Parent 없이 재저장한다. Block·Media·Follower·Source winner·fence/CAS 실패는 전파한다.
- 새 DB 컬럼·consent 상태는 이 수정에 추가하지 않았다. main에 이미 추가된 migration은 그대로 통합했다.

## 실제 재현과 결과

수정 전 일반 작성/Quote의 30초 deadline → 늦은 commit → 새 identity 재제출은 실제 Temporal·PostgreSQL에서 각각 Post 2개를 만들었다. 상세 원본은 [admission 검증](quote-create-admission-2026-10-18.md)에 기록했다.
일반 작성은 직접 저장으로 복구해 이 Workflow 대기 경계를 제거했다. 일반 작성의 HTTP 응답 유실 중복까지 해결한 것은 아니다.

Quote는 같은 admission의 실행 중 Update 연결과 완료 결과 회수를 사용한다. 최신 main 통합 후 31초 gate를 둔 timeout 재현에서도 Post/Content 각 1개와 기존 Account snapshot을 유지했다.
Profile·Account·본문·Source·Media 변경 거절, Worker 교체, Activity completion 유실, distinct identity, history 소실 뒤 동일 ID 회수 또는 안전한 거절, Source 삭제 경쟁도 통과했다.
private Parent 두 삭제 사례는 수정 전 실패했고, 수정 후 승인·Source 연결·Parent null·Content/Media 단일 저장이 통과했다. Block과 잘못된 Media는 계속 거절된다.

| 검증                                   | 결과                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------- |
| #961 Core                              | unit 122 + 새 오류 테스트 1 / migration 23 / smoke / 서비스 280 PASS        |
| #961 Worker 전체 명령                  | 228 PASS (10 unit + 44 Workflow + 99 DB + 21 migration Activity + 54 Quote) |
| #940                                   | schema / Relay·TypeScript / Composer unit 23 PASS                           |
| 최상위 Core 전체 명령                  | unit 123 / migration 23 / smoke / 서비스 281 PASS                           |
| 최상위 API 전체 명령                   | unit 44 / integration 374 PASS, 외부 Media Storage 1 skip                   |
| 최상위 Fedify 전체 명령                | 382 + standalone consumer 1 PASS                                            |
| 최상위 Quote owner 전체 그룹           | 72 PASS (private Parent 4개 신규 경계 포함)                                 |
| 최상위 Composer Storybook              | Posts·Composer 157 PASS                                                     |
| 최상위 Worker typecheck·전체 root lint | PASS                                                                        |
| 최상위 Web E2E 전체                    | 191 PASS (10.1분)                                                           |

하위 Worker 전체와 상위 Quote 그룹은 별도 실행이다. 최상위 Worker 전체 명령 한 번의 성공으로 표현하지 않는다.
각 DB 실행은 `COMPOSE_PROJECT_NAME=kosmo node scripts/test-db.mjs run -- ...`로 격리했다. E2E는 `KOSMO_TEST_PORT_OFFSET=1000`으로 기존 개발 서버와 분리했다.

## 남은 운영 경계

- 실제 production history export/replay와 구형 writer admission 차단·Activity·DB session·process drain은 별도 배포 Gate다. SDK shutdown은 owner finish/drain이 아니다.
- 강제 Terminate/Reset은 이미 fence를 지난 commit을 취소하지 못한다. 정상 finish/drain 절차와 운영 복구 범위를 유지한다.
- 영구 admission receipt 저장은 추가하지 않았다. 오래된 identity의 결과가 소실되면 새 Post를 만들지 않고 거절한다. 수정·삭제된 Post의 DB fallback도 fail-closed한다.
- Composer identity는 현재 작성 context의 초안과 함께 유지된다. 앱 종료를 넘는 영구 draft/admission 저장은 추가하지 않았다.
- 일반 작성의 응답 유실과 commit→effects 시작 사이 process 종료 간격, 외부 Push·ActivityPub의 at-least-once 전달은 기존 제한이다.
- 외부 Media Storage skip은 실제 해당 서비스 검증이 아니며 Native 기기·production 동작 검증도 수행하지 않았다.
- 원격 CI와 리뷰 결과는 각 PR의 최신 head에서 별도로 확인한다. 과거 head CI나 로컬 테스트를 원격 CI 증거로 대체하지 않는다.
