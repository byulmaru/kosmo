## Purpose

kosmo 웹 애플리케이션의 공통 앱 shell 계약을 문서화한다. 이 스펙은 탭 기반 화면 구조, 안전 영역 처리, 공통 하단 navigation 표시를 다룬다.

## Requirements

### Requirement: Tab shell layout

웹 애플리케이션은 탭 화면에 공통 하단 탭 바를 표시해야 한다(MUST).

#### Scenario: Render tab page shell

- **WHEN** 사용자가 `(tabs)` layout 아래의 페이지를 본다
- **THEN** 시스템은 안전 영역 상단 padding과 하단 탭 공간을 포함하는 main 영역에 페이지 내용을 렌더링한다
- **AND** 하단에 `BottomTabBar`를 표시한다
