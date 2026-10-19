## Current Constraints

- 현재 전달물은 행사에서 자연어 뮤트 구상을 설명할 HTML 목업 또는 이미지다. 앱 안에서 동작하는 기능을 만드는 작업이 아니다.
- `apps/app/src/theme/tokens.ts`에 KOSMO의 semantic color와 font family가 있다. 시각 기준은 `docs/design/colors.md`, `docs/design/foundations.md`, `docs/design/typography.md`에서 확인했다.
- 기존 Word Mute Rule은 단어, Hashtag Mute Rule은 Hashtag, Profile Mute는 Profile을 기준으로 노출을 제어한다. 이 소개 자료는 어느 정책도 수정하지 않는다.
- 행사 기기와 화면 비율은 아직 지정되지 않았다. 다음 제작 세션에서 실제로 확인한 표시 크기를 기록한다.

## Practical Approach

다음은 제작을 위한 작업 제안이다. 장면 수, 예문, 파일 위치는 소개 목적을 유지하는 범위에서 바꿀 수 있다.

### 전달물과 기존 UI

2026-10-19 Implement 후 사용자 요청 “기존 코스모 UI를 사용해서 실제 적용 예시를 보여주도록 수정”을 반영했다.

`docs/demos/natural-language-mute/index.html`과 같은 폴더의 화면 JPG 6장이 전달물이다. 기존 `UniversalShell`·`HomeRoute`의 실제 홈 피드를 Relay fixture로 렌더링한다. 설정 예시는 기존 `PageHeader`·`TextField`·`Button`·`BottomTabBar`와 theme token을 합성한다. 제작 원본은 `apps/app/src/stories/screens/NaturalLanguageMute.stories.tsx`다.

2026-10-19 사용자 후속 요청에 따라 두 비교 케이스를 분리했다. 같은 자연어 조건과 적용 전 피드를 사용하며, 각 케이스는 설정→적용 전→결과 순서다.

- 문장 단위 영역 뮤트: 첫 글의 세 문장 중 결말을 밝히는 두 번째 문장 전체를 검은 영역으로 가린다. 누르면 같은 자리에서 공개·재가림한다. 앞뒤 감상·작성자·반응·글 높이와 다른 글은 유지한다. 영역 원본은 소개용 `region-preview.html`이며 앱 renderer는 변경하지 않는다.
- 글 전체 숨김: 첫 글을 모의 목록에서 제외해 기존 `HomeRoute`로 렌더링한다. 가림 카드나 대체 행 없이 작화 감상과 행사 준비 글이 올라오며 남은 글의 순서는 유지한다.

화면은 SUIT/Pretendard가 로드된 Light·390×844 Web Storybook 캡처와 본문 영역 합성이다. HTML의 native radio로 케이스를 전환하고, 넓은 화면에서 세 장면을 나란히, 작은 화면에서 세로로 배치한다. 이미지 전체를 크게 열 수 있으며 문장 가림 결과는 공개·재가림을 전환한다. 행사 기기에는 폴더 전체를 복사한다. 실제 모델 판단·설정 모드·서비스 경로·뮤트 정책을 추가한 것은 아니다.

## Alternatives and Traps

- 이미지 몇 장으로만 구성해도 현재 완료 기준을 만족한다. 수정과 전·후 비교가 쉬운 HTML을 기본 제작안으로 제안한다.
- 동작하는 체험 앱은 입력 처리, 예외와 시연 환경을 더 정해야 한다. 현재 전달에는 필요하지 않다.
- mock 성공을 실제 모델의 정확도나 프로덕션 검증 결과로 표현하지 않는다.

## Risks / Limits

HTML을 1440×1080과 390×844 viewport에서 직접 확인했다. 실제 행사 기기와 이미지·인쇄 품질은 검증하지 않았다. 폰트 미설치 기기는 시스템 한글 sans-serif로 표시한다. 실제 모델·계정 설정·Native 앱 동작을 검증했다는 주장은 하지 않는다.

## Open Questions

현재 세션에 남은 미결정 사항은 없다. 행사 표시 기기와 예문 세부사항은 자료 제작을 막는 제품 결정이 아니며, 현재 범위 안에서 조정할 수 있다.
