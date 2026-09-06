# PROD-814 검증 기록

2026-09-06 기준으로 UI·Relay 통합의 확인 범위와 남은 경계를 기록한다. 이 문서는
[tasks.md](./tasks.md)의 6장 완료 여부를 보조한다. Native runtime·접근성은 미실행이며
2026-09-06 사용자 결정으로 현재 archive 범위와 분리한다. 미실행 검증을 통과로 취급하지 않는다.

## 근거 파일

- [Profile Mute Web E2E](../../../../apps/web/e2e/profile-mute.e2e.ts)
- [Web E2E DB fixture](../../../../apps/web/e2e/db-fixtures.ts)
- [Local/Home Timeline E2E 기준](../../../../apps/web/e2e/timelines.e2e.ts)
- [Profile Mute Action](../../../../apps/app/src/components/profile/ProfileMuteAction.tsx)
- [Mute Settings destination](../../../../apps/app/src/components/settings/SettingsMutedProfiles.tsx)

## 6.1 Local UI 연결

Local 서버 후보·API 회귀의 선행 증거와 기존 Local UI 연결을 확인했다. Profile Mute E2E는
Home에서 Timeline의 Local tab으로 진입하고, Local post의 실제 Profile 링크를 통해 Profile action을
호출한다. Local·Remote target의 mutation과 DB 영구 관계(`expiresAt: null`)도 확인한다.

관련 검증은 [selected Profile 흐름 (line 328)](../../../../apps/web/e2e/profile-mute.e2e.ts)과
[Local/Home 제외 정책 (line 243)](../../../../apps/web/e2e/profile-mute.e2e.ts)에서 수행한다.

## 6.2 Selected Profile 전환과 해제 후 Relay 갱신

같은 Account의 Profile A/B를 실제 switcher로 전환하고, Profile A의 Mute가 Profile B에 섞이지 않는
것까지 확인했다. Settings에서 Profile A의 관계를 실제 unmute mutation으로 해제한 뒤 `goto`나
브라우저 reload 없이 Home·Local로 이동해 feed를 확인하는 경로도 고정했다.

초기 실행에서는 unmute mutation과 Settings 목록 갱신은 성공했지만, SPA로 Home에 복귀한 뒤 target
post가 다시 나타나지 않는 RED가 관찰됐다. 실패 지점은
[profile-mute.e2e.ts (line 415)](../../../../apps/web/e2e/profile-mute.e2e.ts)였고, 관찰된 경계는
"unmute 성공 → 이미 로드된 Home feed 갱신"이었다. 이후 production의 shell revision/fetch key를
수정하고 동일 SPA 경로를 재실행해 Home·Local feed 복원을 확인했다. 최종 대상 실행은 8/8 PASS(1.3분)다.

## 6.4 Target Profile Web·Native와 접근성

Web에서는 390·1024·1440 viewport에서 직접 Profile의 정상 post, Mute 상태, direct unmute,
confirmation dialog의 keyboard focus, pending 중 닫힘·중복 요청 방지, Settings pagination/error
retry를 실행했다. 관련 테스트는 [Profile Mute E2E (line 31)](../../../../apps/web/e2e/profile-mute.e2e.ts)다.

iOS·Android native export는 최종 revision을 포함해
`/private/tmp/kosmo-PROD-814-native-revision-export`에서 모두 PASS했다. 이는 bundle/export 검증이며
runtime·native accessibility 통과를 의미하지 않는다. Xcode 26.6에 iOS 26.5 destination이 없어
`xcodebuild` runtime 검증은 종료 코드 70으로 실패했고, Android는 `adb devices`가 비어 있고
SDK/emulator가 없어 runtime·native accessibility를 실행하지 못했다. 이후 사용자가 네이티브 앱 자체가
다른 이슈/PR에서 미완료임을 확인하고, 앱 작업 완료 후 검증하도록 결정했다. 6.4의 현재 완료 범위는
Web 검증과 Native 후속 검증 이관이며 Native 검증 통과가 아니다. PROD-814 담당자가 앱 작업 완료 후
Local·Remote target, 직접 Profile·Settings, native back·focus·touch target·보조 기술 동작을 검증하고
결과를 PROD-814에 기록한다. Native 제품 계약은 유지한다.

## 6.5 Cross-slice E2E와 불변성

실행 명령:

```text
POSTGRES_PORT=54344 DATABASE_URL=postgres://kosmo:kosmo@localhost:54344/kosmo_test_prod814_completion node scripts/test-db.mjs run -- pnpm test:e2e:database profile-mute.e2e.ts
```

초기 강화 실행의 7 pass / 1 fail은 shell revision/fetch key 수정 후 동일 명령으로 재실행했고,
최종 대상 실행은 8 pass / 0 fail(1.3분)이었다. 통과한 범위에는 다음이 포함된다.

- Home·Local에서 muted outer/source Author의 direct post·Quote·Repost 제외와 직접 Profile 예외
- 실제 selected Profile switcher 전환 및 Profile별 Mute 격리
- Local·Remote Profile UI Mute, Profile/Settings unmute, 영구 관계 저장
- mutation 실패 후 실제 네트워크 retry 성공
- Settings pagination 및 초기 query 오류의 controlled error/retry
- Mute·unmute 전후 Follow, Reaction, Bookmark, Repost와 Notification `readAt` DB snapshot 불변성

초기 실패는 위 6.2와 동일한 [Home feed 복원 assertion (line 415)](../../../../apps/web/e2e/profile-mute.e2e.ts)이었으며,
revision/fetch key 수정 후 해소됐다.

## 보조 검증과 미완료 범위

- API integration: 237 pass, 0 fail, 기존 skip 1건(총 238건).
- 전체 Web E2E: `POSTGRES_PORT=54344 DATABASE_URL=postgres://kosmo:kosmo@localhost:54344/kosmo_test_prod814_completion node scripts/test-db.mjs run -- pnpm test:e2e:database` — 130 pass, 0 fail, 기존 skip 2건, 4.9분, exit 0.
- Web 기존 Local E2E: 1 pass.
- App unit: 465/465 pass; app check pass; ProfileMuteAction Storybook 7/7 pass; scoped ESLint pass.
- Settings IA의 최초 owner는 PROD-814이며, 공용 컴포넌트·presentation 결과는 PROD-858을 재사용했다.
- 6.6은 사용자 승인으로 확정한 현재 범위의 canonical·Linear·OpenSpec 정합성, delta sync와 archive 전후 strict validation을 판정한다.
- 부모 충돌·Stack 정리는 선행 PR #763 머지 후 PROD-814 담당자가 수행한다. archive나 이번 검증 증거가 PR Ready·머지·Linear Done을 뜻하지 않는다.

## 6.6 Archive 완료

2026-09-06 canonical·Linear·OpenSpec을 대조하고 사용자 승인 범위를 반영했다.
`pnpm exec openspec archive add-profile-mute --yes`로 profile-mute 8개·post 6개 요구사항을
기본 spec에 동기화하고 이 디렉터리로 archive했다. 이어서
`pnpm exec openspec validate --all --strict`가 115 passed, 0 failed로 통과했다.
Native 미실행 검증과 선행 PR 머지 후 Stack 정리는 위 후속 기록 및 PROD-814에서 계속 추적한다.
