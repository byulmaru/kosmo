## 1. PROD-929 처리된 오류 수집 경계

**Authority / Provenance**

- `docs/operations/sentry.md`
- `PROD-483`
- `PROD-493`
- `PROD-929`

**Deliverable**

Web과 Native 앱이 기존 Sentry runtime 정책을 유지하면서 승인된 처리된 오류를 현재 플랫폼 SDK에 전달할 수 있다.

**Guardrails**

- 기존 DSN·environment·release metadata gate와 local·test 외부 비전송 동작을 유지한다.
- 기존 처리되지 않은 React 오류 경계와 component-level 오류 context 전달을 대체하지 않는다.
- 입력 오류의 SDK 진단 정보와 호출 경계가 제공한 안전한 context를 전역에서 임의로 삭제·재작성하지 않는다.
- Sentry 수집 실패가 원래 호출 흐름을 바꾸지 않는다.

**Verification**

- 활성화된 Web·Native runtime의 SDK 전달과 metadata가 불완전한 local·test runtime의 비전송을 실행 테스트로 검증한다.
- 오류와 안전한 context의 보존, SDK 호출 예외 격리와 기존 React reporter 동작 보존을 실행 결과로 확인한다.

- [x] 1.1 기존 Web·Native Sentry runtime gate를 유지하면서 처리된 오류 전달 동작을 구현한다.
  - Evidence (2026-09-09): Web·Native 처리된 오류 및 기존 Web 설정 행동 테스트 10/10 통과.
- [x] 1.2 활성화·비활성화 runtime, 진단 보존, 수집 실패 격리와 기존 React 오류 경계를 검증하는 행동 테스트를 추가하고 관련 check를 통과시킨다.
  - Evidence (2026-09-09): 관찰성 focused test 10/10 통과, `pnpm --filter @kosmo/app test:unit` 503/503 통과, `pnpm --filter @kosmo/app exec tsc --noEmit` 통과.

## 2. PROD-929 공통 이미지 업로드 실패 관측

**Authority / Provenance**

- `docs/operations/sentry.md`
- `docs/design/media-upload-errors.md`
- `PROD-929`

**Deliverable**

Post Composer와 Local Profile의 공통 이미지 업로드 실패가 실패당 한 번 관측되고, 기존 업로드 결과와 사용자 복구 흐름이 유지된다.

**Guardrails**

- issue·transfer·complete의 기존 lifecycle과 `stage`·`reason` 분류를 유지한다.
- consumer별 중복 capture를 추가하지 않으며 성공·비활성 항목·명시적 no-op은 실패 event를 만들지 않는다.
- 실제 Error 객체와 message·stack·cause를 직접 또는 기존 UI 분류 wrapper의 표준 cause chain으로 보존한다. 원본 연결 없는 수집 전용 placeholder를 사용하지 않는다.
- 이미지 byte, File/Blob, signed upload URL, 인증 토큰, raw request/response와 사용자 콘텐츠를 오류나 새 context에 별도로 첨부하지 않는다. SDK 원본 Error는 data/blob/file URI를 포함해 수정 없이 보존하며 URI 치환·필드 변경·복제를 하지 않는다.
- operation은 `issue`·`normalize`·`read`·`put`·`complete` 중 하나로 구분하고, 공통 업로드 경계에서 직접 확인할 수 있는 normalized-image read/PUT 응답이 있는 경우에만 숫자 status와 승인된 machine code allowlist 값만 포함한다.
- capture 실패가 오류 UI, 실패 항목 보존, 재시도 또는 성공 결과를 바꾸지 않는다.

**Verification**

- issue·transfer·complete 실패와 성공·no-op의 capture 횟수, 안전한 `stage`·`reason`, 기존 오류 결과를 실행 테스트로 검증한다.
- 내부 catch를 포함한 원본 Error identity·message·stack·cause 보존, 두 consumer의 중복 capture 방지와 새 context에 금지된 입력을 별도로 첨부하지 않는지 행동 검증으로 확인한다.

- [x] 2.1 공통 이미지 업로드 실패 경계에서 최종 분류 오류를 한 번 관측하고 consumer의 기존 UI 처리와 lifecycle을 유지한다.
- [x] 2.2 단계별 실패·성공·no-op·capture 실패 격리·privacy 경계와 consumer 중복 방지를 검증하는 행동 테스트를 추가하고 관련 check를 통과시킨다.
- [x] 2.3 PR #810 사용자 정정: 내부 catch와 UI 분류 wrapper에서 원본 cause를 보존하고 수집 전용 placeholder를 제거한 뒤 identity·message·stack·cause 및 제한된 context를 검증한다.
  - Evidence (2026-09-09, 사용자 정정 후): direct upload/error tests 44/44, app unit tests 515/515 통과. issue·normalize·read fetch·Blob read·PUT·complete의 원본 Error 및 cause chain, non-Error cause, 알려진 Expo 이미지 URI만 제한하는 동작과 URI 유무에 따른 Canvas SecurityError identity 보존을 검증했다. app TypeScript·변경 app 파일 ESLint·main spec strict validation·git diff check 통과. 아래의 Storybook 증거는 정정 이전 실행 결과이며 이번 수정에서 Storybook·운영 수신을 다시 검증했다고 주장하지 않는다.

- [x] 2.4 PR #810 최신 사용자 정정: URI 치환 루프를 삭제하고 URI 포함 Error·frozen Error·DOMException을 수정 없이 보존하는지 검증한다.
  - Evidence (2026-09-09, URI 치환 제거 후): direct upload/error tests 44/44, app unit tests 515/515, app TypeScript·변경 app 파일 ESLint·Prettier·main spec strict validation·git diff check 통과. data/blob/file URI를 포함한 frozen Error와 cause chain, URI 유무에 따른 DOMException의 identity·message·stack 보존을 확인했다. 2.3의 URI 제한 증거는 이전 구현의 이력이며 최신 계약은 이 정정 결과를 따른다.

## 3. PROD-929 문서와 구현 handoff 정합성

**Authority / Provenance**

- `docs/operations/sentry.md`
- `docs/design/media-upload-errors.md`
- `PROD-929`

**Deliverable**

처리된 업로드 관측 계약과 구현·검증 범위가 canonical 문서, OpenSpec 산출물과 일치하며 운영에서 구현 검증과 실제 event 수신 검증을 구분한다.

**Guardrails**

- OpenSpec은 canonical 문서나 Linear 승인 대신 사용하지 않는다.
- 실제 운영 Sentry event·release·symbolication 증거를 로컬 구현 검증의 완료 증거로 주장하지 않는다.
- Media Worker request ID·구조화 로그, 업로드 원인 수정과 운영 배포는 이 변경에 포함하지 않는다.

**Verification**

- OpenSpec 형식·상태 검증과 문서 diff 검토를 수행한다.
- 구현 check 결과와 운영 검증 보류 항목을 PR에 분리해 기록한다.

- [x] 3.1 canonical Sentry·이미지 업로드 문서와 구현 변경의 처리된 실패 범위, privacy 경계와 제외 범위를 동기화한다.
- [x] 3.2 OpenSpec·문서 정합성 검사와 PR 범위 검토를 통과시키고, 미검증 운영 증거를 별도 follow-up으로 남긴다.
  - Evidence (2026-09-09): baseline SHA `1bb02f04c9d46f8958c9ec845e04e139d9a6dad3`와 current checkout에서 각각 `pnpm --filter @kosmo/app test:storybook`를 실행해 96 files/681 tests, exit 0을 확인했다. 별도 baseline worktree와 current checkout에서 `pnpm --filter @kosmo/app exec vitest run --project=storybook src/stories/patterns/PostMediaViewer.tests.stories.tsx src/stories/patterns/Posts.stories.tsx`를 각각 실행해 2 files/109 tests, exit 0을 확인했다. 초기 6개 Storybook assertion failure는 양쪽 targeted/full 재실행에서 재현되지 않아 PROD-929 attributable regression이 아닌 unverified transient로 분류했다. `openspec validate add-handled-upload-observability --strict --no-interactive`와 `git diff --check`도 통과했다. 실제 운영 Sentry event·release·symbolication 수신은 구현 check와 분리된 배포 후 follow-up으로 남긴다.
