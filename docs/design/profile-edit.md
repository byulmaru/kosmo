# 프로필 수정 화면

## 대상과 진입

- 현재 selected Active/Normal Local Profile의 Owner에게만 편집 진입을 제공한다.
- API 연결 전 UI 선제작 단계에서는 production navigation과 편집 버튼을 활성화하지 않는다. route와 상태
  카탈로그를 구현하더라도 저장 성공을 가장하거나 임시 local persistence를 만들지 않는다.
- API 연결이 완료되면 기존 프로필 편집 진입점을 활성화하고 selected Profile의 현재 값으로 화면을 연다.

## 필드

- 표시 이름: 필수, 앞뒤 공백을 정리한 1-40자.
- bio: 선택, 앞뒤 공백을 정리한 500자 이하.
- Follow Approval Policy: Open 또는 Approval Required.
- avatar와 header: 현재 이미지를 유지하거나, 해당 Profile이 업로드한 Ready Local Media로 교체하거나, 관계를
  제거할 수 있다.
- Profile Link는 이번 화면 범위에서 제외하고 별도 계약으로 전달한다.

## 저장 상태와 결과

- 초기 상태에서는 변경 사항이 없으므로 저장할 수 없다.
- 입력이 바뀌고 모든 validation을 통과해야 저장할 수 있다. validation 오류는 해당 입력 가까이에 표시한다.
- 이미지 교체는 업로드 완료와 Ready 확인 뒤 Profile 저장을 실행한다. 업로드 실패 시 Profile mutation을
  실행하지 않고 입력을 유지한다.
- 저장 중에는 입력과 저장 동작을 잠가 중복 제출을 막는다.
- 저장 실패 시 오류를 화면 안에 표시하고 입력을 유지해 재시도할 수 있게 한다.
- 저장 성공 시 갱신된 Profile 화면으로 돌아간다. 성공 전에 화면을 이동하거나 성공 상태를 표시하지 않는다.

## 플랫폼과 접근성

- Web, Android와 iOS는 같은 필드, validation, 상태 전이와 저장 결과를 제공한다.
- Web은 공용 `compact`/`full` breakpoint와 document scroll 정책을 사용한다. Android/iOS는 safe area를 포함한
  mobile header와 platform scroll을 유지한다.
- 버튼과 이미지 변경 동작은 최소 44x44 target, 의미가 드러나는 접근성 label과 disabled/loading state를
  제공한다.
- 색상, spacing, radius와 typography는 기존 theme token을 사용한다. UI label과 heading은 SUIT, bio처럼 긴
  텍스트 입력은 Pretendard를 사용한다.
