## Current Constraints

조사 기준 HEAD는 `02e9e4ea55af06877bb186ea8a4264db0429284a`다. 원래 작업 폴더의 사용자 변경을 보존하고 별도 PROD-836 worktree를 사용한다.

- `apps/app/src/components/shell/UniversalShell.tsx`: Web full/compact/mobile 셸과 우측 레일 합성.
- `apps/app/src/components/shell/SidebarNavigation.tsx`, `apps/app/src/components/ui/SidebarNavigation.tsx`: guest에서도 보호 navigation·설정·로그아웃이 남는 경로.
- `apps/app/src/session/SessionProvider.tsx`: currentSession으로 guest와 valid를 구분하며 query 준비 전 Splash를 유지한다.
- `apps/web/src/server/routes/login.ts:83-94`: 성공 뒤 `/home?resetSelectedProfile=1`로 이동한다. 공개 콘텐츠 복귀는 없다.
- `apps/app/src/components/AppProviders.tsx:23-61`: 이전 선택 Profile을 지운 뒤 SessionProvider를 시작하고 marker를 제거한다.
- `apps/app/src/components/timeline/HomeTimelineScreen.tsx:233-253`, `apps/app/src/components/shell/ProfileSwitcher.tsx:329-355`: Profile 준비와 생성 뒤 선택 경로.
- `apps/app/src/components/post/PostActionAuthentication.tsx:25-40`: Web guest 참여 action은 현재 `/login`으로 이동한다.

## Practical Approach

아래 내용은 구현 과정에서 바꿀 수 있는 제안이다. 기존 셸의 guest 분기에서 공개 Profile·Post에만 안내를 합성하고 인증 상태와 선택 Profile 유무를 분리한다. 좌측 `가입하기`는 KOSMO 홈(`/`), `로그인`은 `/login`으로 연결한다. `팀 별마루 소개`는 `https://byulmaru.co/about-us`를 사용한다. 하단 `KOSMO에서 계속하기`도 KOSMO 홈(`/`)을 연다.

모든 Web 폭에서 같은 하단 안내를 제공한다. full 우측 레일에는 중복 가입하기·로그인 버튼과 별도의 가입·소개 안내 카드를 표시하지 않는다. 기존 레일 폭과 개인정보처리방침 링크는 유지한다. 하단에는 `KOSMO에서 계속하기` 아래에 `팀 별마루 소개`와 `개인정보처리방침` 링크를 `·` 구분자 없이 배치하고 개인정보처리방침은 `/privacy`를 사용한다. 좌측의 `가입하기`·`로그인`은 별도 버튼으로 유지한다. 하단 닫힘은 탭 단위 저장 수단으로 유지한다. 콘텐츠 마지막 행과 focus가 CTA·하단 탭에 가리지 않도록 실제 안내 높이를 반영한다. 개인정보 처리방침 footer와 document scroll을 보존한다. 비로그인 mobile Web 공개 Profile·Post의 헤더 왼쪽에 햄버거 메뉴 버튼과 제목을 두어 하단 CTA를 닫은 뒤에도 좌측 drawer의 가입·로그인에 접근하게 한다. 이 guest 헤더에는 별도의 뒤로가기나 오른쪽 메뉴 버튼을 추가하지 않는다. 기존 `PageHeader`의 leading과 공용 drawer lifecycle을 재사용하는 방향을 제안한다. Native 앱에는 이 비로그인 공개 헤더나 뒤로가기 버튼을 새로 만들지 않는다.

복귀 대상은 현재 공개 Profile·Post pathname에서 얻는다. 같은 서비스의 두 route 형식만 허용하는 검증을 서버 인증 경계에서 적용하고 외부 origin, scheme, protocol-relative path와 비정상 인코딩을 거부한다. OIDC state·PKCE 검증을 약화하지 않으며 callback 성공 뒤의 Profile 초기화를 먼저 유지한다. Profile 선택·생성 완료에 연결해 유효한 선택 Profile이 준비된 뒤 검증된 대상에 한 번 복귀한다. `가입하기`로 홈(`/`)을 경유해 `/login`을 시작해도 복귀 대상을 유지한다. `KOSMO에서 계속하기`로 홈을 거치는 경우에도 같은 복귀 맥락을 유지한다. 일반 로그인은 기존 홈 흐름을 유지한다. 임의 query·hash 보존은 요구사항이 아니다.

## Alternatives and Traps

guest와 valid/no selected Profile을 같은 안내 상태로 합치지 않는다. CTA 닫힘을 전역 또는 계정 설정으로 만들지 않는다. return target을 그대로 redirect하거나 참여 mutation을 자동 재실행하지 않는다. 복귀 연결을 위해 전체 온보딩을 새로 만들지 않는다.

## Risks / Limits

인증 취소·실패는 성공 복귀로 처리하지 않고 기존 재시도 경로를 유지한다. 취소·이탈·복귀 완료 뒤 일반 로그인에서 이전 복귀 대상이 잘못 재사용되지 않는지도 검증한다. 복귀 위치가 없거나 무효이면 기존 홈을 사용한다. 서버 callback·AppProviders·Profile 준비가 만나는 회귀 위험이 있어 셸 테스트만으로 완료하지 않는다. source 조사만 수행했으며 Web runtime·Native·production 검증은 없다.

## Open Questions

현재 미정인 제품 선택은 없다. 새 제품·보안·rollout 선택도 구현 전에 사용자에게 질문하고 canonical·Linear를 먼저 갱신한다.
