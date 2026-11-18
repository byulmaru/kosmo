# PROD-924 PR 계층 검증

통합 기준은 `3122940aa`이며, 이 기준의 통과 결과를 분리 계층의 통과로 재사용하지 않는다.
재구성 기준 main은 `e15787c41f929dde416e486adf9b424d31719fce`, 병합 #1094는 `7248b8f27dc8a9bbefbb2cbae9139bf54883bee4`다.
원격 #961 head는 `2d2d231154f17531ca23a3c912b4e14b6d756f8f`, #940 head는 `6a2f1b682bb7f53edfcdd6a3d7e0bb2a31e7bbcb`다.
두 원격 PR의 base ref는 main이며 API가 보고한 base OID는 각각 `22bf28a4a7`, `29dc3cd051`이다.
이는 현재 main ref를 재조회한 SHA와 다르므로 실제 하위 후보 검증 base에는 위의 최신 main을 사용한다.

## 분리 경계

하위 #961은 common consent model·Source lookup index를 유지하며 Quote owner, inbound proof/reconciliation,
Source 잠금 및 atomic bulk 철회를 제공한다. 기존 Local create/delete의 직접 consent writer는 공통 owner bridge로
연결한다. native Local Source 작성 계약과 원격 Source 작성 거부는 유지하며 정책 enum/column은 추가하지 않는다.
상위 #940은 그 bridge 위에서 원격 Source 작성·정책·API admission·Composer 및 Source local orchestration을 확장한다.
#940은 #961 없이 적용 가능한 PR이 아니다. 두 계층의 공유 DTO·registry·service·protocol projection은 기능 hunk로 나눈다.

## 운영 검증 경계

최신 main의 실제 migration 이력 60개를 적용한 격리 PostgreSQL에서 하위 migration을 실행하고 이력 불변,
폐기된 activitypub_post_quote 부재, 두 consent 컬럼 및 멱등 재실행을 확인했다.
구형 young_mercury migration이 운영 이력에 이미 존재한다면 이 파일을 제외한 tree의 history Gate가 실패한다.
운영 이력은 미확인이며, 이 경우 history를 삭제하는 우회는 허용하지 않는다.

로컬 production bundle replay·SDK shutdown·owner finish/drain·CAN·새 Run bootstrap과 실제 production history
replay·구형 writer fleet drain은 별도 근거다. 운영 Temporal namespace는 kosmo-prod, retention은 30일이다.
이번 작업에서 운영 cluster/history/DB 이력은 조회하지 않았다. 강제 Terminate의 Query 통과 후 늦은 commit,
외부 exactly-once 및 Source/Quote 외부 delivery 전체 순서는 보장하지 않는다.

## 실행 기록

각 계층의 고정 head와 최종 aggregate 결과는 상위 재구성 완료 시 이 기록에 추가한다. 로컬 checkpoint의 pending
실행을 PASS로 취급하지 않는다. CI Ubuntu ARM runner·원격 CI 및 production 검증과 로컬 실행을 구분한다.

### 하위 #961 새 실행 결과

재구성된 최신 main + #961 패킷에서 실제 명령을 실행했다. 통합본의 결과를 복사하지 않았다.

| Gate                                                | 결과                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| Core `pnpm --filter @kosmo/core test`               | unit 110/110·migration 19/19·smoke·service 256/256 PASS, exit 0                   |
| API `pnpm --filter @kosmo/api test`                 | unit 44/44·integration 346 PASS/1 SKIP, exit 0                                    |
| Worker `pnpm --filter @kosmo/worker test`           | unit 10·workflow 42·DB 69·migration 21·Quote 41 = 183/183 PASS, exit 0            |
| Fedify `pnpm --filter @kosmo/fedify test`           | unit 355/355(protocol 7 포함)·Consumer build/tsc·1/1 PASS, exit 0                 |
| Composer E2E `test:e2e:database e2e/compose.e2e.ts` | 실제 5개 서버, 12/12 PASS, exit 0                                                 |
| main → #961 migration                               | history 60개 불변·폐기 테이블/새 policy 컬럼 부재·멱등 재실행 PASS                |
| local history replay                                | production Workflow bundle로 fresh Run replay·DB consent/source/content 불변 PASS |

API의 외부 Media Storage Service 테스트 1건은 환경 미설정으로 skip했다.
최초 Core 실패 3건은 상위 policy/remote-Source 작성 테스트가 하위에 들어간 범위 오류였다.
이를 분리하고 하위의 기존 원격 Source 작성 거부 및 remote Reject CAS를 보존했다(focused 31/31).
최초 API 실패 3건은 legacy effects-only start spy였다. 실제 owner admission 실패의 ACTIVE/GraphQL error,
Source owner history의 Activity와 cached Update 및 완료 후 재요청의 tombstone/deletedAt/content 불변을
검증하도록 정렬했다(focused 56/56). 단일 Run의 effect 횟수와 새 Run terminal effect 복구를 혼동하지 않는다.
최초 Worker startup은 30초 fixture timeout이었다. 실제 정상 entrypoint 계측 23.5초·단독 29.3초를 확인한 뒤
테스트 deadline만 120초로 맞췄다. 제품 timeout과 종료 처리는 변경하지 않았다.

로그는 `/private/tmp/prod924-lower-core-final.log`, `prod924-split-lower-api-final.log`,
`prod924-split-worker-aggregate.log`, `prod924-lower-fedify-full.log`, `prod924-lower-compose-e2e.log`,
`prod924-lower-migration-transition.log`, `prod924-split-lifecycle-replay.log`에 있다.
최초 최종 lint에서 상위 테스트 분리 후 남은 unused import 3건을 확인해 제거했다.
전체 root 및 recursive lint/typecheck를 이 정렬 후 새로 실행해 exit 0을 확인했다.
