# 자연어 뮤트 소개 목업 · PROD-1160

이 폴더를 통째로 행사 기기에 복사하고 `index.html`을 브라우저로 엽니다. 화면 JPG 4개와 로고 PNG 1개가 필요하며 서버·빌드·인터넷 연결은 필요하지 않습니다. 이미지만 발표 자료에 넣어도 됩니다.

| 장면      | 파일           | 설명                                                            |
| --------- | -------------- | --------------------------------------------------------------- |
| 문장 설정 | `setting.jpg`  | 자연어 문장과 가릴 구절의 조건                                  |
| 적용 전   | `before.jpg`   | 결말 공개·작화 감상·행사 준비 글이 있는 기존 홈 피드            |
| 영역 뮤트 | `after.jpg`    | 첫 글에서 결말을 밝히는 구절만 검은 영역으로 가림               |
| 구절 공개 | `revealed.jpg` | 같은 자리에서 구절을 보여주고 옅은 강조·점선 밑줄로 범위를 표시 |

설정·적용 전 이미지는 누르면 크게 열립니다. 세 번째 화면은 누르거나 키보드 Enter/Space로 가린 구절을 공개하고 다시 가릴 수 있습니다. 원문 전체를 접지 않으며 앞뒤 맥락, 글 높이, 작성자·반응·하단 탐색을 유지합니다.

## UI와 참고 자료

- 기존 `UniversalShell`·`HomeRoute`를 Relay fixture로 렌더링한 피드 캡처를 사용합니다. 설정 예시는 공용 `PageHeader`·`TextField`·`Button`·`BottomTabBar`와 theme token을 합성합니다.
- 제작용 Storybook은 `apps/app/src/stories/screens/NaturalLanguageMute.stories.tsx`의 `Setting`, `Before`입니다.
- 영역 가림·공개 원본은 `region-preview.html`입니다. 기존 `before.jpg`의 본문 한 영역만 HTML로 합성해 390×844에서 캡처했습니다. 여기의 위치 수치는 해당 캡처에 한정합니다. 앱 UI가 바뀌면 캡처와 본문 위치를 함께 확인합니다. 실제 Production renderer에 영역 가림 API를 추가하지 않습니다.
- 사용자가 첨부한 검은 가림·공개 강조 예시와 [Fusetter의 부분 가림 설명](https://fusetter.com/helpcenter)을 참고했습니다. Fusetter는 작성자가 내용을 가리고 공개 범위를 정하는 서비스입니다. 이번 자료에서는 시각 표현만 참고하며, 읽는 사람의 자연어 조건에 맞는 구절을 미리 정한 예시로 보여줍니다.
- 이미지에는 SUIT/Pretendard가 포함되어 행사 기기 폰트 설치에 의존하지 않습니다. `brand-mark.png`는 기존 앱의 Light 로고 자산입니다.

## 이미지 다시 만들기

1. `pnpm --filter @kosmo/app storybook:dev`에서 Light·390×844의 Setting/Before를 열고 로고·폰트·반응 로딩을 확인해 캡처합니다.
2. 영역 캡처에는 별도 임시 폴더에 `region-preview.html`, `before.jpg`, 설치된 `pretendard` 패키지의 `PretendardVariable.woff2`만 복사합니다. 임시 HTML의 font URL을 같은 폴더의 파일로 바꿉니다. 폰트 파일은 저장소에 복제하지 않습니다.
3. 해당 임시 폴더만 loopback HTTP로 표시해 닫힌 상태를 `after.jpg`, 열린 상태를 `revealed.jpg`로 캡처합니다. HTML 설명·대체 텍스트와 이미지의 구절·순서를 함께 맞춥니다.

최종 소개 HTML은 캡처된 이미지를 사용하므로 위 개발용 폰트 경로나 Storybook에 의존하지 않습니다.

## 범위와 확인

작품·인물·글과 가림 영역은 준비한 예시입니다. 실제 모델의 영역 선택·추론·정확도, 실제 앱의 설정·경로·뮤트 정책이나 CW 동작은 변경하지 않습니다.

2026-10-19 Chromium 기반 내장 브라우저에서 원본 피드와 390×844의 영역 가림·공개를 직접 확인했습니다. 최종 HTML은 1440×1080·390×844에서 이미지 로딩과 가로 넘침 없음을 확인했고, 포인터 공개·Enter로 다시 가리기 및 expanded 상태 변화를 관찰했습니다. 자동 검증은 GitHub CI `Lint`와 `Test (App)`에 인계합니다. 실제 행사 기기·다른 브라우저·인쇄·screen reader·Native·모델 품질은 미검증입니다.
