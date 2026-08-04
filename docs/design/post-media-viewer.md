# Post Media Viewer

일반 Post의 공개된 이미지 tile을 선택하면 같은 Post Content revision의 이미지를 document 순서대로 살펴보는 modal viewer를 연다. Viewer는 이미지만 고립시키지 않고 작성자, 원문 text와 기존 Post Action Bar를 함께 보여줘 사용자가 원래 Post의 맥락과 action 대상을 잃지 않게 한다.

## 디자인 권위와 적용 범위

- Mobile 시각 기준은 Figma `KOSMO`의 [`Media / Fullscreen Viewer` node 354:3924](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=354-3924)다.
- Figma의 어두운 fullscreen image surface와 상단 close affordance를 시각 기준으로 사용한다.
- Figma에 없는 Web side panel, 원문 접기·펼치기와 Action Bar 배치는 PROD-650에서 승인된 제품 계약이다.
- Figma 하단의 Media 파일 저장 action은 이 viewer에 포함하지 않는다. 현재 기존 Post Action Bar만 제공한다.
- Viewer는 일반 목록과 Post 상세의 interactive gallery에 적용한다. `interactive=false`인 Reply Composer 부모 preview는 viewer를 열지 않는다.

## 소유권과 데이터 경계

Post surface가 viewer의 open 상태, 대상 Post와 현재 Media index를 소유한다. Gallery는 공개된 정상 tile을 선택했을 때 document index만 전달하며 modal lifecycle이나 Post 데이터를 별도로 소유하지 않는다.

Viewer는 이미 화면의 Post 조회 정책을 통과한 현재 Post Content revision과 그 `media` 목록만 소비한다. 별도 Media 조회나 standalone authorization을 추가하지 않고, modal이 열린 동안 다른 Post·Profile·revision의 Media를 섞지 않는다. 대상 Post, Profile 또는 Content revision이 바뀌거나 surface가 unmount되면 viewer를 닫는다.

## 반응형 layout

| 환경          | Viewer layout                                              |
| ------------- | ---------------------------------------------------------- |
| Web `<768px`  | image surface 위, Post detail panel 아래의 세로 layout     |
| Web `>=768px` | image surface 왼쪽, Post detail panel 오른쪽의 분할 layout |
| iOS·Android   | viewport 폭과 관계없이 mobile 세로 layout                  |

이미지는 배정된 image surface 안에서 원본 비율을 유지한 `contain` 방식으로 표시하고 viewport 밖으로 밀어내지 않는다. Detail panel에는 작성자, 원문 text와 기존 Post Action Bar를 이 순서로 둔다. Action Bar는 mobile viewer의 아래쪽과 Web side panel의 아래쪽에 고정하고, 작성자·원문 영역의 길이가 action 위치를 밀지 않게 한다.

원문은 처음에 3줄로 제한한다. 넘치는 경우에만 `더 보기` control을 제공하고 펼친 뒤에는 `접기`로 바꾼다. 펼친 원문은 detail panel의 text 영역 안에서만 scroll하며 image surface와 고정 Action Bar를 밀어내지 않는다. Control은 펼침 상태를 접근성 state로 전달한다.

## 선택과 탐색

- 선택한 gallery tile의 document index에서 viewer를 시작한다.
- 2장 이상이면 시각적 `현재 위치/전체`를 표시하고, 1장이면 시각 counter를 생략한다. Screen Reader에는 장수와 관계없이 현재 위치와 전체 개수를 알린다.
- 현재 이미지의 nullable Alt Text를 accessible name으로 사용하고, 없으면 document 순서 기반의 `N번째 첨부 이미지`를 사용한다. 현재 위치 안내는 이미지 이름과 별도로 전달해 내용을 위치 정보로 대체하거나 중복 낭독하지 않는다.
- 이전·다음 control은 document 순서를 따르며 첫 장의 이전과 마지막 장의 다음은 비활성화한다. 끝에서 반대편으로 순환하지 않는다.
- Web은 이전·다음 control과 `ArrowLeft`·`ArrowRight` keyboard 입력을 제공한다.
- iOS·Android는 이전·다음 control과 수평 swipe를 제공한다. Gesture가 성립하지 않으면 현재 이미지에 머문다.
- 현재 이미지가 바뀌어도 작성자·원문·Action Bar의 대상은 같은 Post다.

## Post Action Bar

Viewer는 [기존 Post Action Bar](./post-action-bar.md)가 현재 제공하는 Reply, Repost, Reaction, Bookmark, More와 각 count·상태·target 계약을 그대로 재사용한다. 일반·Repost·Quote Post surface에서 기존 target routing을 유지하되 Quote를 새 Action Bar action으로 추가하지 않는다. Viewer 전용 action row를 만들거나 Media를 action 대상으로 바꾸지 않는다. 기존 Post 링크 복사는 유지하지만 Media 파일 URL 복사·공유·다운로드·기기 저장은 제공하지 않는다.

## Sensitive, loading과 오류

- Sensitive Media가 가려진 동안에는 viewer 진입을 제공하지 않는다. Gallery에서 공개한 뒤에만 정상 tile이 viewer trigger가 된다.
- 열린 뒤 Media가 다시 가려지거나 현재 Post 접근 권한·revision이 유효하지 않게 되면 이미지를 계속 표시하지 않고 viewer를 닫는다.
- 현재 이미지가 loading 또는 실패해도 modal chrome, 현재 index와 Post detail panel은 유지한다.
- 실패한 Media는 같은 위치에서 다시 시도할 수 있고, retry는 현재 index를 바꾸거나 다른 Media의 상태를 초기화하지 않는다.
- 사용자에게 raw storage URL, 내부 오류 또는 authorization 세부 정보를 노출하지 않는다.

## Modal과 접근성

Viewer open 시 modal임을 전달하고 초기 focus를 명시적인 close control로 이동한다. `Escape`, close control, Native back으로 닫을 수 있다. Web backdrop press도 Viewer를 닫되 image·detail panel과 modal 내부 control의 press는 backdrop dismiss로 전파하지 않는다. Backdrop press를 유일한 dismiss 수단으로 사용하지 않는다. 닫을 때 원래 선택한 gallery tile이 여전히 존재하면 그 tile로 focus를 돌려보낸다. 대상이 사라졌다면 남아 있는 Post surface의 안전한 focus target으로 복귀한다.

Close, 이전·다음, 더 보기·접기와 retry는 keyboard·touch·Screen Reader에서 같은 기능을 제공하고 role, accessible name, disabled·expanded 상태를 전달한다. 현재 위치 변경은 이미지의 accessible name과 별도로 인지 가능하게 알린다.

## 검증 경계

- Component test는 선택 index, 동일 Post·revision 고정, Sensitive 재가림·삭제·조회 무효화 close, 비순환 이전·다음, Alt Text·fallback과 counter, 원문 접기·펼치기, fixed Action Bar 경계, loading·error·retry와 lifecycle close를 확인한다.
- Storybook은 1장과 다중 이미지, 긴 원문, 첫·중간·마지막 위치, loading·error, compact·wide Web layout을 확인한다.
- Web runtime은 backdrop·modal 내부 pointer 격리, keyboard arrow, Escape, focus trap·복귀와 `<768px`·`>=768px` layout을 관찰한다.
- iOS runtime은 touch, swipe, close·back과 VoiceOver를, Android runtime은 touch, swipe, close·back과 TalkBack을 각각 확인한다.
- 자동화·Storybook·Web 관찰은 iOS·Android runtime 접근성 증거를 대체하지 않으며 결과를 PR에 구분해 기록한다.

## 제외 범위

Zoom·pan, Media 편집·crop·caption·metadata, gallery layout 변경, viewer route·deep link, Media 전용 action bar와 파일 공유·다운로드·기기 저장은 제외한다. 기기 저장은 플랫폼별 permission, 파일 전달 방식과 실패·재시도 UX가 별도 제품·기술 계약을 필요로 하므로 후속 범위에서 다룬다.
