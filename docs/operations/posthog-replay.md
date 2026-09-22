# PostHog Session Replay 운영 경계

[PROD-741](https://linear.app/byulmaru/issue/PROD-741)은 조건 충족 후 Web Session Replay 재활성화와 Post Media Viewer 검증을 담당한다. PR #955 이후 Product Analytics는 활성화됐지만 Replay는 비활성 상태다. 2026-09-22 Spec 보강 요청은 아래 검증·인계 절차를 정하며 실제 활성화나 배포 승인이 아니다.

## Spec Gate, PR Ready Gate와 Replay Rollout Gate

`Spec Gate`는 요구사항·범위·미결정 사항이 정리돼 구현을 시작할 수 있는지 판단한다. `Replay Rollout Gate`는 **“production에서 Session Replay를 실제로 재활성화해도 되는가?”**를 판단하는 PROD-741의 rollout checkpoint다. PostHog의 기능명이 아니며 Cloud 값을 설정하는 작업 하나만 뜻하지 않는다.

Replay Rollout Gate의 입력은 수용된 privacy baseline, 아래 네 Cloud 설정의 실제 값, masking·장애 격리의 사전 검증, 재활성화 코드·대상 버전·배포 및 rollback 준비다. Human-required Cloud 확인은 이 입력을 확보하는 절차 중 하나다. Spec Gate PASS여도 Replay Rollout Gate가 pending이면 실제 Replay를 켜지 않는다. Gate PASS 후에도 production 배포는 [기존 release 절차](./production-release.md)를 따른다. 활성화 후 실제 Replay acceptance는 별도로 완료해야 한다.

2026-09-22 사용자가 확정한 `PR Ready Gate`는 A Implement 완료, C Review 완료와 unresolved finding 0건, Review Gate PASS, 필요한 코드·PR CI PASS를 조건으로 한다. 최신 main 기준 Stack 정합성까지 확인되면 PR을 Ready for review로 전환한다. B의 Cloud screenshot 확인, Operational Verification, Replay Rollout Gate, production Replay 활성화와 실제 Replay acceptance는 PR Ready Gate의 blocker가 아니다.

PR Ready 전환은 merge·auto-merge·queue·production 배포·Replay 활성화 승인이 아니다. B의 운영 검증과 Replay Rollout Gate는 별도 책임으로 유지하며, 실제 활성화와 production acceptance는 최신 HEAD와 배포 버전의 대응을 확인한 뒤 기존 절차에 따라 수행한다.

## 확정된 privacy baseline과 Viewer

2026-09-22 사용자는 결정 당시 `main`(`8650253d7cfaea3cab94f35d318d381c838af6c9`)의 개인정보처리방침 상태를 PROD-741의 완료된 privacy baseline으로 수용했다. 과거에 같은 결정이 있었는지는 더 이상 blocker가 아니다. 이는 개인정보처리방침의 법적 완결성을 새로 판단한 것이 아니라, PROD-741이 PROD-795의 정책·고지 책임을 재감사하거나 수정하지 않는다는 범위 결정이다.

같은 요청에서 사용자는 Storybook `KOSMO/Patterns/Post/Catalog`의 `Post Media Viewer Compact`와 `Post Media Viewer Wide`를 직접 보고 PROD-741의 검증 대상이 맞음을 확인했다. 두 입력은 완료됐으므로 Implement 진입을 위해 다시 확인받지 않는다. Cloud 실제 값과 코드·배포 준비는 별도 입력이므로 Replay Rollout Gate는 pending으로 유지한다.

## 남은 두 세션의 책임

남은 작업은 아래 두 별도 세션으로만 진행한다. 추가 Test·Review·운영 대기 세션을 필수 단계로 만들지 않는다.

| 세션                        | 소유 범위                                                                                                                                                                                                  | 완료·인계 경계                                                                                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A. Implement — Luna Max     | runtime 코드 구현, 앱 소유 analytics config·identity·동기 fail-open·Post Content marker 자동 테스트, typecheck/lint/build, handoff                                                                         | 코드와 자동 검증을 마치면 B에 결과·대상 버전·남은 운영 항목을 인계하고 종료한다. Cloud screenshot·실제 설정 판정/변경·Replay Rollout Gate 최종 판정·실제 재활성화·실제 Replay 시각 검증을 수행하거나 기다리지 않는다.    |
| B. Operational Verification | 코드 구현 외 남은 운영·실환경 검증 전부: Cloud screenshot과 네 실제 값, 불일치 조치 안내, Rollout Gate, PASS 후 재활성화 절차, 실제 Replay·SDK journey·Viewer·masking·제품 장애 격리 acceptance, 최종 증거 | PROD-741 자체의 최종 acceptance를 정리한다. Human-required 조치는 정확한 대상·행위·기대 결과를 요청하고 사용자가 수행하거나 명시적으로 승인하기 전에는 완료 처리하지 않는다. 승인 후에도 실제 실행·검증 증거를 확보한다. |

A의 완료는 PROD-741 전체 완료나 Replay Rollout Gate PASS가 아니다. B에서 구현 결함이 발견되면 같은 A 세션으로 보완 책임을 돌리고 B를 재개한다. 코드 보완을 위한 세 번째 세션을 필수로 추가하지 않는다.

## A. Implement checkpoint (2026-09-22)

A는 `apps/app/src/analytics/client.web.ts`의 명시적 `disable_session_recording` 차단을 제거하고 기존 analytics adapter의 표준 이벤트·identity·Native no-op·fail-open 경계를 유지했다. 자동 검증은 앱이 소유하는 초기화 config·identity 전환·동기 SDK 예외 격리와 canonical Post Content의 `ph-mask ph-no-capture` DOM marker에 한정한다.

SDK recorder의 내부 bundle 경로·압축 payload·rrweb snapshot 구조와 기본 masking은 자동 테스트에서 재검증하지 않는다. 실제 recorder 전송·input/textarea 및 Post Content masking·autocapture 제외·recorder/network 장애 격리는 B의 Operational Verification에서 확인하므로 Replay Rollout Gate는 계속 pending이다.

## Human-required: Cloud 실제 값 확인

Operational Verification 세션은 실제 Replay 재활성화 직전에 반드시 멈춘다. Implement는 이 절차를 수행하지 않고 B에 인계한다. Codex가 해당 시점의 UI 경로와 캡처할 항목을 구체적으로 안내하면, 사용자가 `Kosmo Production` 프로젝트의 **저장된 설정 화면 screenshot**을 제공한다. Codex는 이미지를 직접 읽어 현재 값과 기대값을 대조한다. PROD-820 Done, 문서, 기본값이나 과거 screenshot만으로 통과시키지 않는다.

| 항목                    | 기대값                                          | 그 시점에 안내할 캡처 화면                                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Session Replay sampling | 10%                                             | Session Replay → Settings → recording/ingestion controls의 sample rate. Trigger groups가 있으면 모든 활성 그룹을 펼쳐 각 sample rate와 조건을 포함한다.                                                            |
| recording 대상          | production canonical origin `https://kos.moe`만 | 같은 화면의 URL 조건, 전체 활성 trigger groups와 ANY/ALL 결합 방식. 별도 Authorized domains가 있으면 함께 캡처한다. URL 한 줄만으로 제한을 판단하지 않는다.                                                        |
| input masking           | Normal                                          | Project Settings → Session Replay의 privacy/masking 영역에서 선택된 mode와 input·textarea 보호 설정을 캡처한다. UI가 Normal 명칭을 제공하지 않으면 동일하다고 추정하지 않고 실제 보호 옵션의 근거를 추가 요청한다. |
| retention               | 30일                                            | Project Settings → Session Replay → Data retention에서 저장된 30일 값. 변경했다면 저장·확인 후 화면과 적용 시점을 확인한다.                                                                                        |

공식 문서의 [replay ingestion 설정 진입점](https://app.posthog.com/replay/settings#selectedSetting=replay-triggers), [retention 설정 진입점](https://app.posthog.com/settings/project-replay#replay-retention)을 참고하되, 실제 프로젝트·리전과 당시 UI를 확인해 안내한다. 프로젝트명, 설정 영역과 값이 보이도록 캡처하고 확인 시점을 함께 남긴다. 키·사용자 목록·실제 콘텐츠는 제외한다.

화면에 값이나 조건 전체가 없으면 미확인으로 남긴다. 부족한 항목을 특정해 추가 화면 또는 사용자가 제공하는 해당 프로젝트의 저장된 설정 API 응답·관리자 설정 내보내기에서 관련 필드만 추린 증거를 요청한다. 예를 들어 sampling·trigger groups·masking config·retention의 실제 저장값이 필요하며, API 키·토큰은 공유하지 않는다. retention은 서버 설정 증거가 필요하며 SDK config만으로 대체하지 않는다. 저장된 설정과 클라이언트 적용이 다른지 확인해야 한다면 선택한 배포 버전이 받은 remote config를 별도로 대조한다.

불일치 또는 미확인 항목은 **현재 값(미확인이면 그 이유), 기대값, 사람이 해야 할 조치, 미조치 시 pending인 Replay Rollout Gate 입력**으로 보고한다. 사용자가 콘솔에서 수정·저장한 뒤 새 screenshot을 제공하고 Codex가 다시 대조하기 전까지 통과 처리하지 않는다. 설정 변경이 필요하면 사람이 해야 할 정확한 조치를 요청한다. 사용자 수행이나 해당 행위의 명시적 승인 없이 실행·완료 처리하지 않으며, 승인만으로 실제 설정값 검증을 대신하지 않는다. 설정 screenshot은 실제 녹화·masking·비대상 origin 미전송을 증명하지 않으므로 아래 acceptance를 별도로 수행한다.

## Replay acceptance와 장애 경계

- 합성 데이터만 사용한다. 실제 사용자 개인정보·실제 사용자 콘텐츠를 입력하거나 검증용 session에서 열지 않는다.
- 일반적인 route navigation과 Viewer 열기·이미지 전환·닫기를 하나의 session replay에서 정상적으로 기록·재생한다. SDK의 기존 pageview·pageleave·autocapture가 같은 journey에 연결되는지 실제 Replay와 이벤트 결과를 대조한다. Viewer 내부 이미지 전환은 route navigation이 아니며 이를 위한 별도 pageview나 앱 소유 analytics emitter를 추가하지 않는다.
- synthetic input과 textarea에 서로 구분되는 테스트 문자열을 입력하고 실제 Replay에서 내용이 masking되는지 확인한다. canonical Post Content의 `ph-mask` 보호는 실제 recorder 전송·Replay에서 원문이 노출되지 않는지, `ph-no-capture` 보호는 실제 autocapture 결과에서 해당 subtree가 제외되는지 각각 확인한다. DOM marker 존재만으로 완료하지 않는다.
- 10% sampling과 30일 retention은 실제 설정값으로 확인한다. 작은 표본의 녹화 비율로 설정을 추정하거나 표본 확보를 위해 production sampling을 100%로 바꾸거나 강제 recording으로 조건을 우회하지 않는다. 비대상 origin의 실제 Replay 미전송도 확인한다.
- **PostHog는 제품 기능의 성공 조건이 아니다.** Replay initialization·recorder load·upload 실패와 analytics 전송 실패를 각각 재현하고 Viewer 열기·이미지 전환·닫기, route navigation과 관련 제품 기능이 계속 정상 동작하는지 별도 acceptance로 검증한다. 녹화·전송 실패가 제품 기능의 실패·차단·대기로 전파되지 않아야 한다. 실패가 발생했다는 증거와 제품 성공 결과를 함께 남긴다.
- PROD-540 opt-out이 배포됐다면 그 선택이 Replay에도 적용되는지 확인한다. 미배포면 그 상태를 기록하고 새 opt-out UI를 추가하지 않는다.

보호 실패 시 acceptance를 완료하지 않고 Replay 비활성화를 유지하거나 기존 release 절차로 되돌린다. 실제 재생은 활성화 후 검증이므로 사전 Gate PASS를 이 검증의 성공으로 기록하지 않는다.

## PROD-741 최종 acceptance와 historical evidence

A는 B에 코드·자동 검증 결과를 인계한다. B는 privacy baseline 수용과 Viewer 확인의 현재 결정, 네 Cloud 실제 값의 비교·시점, Rollout Gate 판정, source·배포 버전, 실제 재활성화·표본 재생·장애 격리 결과, 필요한 Human-required 조치의 수행·승인과 실행 증거를 PROD-741에 정리한다. 필수 결과가 미확인·실패면 PROD-741 최종 acceptance는 pending이다. 실제 Account ID·프로젝트 키·사용자 콘텐츠·원본 녹화 payload는 복사하지 않는다.

2026-09-22 연결된 [Linear PROD-575](https://linear.app/byulmaru/issue/PROD-575)를 identifier와 UUID로 재조회한 결과 담당자는 Jiyu Park, 상태는 Todo, completedAt은 null, updatedAt은 2026-09-02였다. 사용자가 설명한 완료 상태와 차이가 있으며, 완료 기록이나 완료 당시 PROD-741에 남긴 책임은 확인하지 못했다. 본문의 과거 포함 범위·완료 조건은 PROD-741 Viewer replay acceptance를 선행 입력으로 적고 있지만 완료 증거는 아니다. 댓글 3개도 8월의 계획·계약 정정 기록이다.

연결된 [PR #404](https://github.com/byulmaru/kosmo/pull/404)는 Jiyu Park가 작성해 2026-07-30 병합한 PROD-469의 OpenPanel Web runtime·이벤트/identity·Replay masking·개인정보/운영 문서 구현이다. 본문에 배포 후 dashboard·Replay masking 확인이 남아 있어 이 PR로 PostHog production acceptance나 PROD-575 완료를 증명하지 않는다. 저장소의 두 analytics change도 현재 active 경로에 있으며 archive 완료를 추정하지 않는다.

이 관측 차이와 무관하게 현재 사용자의 책임 결정에 따라 PROD-575로의 향후 인계·후속 최종 production acceptance·미래 OpenSpec archive 의존성은 제거한다. PROD-575를 재개하거나 본문·상태를 수정하지 않는다. 위 자료는 확인된 범위의 historical prerequisite/evidence로만 사용한다. PROD-741의 최종 acceptance는 B가 이 이슈 안에서 소유하며 공유 OpenSpec 정리는 완료 조건이 아니다.

PROD-820의 Cloud 최초 구성과 PROD-795의 정책·고지 책임을 인수하지 않는다. 새 Storybook story, recorder 재구현, custom selector 정책, Post visibility·Media authorization 변경, Native Replay와 과거 녹화 이관은 제외한다. Search `q`·click metadata 등 표준 이벤트 수집 정책은 유지한다.

기술 근거: [PostHog privacy controls](https://posthog.com/docs/session-replay/privacy), [recording controls](https://posthog.com/docs/session-replay/how-to-control-which-sessions-you-record), [recording retention](https://posthog.com/docs/session-replay/recording-retention). 공급자 문서는 서비스의 수집 범위를 추가하는 권위가 아니다.
