## Session Work

이번 Implement 세션에서 제작과 직접 시각 확인을 수행했다. 장면 수와 제안 경로는 변경 가능한 작업 메모다.

- [x] 1.1 HTML 목업 또는 이미지에 문장 입력 예시, 적용 조건, 피드 가림 결과를 이어서 구성한다. 전달물은 `docs/demos/natural-language-mute/index.html`과 기존 코스모 UI를 렌더링한 화면 이미지이며 실제 앱 경로·모델·백엔드 연결은 추가하지 않는다.
- [x] 1.2 가상의 문장과 예시 글로 가려지는 글·유지되는 글의 관계를 설명하고, 쉬운 한국어 안내와 소개용 예시 표시를 넣는다. 문장 가림은 원래 글·순서를 유지하고, 글 숨김은 해당 글만 제외해 남은 글의 순서를 유지한다.
- [x] 2.1 완성한 HTML을 브라우저에서 열거나 최종 이미지를 직접 확인한다. 문장→조건→결과의 읽기 순서와 예문·가림 결과의 일치를 살피고, 한글이 잘리지 않는지와 표시 크기에서 읽기 쉬운지 확인한다.
- [x] 2.2 선택한 원본 파일에 기존 formatter 등 필요한 표준 검사를 적용하고, 실제 산출물 경로와 확인한 화면 크기·관찰 결과·미확인 사항을 인계에 남긴다. HTML과 이미지 모두를 의무로 만들거나 앱·Native·모델 검증을 추가하지 않는다.

## Verification Evidence

- 산출물: `docs/demos/natural-language-mute/index.html`, 같은 폴더의 `setting.jpg`·`setting-hidden.jpg`·`before.jpg`·`after.jpg`·`revealed.jpg`·`hidden.jpg`·`brand-mark.png`와 `README.md`. 제작 원본은 `apps/app/src/stories/screens/NaturalLanguageMute.stories.tsx`와 `region-preview.html`.
- 시각 확인: 2026-10-19 기존 앱 컴포넌트의 Web Storybook을 Light·390×844에서 직접 관찰했다. 같은 조건의 두 설정, 세 문장으로 된 원래 첫 글, 두 번째 문장 전체를 가린 결과와 공개 결과, 첫 글을 제외해 아래 글이 올라온 피드를 캡처했다. 최종 HTML의 1440×1080·390×844 이미지 로딩과 가로 넘침 없음을 확인했다. 포인터 케이스 전환·문장 공개, Enter 재가림과 방향키 케이스 전환을 관찰했다.
- 포맷 적용: 기존 `pnpm exec prettier --write`로 원본을 정리했다. 자동 검증은 GitHub CI `Lint`에 인계하며 결과는 pending이다. 로컬 테스트는 실행하지 않았다.
- 한계: 폰트 미설치 시 시스템 한글 sans-serif를 사용한다. 실제 행사 기기, 다른 브라우저, 인쇄는 미검증이다. 화면 이미지는 SUIT/Pretendard를 포함해 캡처되어 행사 기기의 폰트 설치에 의존하지 않는다. 실제 모델·앱·Native 검증은 범위 밖이다.

## Progress

- Status: 제작과 직접 시각 확인 완료. GitHub CI 검증은 Test phase에 인계한다.
- 구현은 정적 소개 자료만 포함하며 앱 경로·설정·정책은 변경하지 않는다.
- Last updated: 2026-10-19
