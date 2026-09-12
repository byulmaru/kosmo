# PROD-938 검증 기록

2026-09-12, `PROD-785`의 `4b9492767852d1933e6f25c9ca889bd5627bc712` 위 로컬 `PROD-938` 구현을 검증했다. API·DB·허용 Reaction Type은 변경하지 않았다.

## 자동 검증

| 실행                                                                 | 결과                                          |
| -------------------------------------------------------------------- | --------------------------------------------- |
| `pnpm --filter @kosmo/app check`                                     | Relay 생성·TypeScript 통과                    |
| `pnpm --filter @kosmo/app test:unit`                                 | 559개 통과                                    |
| `pnpm --filter @kosmo/app build-storybook`                           | 통과                                          |
| `pnpm --filter @kosmo/app test:storybook`                            | 124개 파일, 793개 테스트 통과                 |
| `pnpm test:e2e reaction-people.e2e.ts`                               | 분리된 테스트 DB와 번들 Chromium에서 3개 통과 |
| 변경 TS/TSX의 ESLint                                                 | 35개 파일 통과                                |
| 변경 파일의 Prettier·`git diff --check`                              | 통과                                          |
| `pnpm exec openspec validate move-reaction-people-to-route --strict` | 통과, 구현 task 10/10 기록                    |

- Summary Tests는 298·524px 목록 column과 390·600px 상세 row의 실제 너비, 표시 순서, 완전히 들어가는 token, 숨긴 Type 수, trailing link, 측정용 layer의 가로 넘침을 확인한다. 실제 `+N` 폭을 무시하면 실패하는 단위 입력과 all-fit 경계도 확인했다.
- Filter Tests는 독립 7종 UI 입력에서 6→7→6 전이, 선택한 7번째 Type 보존, 접기 focus를 확인한다. 서버 통합과 수동 Playground는 현재 지원하는 6종만 사용한다.
- 실제 `ReactionPeopleScreen` Tests는 최초 오류·재시도, 추가 조회 오류와 기존 행 유지, Type/actor 전환 시 이전 행 제거, cache 우선 재방문, Bio 숨김, 필터 focus와 목록 갱신 status를 확인한다.
- 기존 Post·Action Bar 통합 Tests는 일반/Quote own Post와 순수 Repost source Post의 toggle·mutation 대상과 새 People link 계약을 확인한다.
- E2E는 390px Home→People→Type 변경→프로필 방문→Back과 Home scroll 복원, guest 직접 진입의 순수 Repost·handle·Type 정규화 및 canonical 상세 fallback을 확인한다.
- E2E는 1440px Wide Viewer의 현재 글과 답글 각각에서 People로 이동할 때 Viewer 종료·제목 focus, Back 후 원래 상세 복귀를 확인한다. 1440px RightRail, 1024px Compact 전환, 390px BottomTabBar도 확인한다.
- Web route 복귀 때 원래 control ID가 유지되면 그 control을 선택한다. 목록 subtree가 remount되어 ID가 사라지면 기존 `universal-shell-root`로 focus를 복원한다. 두 경로는 `preventScroll`로 기존 scroll 복원을 보존한다.

## Web 관찰

새 Storybook 빌드를 로컬 HTTP로 제공하고 Codex 내장 Browser에서 실제 Production 화면 컴포넌트를 관찰했다. 390px Mobile, 1024px Compact, 1440px Full의 Light/Dark에서 단일 제목, pill 선택, emoji·Profile·Follow 배치, Bio 숨김과 인접 행 사이 divider를 확인했다. 이 화면 story는 중앙 600px까지의 콘텐츠이며, 전체 shell 보존 증거는 위 실제 route E2E다.

Figma의 Web Compact·Full과 Mobile `Default selected` frame을 다시 대조해 PageHeader 아래 12px, 좌우 16px에서 필터가 시작하고 목록이 필터 아래 12px에서 시작하는 것을 확인했다. 공용 pill의 기본 inset은 다른 consumer를 위해 유지하고 이 화면에서만 해제했다.

필터를 바꾼 뒤 선택 tab에 focus가 유지되고 접근성 tree에 선택 Type의 로딩·표시 인원 안내가 갱신되는 것을 확인했다. Web/Android는 live region, iOS는 queued accessibility announcement를 사용한다. 이는 실제 screen reader 음성 출력 검증과 구분한다.

## 미실행 항목과 완료 경계

- iOS·Android 앱 runtime, VoiceOver·TalkBack의 제목/로딩/완료 안내 순서와 중복, Native scroll·Back·focus는 실행하지 않았다. 확인 당시 부팅된 iOS simulator가 없었다.
- iOS 44pt·Android 48dp의 Summary/필터 control 크기는 코드에 반영했으나 Native 실제 touch·assistive technology 증거로 간주하지 않는다.
- Light/Dark 관찰은 Storybook의 공용 theme에서 수행했다. 실제 앱 E2E의 현재 Light 실행을 Production Dark runtime 검증으로 확대하지 않는다.
- correctness·test evidence·복잡성의 독립 검토를 수행했다. Viewer/Back/focus와 갱신 알림, 너비 테스트의 발견사항을 수정했고 미해결 correctness finding은 없다.
- 기존 fixture의 Relay 경고, React test renderer 경고와 Storybook chunk 크기 경고는 남지만 최종 검증은 모두 통과했다.
- 위 검증은 커밋 전 동일한 worktree에서 수행했다. 커밋·push·PR 상태는 전달 단계에서 별도로 확인하며, OpenSpec archive는 수행하지 않는다. PROD-938이 남은 Native 검증 기록과 change의 최종 spec 동기화·archive를 소유한다.
