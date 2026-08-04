# Post Media Gallery

Post 목록과 상세는 `PostContent.media`의 document 순서를 그대로 소비하는 공용 Media renderer를 사용한다. Gallery는 최대 4장을 Post body의 사용 가능한 폭 안에 배치하며 Home·Profile·상세나 Web·Android·iOS별 별도 markup과 breakpoint를 두지 않는다.

## 이미지 개수별 geometry

| 개수 | Gallery surface                                    | Tile 배치                                                                                            |
| ---- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1장  | 가로·정사각 원본은 원본 비율, 세로 원본은 최대 1:1 | 한 장을 surface 전체에 표시하고 세로 이미지는 중앙 `cover` crop                                      |
| 2장  | tile 사이 gap을 제외한 이미지 영역 2:1             | 같은 크기의 1:1 tile 두 개. 외곽 높이는 tile 한 변에서 파생하므로 최종 외곽 비율은 2:1보다 조금 넓음 |
| 3장  | 외곽 16:9                                          | 첫 이미지는 왼쪽 전체 높이, 두·세 번째는 같은 폭의 오른쪽 열 위·아래                                 |
| 4장  | 외곽 1:1                                           | 같은 크기의 2×2 tile                                                                                 |

다중 tile은 `spacing.sm` gap과 `radii.md` gallery radius를 사용하되 gallery 외곽 border는 사용하지 않는다. 이미지·loading·error fallback은 같은 tile 경계를 채우고 원본을 늘이거나 찌그러뜨리지 않은 채 `cover`로 crop한다. 한 tile의 상태가 바뀌어도 인접 tile의 순서와 gallery surface를 밀지 않는다.

## Sensitive Media

- 가림 상태에서는 이미지를 mount하거나 byte를 load하지 않는다.
- 1장의 가림 surface는 1:1이고, 공개 뒤에는 위의 단일 이미지 비율을 사용한다.
- 2장은 정사각 tile에서 계산한 높이, 3장은 16:9, 4장은 1:1 surface를 공개 전후에 같게 사용한다.
- 가림 상태는 실제 gallery tile이나 내부 gap을 렌더하지 않는 단일 placeholder로 같은 surface 높이만 예약하고, 공개 뒤에만 개수별 분할 gallery를 표시한다.
- 일반 목록·상세에서는 공개·다시 가리기 control을 같은 위치의 안정된 형제로 유지해 Web focus와 `expanded` 상태를 보존한다.
- `interactive=false`인 Reply Composer 부모 preview는 같은 gallery geometry를 사용하지만 Sensitive 이미지를 가린 채 공개 control을 표시하지 않는다.

## 상호작과 접근성

정상 이미지 tile 자체는 PROD-650 viewer가 소유할 선택·navigation을 미리 구현하지 않으며 button·link role이나 press action을 갖지 않는다. Alt Text가 없으면 document 순서 기반의 `N번째 첨부 이미지`를 사용한다.

일반 목록·상세의 Sensitive 공개·다시 가리기와 실패 이미지 재시도는 독립된 control이다. 기존 role, accessible name, state, keyboard·touch 입력을 유지하고 실행할 때 주변 Post navigation을 함께 실행하지 않는다. 비대화형 부모 preview의 error fallback은 같은 tile에 남지만 재시도 control을 제공하지 않는다.

현재 표시 URL이 있고 interactive여서 재시도할 수 있는 오류 fallback은 단일·다중 이미지 모두 시각 오류 설명을 생략하고, 영향받은 이미지 맥락이 포함된 accessible name과 재시도 control만 표시한다. 재시도 control은 48 logical unit 높이를 사용하며 분할 tile에서는 전체 높이가 tile 안에 남아야 한다. URL이 없거나 비대화형 부모 preview여서 재시도할 수 없는 fallback은 기존 오류 설명을 계속 표시한다.

## 검증 경계

- Component test는 1·2·3·4장의 구조·순서·surface·tile geometry, 단일 이미지 비율, Sensitive 미mount·공개 전후, error·retry 격리와 비대화형 예외를 확인한다.
- Storybook은 일반 Post 폭과 compact viewport에서 1·2·3·4장, Sensitive, 부분 로딩 실패와 Reply 부모 preview를 확인한다. 현재 a11y 실행은 `color-contrast`를 제외하므로 전체 WCAG 적합성 증거가 아니다.
- Web runtime의 keyboard·focus·pointer 관찰은 iOS VoiceOver·touch와 Android TalkBack·touch 결과를 대체하지 않는다. 자동화와 플랫폼별 runtime 증거를 PR에 구분해 기록한다.

## 제외 범위

이미지 viewer, zoom·pan·gesture, tile navigation, 다운로드·공유, Composer 업로드·선택, Reply·Quote 전용 layout, Media URL·authorization·metadata와 서버·DB 계약은 이 gallery의 소유가 아니다.
