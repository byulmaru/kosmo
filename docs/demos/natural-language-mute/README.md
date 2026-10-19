# 자연어 뮤트 소개 목업 · PROD-1160

이 폴더를 통째로 행사 기기에 복사하고 `index.html`을 브라우저로 엽니다. 화면 JPG 6개와 로고 PNG 1개가 필요하며 서버·빌드·인터넷 연결은 필요하지 않습니다. 이미지만 발표 자료에 넣어도 됩니다.

## 두 가지 적용 예시

상단의 케이스 선택으로 **문장만 가리기**와 **글 전체 숨기기**를 전환합니다. 포인터 또는 키보드 Tab·방향키로 선택할 수 있습니다. 두 케이스는 같은 조건과 같은 적용 전 피드를 사용합니다.

> 〈별의 정원〉 결말이나 반전은 보고 싶지 않아요.

| 케이스                      | 설정                 | 적용 전      | 적용 후                      |
| --------------------------- | -------------------- | ------------ | ---------------------------- |
| 문장 단위 영역 뮤트         | `setting.jpg`        | `before.jpg` | `after.jpg` / `revealed.jpg` |
| 글 전체를 타임라인에서 숨김 | `setting-hidden.jpg` | `before.jpg` | `hidden.jpg`                 |

- **문장 가림:** 첫 글의 세 문장 중 결말을 밝히는 두 번째 문장 전체를 검은 영역으로 가립니다. 앞뒤 감상·작성자·반응·글 높이와 다른 글은 유지합니다. 결과 화면을 누르거나 Enter/Space로 문장을 공개하고 다시 가릴 수 있습니다.
- **글 숨김:** 첫 글 전체가 목록에서 빠집니다. 가림 카드·대체 안내 행·빈자리를 남기지 않고 여울의 작화 감상과 모아의 행사 준비 글이 순서대로 올라옵니다. 같은 작품의 작화 감상은 결말을 밝히지 않으므로 남아 있습니다.

이 두 케이스는 비교용 목업이며, 실제 서비스에 두 모드 선택 기능을 추가한 것이 아닙니다. 단어 몇 개만 정확히 추출하는 예시는 문장 전체를 가리는 예시로 바꿨습니다.

## UI와 참고 자료

- 기존 `UniversalShell`·`HomeRoute`를 Relay fixture로 렌더링한 피드 캡처를 사용합니다. 설정 예시는 공용 `PageHeader`·`TextField`·`Button`·`BottomTabBar`와 theme token을 합성합니다.
- 제작용 Storybook은 `apps/app/src/stories/screens/NaturalLanguageMute.stories.tsx`의 `Setting`, `SettingHidden`, `Before`, `HiddenPosts`입니다. `HiddenPosts`는 첫 글을 제외한 모의 목록을 기존 `HomeRoute`에 전달합니다.
- 문장 가림·공개 원본은 `region-preview.html`입니다. 기존 `before.jpg`의 첫 글 본문만 HTML로 합성해 390×844에서 캡처했습니다. 위치 수치는 해당 캡처에 한정합니다. 앱 UI가 바뀌면 캡처와 본문 위치를 함께 확인합니다. 실제 Production renderer에 영역 가림 API를 추가하지 않습니다.
- 사용자가 첨부한 검은 가림·공개 강조 예시와 [Fusetter의 부분 가림 설명](https://fusetter.com/helpcenter)을 시각 표현에 참고했습니다. Fusetter의 작성자 공개 범위를 코스모 정책으로 가져오지 않습니다.
- 이미지에는 SUIT/Pretendard가 포함되어 행사 기기 폰트 설치에 의존하지 않습니다. `brand-mark.png`는 기존 앱의 Light 로고 자산입니다.

## 이미지 다시 만들기

1. `pnpm --filter @kosmo/app storybook:dev`에서 Light·390×844의 `Setting`, `SettingHidden`, `Before`, `HiddenPosts`를 열고 로고·폰트·반응 로딩을 확인해 각각 캡처합니다.
2. 영역 캡처에는 별도 임시 폴더에 `region-preview.html`, `before.jpg`, 설치된 `pretendard` 패키지의 `PretendardVariable.woff2`만 복사합니다. 임시 HTML의 font URL을 같은 폴더의 파일로 바꿉니다. 폰트 파일은 저장소에 복제하지 않습니다.
3. 해당 임시 폴더만 loopback HTTP로 표시해 닫힌 상태를 `after.jpg`, 열린 상태를 `revealed.jpg`로 캡처합니다. 키보드 확인 뒤 기본 이미지에는 focus ring이 남지 않도록 합니다. HTML 설명·대체 텍스트와 이미지의 문장·순서를 함께 맞춥니다.

최종 소개 HTML은 캡처된 이미지를 사용하므로 위 개발용 폰트 경로나 Storybook에 의존하지 않습니다.

## 범위와 확인

작품·인물·글과 문장별 가림 결과는 준비한 예시입니다. 실제 Jev의 문장 판별·정확도, 실제 앱의 설정·경로·뮤트 정책이나 CW 동작은 변경하지 않습니다.

2026-10-19 Chromium 기반 내장 브라우저에서 390×844의 원본 피드·두 설정·문장 가림과 공개·첫 글을 제외한 피드를 직접 확인했습니다. 최종 HTML은 1440×1080·390×844에서 이미지 로딩과 가로 넘침 없음을 확인했고, 포인터로 케이스 전환·문장 공개, Enter 재가림과 방향키 케이스 전환을 관찰했습니다. 자동 검증은 GitHub CI `Lint`와 `Test (App)`에 인계합니다. 실제 행사 기기·다른 브라우저·인쇄·screen reader·Native·모델 품질은 미검증입니다.
