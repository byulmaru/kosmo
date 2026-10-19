# 자연어 뮤트 소개 목업 · PROD-1160

이 폴더를 통째로 행사 기기에 복사하고 `index.html`을 브라우저로 엽니다. HTML과 같은 폴더의 화면 JPG 3개와 로고 PNG 1개가 필요하며, 서버·빌드·인터넷 연결은 필요하지 않습니다. 화면 이미지만 발표 자료에 넣어도 됩니다.

| 장면      | 파일          | 설명                                                  |
| --------- | ------------- | ----------------------------------------------------- |
| 문장 설정 | `setting.jpg` | 자연어 문장 입력과 가림 조건                          |
| 적용 전   | `before.jpg`  | 결말 공개·작화 감상·행사 준비 글이 있는 홈 피드       |
| 적용 후   | `after.jpg`   | 첫 글의 본문만 가리고 나머지 두 글을 유지한 같은 피드 |

HTML에서 화면을 누르면 이미지 원본을 크게 볼 수 있습니다. 이미지의 내용은 본문 설명과 대체 텍스트로도 제공합니다.

## 기존 코스모 UI 사용

이미지는 `apps/app/src/stories/screens/NaturalLanguageMute.stories.tsx`의 `Setting`, `Before`, `After`를 390×844에서 렌더링한 화면입니다.

- 피드: 실제 `UniversalShell`과 `HomeRoute`를 Relay fixture로 렌더링합니다. 기존 로고, 홈·로컬 탭, 게시글, 반응, 하단 탐색을 그대로 사용합니다.
- 문장 설정: 기존 `PageHeader`, `TextField`, `Button`, `BottomTabBar`와 theme token을 합성한 소개용 화면입니다.
- 가림: 준비된 모의 결과를 기존 `PostContentWarning`으로 표현합니다. 작성자가 지정하는 실제 CW와 자연어 뮤트의 제품 정책을 연결하거나 바꾸지 않습니다.
- 폰트: Storybook에서 npm 패키지의 SUIT/Pretendard를 로드해 캡처했으므로 행사 기기에 폰트를 설치할 필요가 없습니다. `brand-mark.png`는 기존 앱의 Light 로고 자산입니다.

이미지를 다시 만들 때는 `pnpm --filter @kosmo/app storybook:dev`로 실행하고 `KOSMO/Screens/Natural Language Mute Showcase`의 세 장면을 Light·390×844에서 엽니다. 로고·반응·폰트 로딩이 끝난 화면을 캡처합니다. HTML 설명과 이미지의 글·순서를 함께 맞춥니다.

## 소개 범위와 확인

작품·인물·글과 가림 결과는 모두 가상입니다. 입력·적용·모델 추론을 수행하는 체험 앱은 아니며 실제 앱의 설정·경로·뮤트 정책은 변경하지 않습니다.

2026-10-19 Chromium 기반 내장 브라우저에서 세 장면을 직접 확인했습니다. HTML은 1440×1080의 나란한 배치와 390×844의 세로 배치를 직접 확인했고 가로 넘침이 없었습니다. 자동 검증은 GitHub CI의 `Lint`와 `Test (App)`에 인계합니다. 실제 행사 기기·다른 브라우저·인쇄·Native·모델 품질은 검증하지 않았습니다.
