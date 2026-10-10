## Session Work

현재 issue의 scoped 결과만 다룬다. 아래 구현·검증은 다음 세션에서 진행하며 구현 선택은 새 근거에 따라 줄이거나 고칠 수 있다. Source preview 자체의 여백 확대·알림·앱 전체 motion은 제외한다.

- [ ] 1.1 구현 담당: 최신 PROD-1075 본문·댓글과 canonical 문서, branch/HEAD·공용 카드 caller를 재확인하고 기존 사용자 변경을 보존한다. 승인된 결과와 현재 코드가 충돌하면 그 결정 경계에서 멈춘다.
- [ ] 1.2 구현 담당: 일반·Quote·순수 Repost의 기존 상세 대상을 연결해 Avatar 아래·카드 padding·독립 target 밖의 여백 입력을 보완한다. 실제 iOS hit testing으로 여백 누락과 독립 target 침범이 없는지 확인한다.
- [ ] 1.3 구현 담당: 본문·시간의 중복 이동, Profile·Link·Mention·Media·CW·Action Bar·Reaction Summary·pending/disabled 입력 분리와 기존 Source/attribution 경계를 보존한다.
- [ ] 1.4 구현 담당: navigation이 CW store를 변경하지 않도록 하고 접힘·펼침·상세·Back·Quote/Source 독립 상태를 유지한다. 정지 탭·세로 스크롤·취소와 feedback 복귀를 확인한다.
- [ ] 1.5 구현 담당: 변경된 카드 상호작용 범위를 `docs/design/post-action-bar.md`에 반영한다. 적용되는 repository memory의 가정을 바꿨을 때만 해당 문서를 같은 변경에서 갱신한다. domain·Linear에는 구현 수단을 추가하지 않는다.
- [ ] 2.1 구현 담당: production 카드와 renderer의 입력·상태·이동 결과를 실행하는 focused unit/Storybook 회귀를 추가한다. 여백 좌표, CW 상태, 일반·Quote·순수 Repost 대상, 독립 action과 단일 이동을 검증하며 소스 문자열 검사를 추가하지 않는다.
- [ ] 2.2 Test 담당: 최신 PR head의 App(`pnpm --filter @kosmo/app test`)와 workspace lint CI 결과를 확인한다. unit·Storybook·Relay·TypeScript 결과와 head SHA를 기록하며 과거 head의 성공을 재사용하지 않는다.
- [ ] 2.3 Native 검증 담당: 로그인한 실제 iOS 목록에서 일반·CW 없음/접힘/펼침의 Avatar 아래·padding·본문 단일 탭, 세로 drag·취소, 중첩 action, VoiceOver focus를 확인한다. 기기·OS·binary build·확인 가능한 OTA revision과 route 결과를 기록한다.
- [ ] 2.4 회귀 검증 담당: 공용 변경이 닿는 Web·Android와 Home·Local·Profile·Bookmarks·상세 thread caller를 확인한다. Source preview·상세 current row·Viewer 예외와 기존 geometry가 유지되는지 검증한다. 실행하지 못한 플랫폼은 미검증으로 남긴다.
- [ ] 2.5 검증 담당: 정상 본문 단일 탭의 간헐적 누락이 남는지 별도로 관찰한다. 재현되면 조건·원인 조사 결과와 재산정 필요성을 기록하고 독립 범위가 필요할 때 issue 소유자와 정한다.

## Verification Evidence

- Result: Pending. 제품 구현·테스트·Native runtime은 이 Spec 세션에서 실행하지 않았다.
- Checks: Linear PROD-1075의 최신 본문·관계·댓글, 원격 main SHA, 현재 코드의 card→body→CW→상세 소비 경로와 기존 테스트/CI 설정을 조사했다.
- Limits: 사용자 제보의 TestFlight·iOS 조합에서 직접 재현하지 않았으며 OTA revision도 미확인이다. 자동화·코드 조사·OpenSpec validation은 Native 성공 증거가 아니다.
- Migration / rollout / rollback: 서버·DB migration·backfill과 새 배포 정책은 없다. scoped UI 변경을 되돌리는 rollback 범위만 확인한다.

## Progress

- Status: Active
- Completed: Spec 초안과 조사 근거 작성. 구현 task는 모두 Pending.
- Next: 한국어 윤문·구조 대조·strict validation 이후 사용자 검토와 다음 구현 세션으로 인계한다.
- Last updated: 2026-10-10
