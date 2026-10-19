## Current Constraints

- 현재 전달물은 행사에서 자연어 뮤트 구상을 설명할 HTML 목업 또는 이미지다. 앱 안에서 동작하는 기능을 만드는 작업이 아니다.
- `apps/app/src/theme/tokens.ts`에 KOSMO의 semantic color와 font family가 있다. 시각 기준은 `docs/design/colors.md`, `docs/design/foundations.md`, `docs/design/typography.md`에서 확인했다.
- 기존 Word Mute Rule은 단어, Hashtag Mute Rule은 Hashtag, Profile Mute는 Profile을 기준으로 노출을 제어한다. 이 소개 자료는 어느 정책도 수정하지 않는다.
- 행사 기기와 화면 비율은 아직 지정되지 않았다. 다음 제작 세션에서 실제로 확인한 표시 크기를 기록한다.

## Practical Approach

다음은 제작을 위한 작업 제안이다. 장면 수, 예문, 파일 위치는 소개 목적을 유지하는 범위에서 바꿀 수 있다.

### 전달물과 기존 UI

2026-10-19 Implement 후 사용자 요청 “기존 코스모 UI를 사용해서 실제 적용 예시를 보여주도록 수정”을 반영했다.

`docs/demos/natural-language-mute/index.html`과 같은 폴더의 화면 이미지 3장이 전달물이다. 기존 `UniversalShell`·`HomeRoute`의 실제 홈 피드를 Relay fixture로 렌더링한다. 설정 예시는 기존 `PageHeader`·`TextField`·`Button`·`BottomTabBar`와 theme token을 합성한다. 제작 원본은 `apps/app/src/stories/screens/NaturalLanguageMute.stories.tsx`다.

장면은 문장 설정→적용 전 홈 피드→적용 후 홈 피드다. 동일한 세 글과 순서를 유지하고, 결말 공개 글의 본문만 기존 `PostContentWarning`으로 가린 모의 결과를 보여준다. 작화 감상과 행사 준비 글은 유지한다. 실제 CW·자연어 뮤트 정책을 연결하거나 실제 서비스 경로를 추가하지 않는다.

화면은 SUIT/Pretendard가 로드된 Light·390×844 Web Storybook 캡처다. HTML은 넓은 화면에서 세 장면을 나란히 보여주고 작은 화면에서 세로로 배치한다. 클릭하면 각 이미지 원본을 크게 볼 수 있다. 행사 기기에는 폴더 전체를 복사한다.

## Alternatives and Traps

- 이미지 몇 장으로만 구성해도 현재 완료 기준을 만족한다. 수정과 전·후 비교가 쉬운 HTML을 기본 제작안으로 제안한다.
- 동작하는 체험 앱은 입력 처리, 예외와 시연 환경을 더 정해야 한다. 현재 전달에는 필요하지 않다.
- mock 성공을 실제 모델의 정확도나 프로덕션 검증 결과로 표현하지 않는다.

## Risks / Limits

HTML을 1440×1080과 390×844 viewport에서 직접 확인했다. 실제 행사 기기와 이미지·인쇄 품질은 검증하지 않았다. 폰트 미설치 기기는 시스템 한글 sans-serif로 표시한다. 실제 모델·계정 설정·Native 앱 동작을 검증했다는 주장은 하지 않는다.

## Open Questions

현재 세션에 남은 미결정 사항은 없다. 행사 표시 기기와 예문 세부사항은 자료 제작을 막는 제품 결정이 아니며, 현재 범위 안에서 조정할 수 있다.
