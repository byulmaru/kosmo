# Profile 삭제 UI · PROD-943

## 계약

`/settings/profile`은 선택된 Active/Normal Local Profile의 Owner에게 `프로필 삭제` action을 제공한다. 이는
Settings에서 Owner에게 제공하는 단일 Profile lifecycle action이며 별도 비활성화, 재활성화, Owner 영구 삭제 UI는 없다.

사용자가 확정한 Profile 삭제는 기존 소프트 딜리트 동작으로 Lifecycle State를 `Deactivated`로 바꾼다. 성공한
Profile은 더 이상 선택·사용할 수 없으며 사용 가능한 Profile 목록과 navigation은 서버 상태를 반영한다. 기존
Lifecycle State와 service/API 이름은 바꾸지 않는다.

현재 Session은 로그인 상태를 유지한다. 삭제한 Profile이 선택되어 있었다면 요청 결과를 받은 클라이언트는
사용 가능한 Profile 하나를 선택해 저장하고, 사용할 Profile이 없으면 선택을 비운다. 지연된 이전 응답은 이후
선택된 Profile이나 Account의 화면 상태를 바꾸지 않는다.

## 확인과 오류 복구

- 확인 화면에서 대상 Profile identity와 삭제 action을 확인하고 acknowledgement를 keyboard로 조작할 수 있다.
  acknowledgement control은 checkbox role과 checked/disabled 상태를 제공한다.
- 확인 화면 진입 시 설명 시작 위치에 focus를 두고, 취소하면 `프로필 삭제` action으로 focus를 돌린다.
- 취소 후 다시 진입하거나 대상 Profile이 바뀌면 acknowledgement를 초기화한다.
- 요청 중에는 중복 확인, 취소·dismiss, acknowledgement 변경을 막는다.
- 오류 뒤에도 대상과 acknowledgement를 유지하고 같은 삭제 action으로 재시도할 수 있다.

Web·Android·iOS는 같은 권한·삭제 결과·오류 복구 계약을 사용한다. 자동화 결과와 아직 남은 기기·보조기술
QA는 별도 증거로 기록한다.

## 파기 경계

30일 후 물리 파기는 별도 [PROD-1110](https://linear.app/byulmaru/issue/PROD-1110/%EB%B9%84%ED%99%9C%EC%84%B1%ED%99%94%EB%90%9C-local-profile%EC%9D%98-30%EC%9D%BC-%ED%9B%84-%EC%8B%9C%EC%8A%A4%ED%85%9C-%ED%8C%8C%EA%B8%B0%EB%A5%BC-%EA%B5%AC%ED%98%84%ED%95%9C%EB%8B%A4)가 다룬다. 이 Settings 흐름은 파기 시점이나 동작을 약속하지 않는다.
