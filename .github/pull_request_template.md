## 무엇을 변경했나요

<!-- 리뷰어가 diff를 열기 전에 큰 구조를 이해할 수 있도록 구체적으로 적어 주세요. -->

## 왜 변경했나요

<!-- 사용자·시스템 문제와 이 변경으로 줄어드는 문제를 설명해 주세요. -->

## 이번 PR의 주요 결정

<!--
사람이 내린 중요한 구현 결정을 기록합니다. 중요한 결정은 실질적인 대안이 있었고 관찰 가능한 행동,
데이터, 보안, 호환성, rollout, 가역성 또는 후속 구현 방향에 영향을 주는 선택입니다.

계획·구현 중 최종 선택과 이유는 사람이 결정합니다. AI는 그 결과를 이 PR의 결정문으로 정리할 수 있지만,
근거가 없거나 불명확한 선택과 이유를 새로 추론해서는 안 됩니다.
Canonical 문서와 Linear에는 비즈니스 요구사항·관찰 가능한 보장·정책·범위와 그 이유를 남기고, 함수·파일·
데이터 구조·프레임워크와 같은 구현 수단은 코드·테스트·PR에 남깁니다. OpenSpec은 선택적인 세션 메모일
뿐이며 권위, 승인 ledger, PR gate가 아닙니다. 필요할 때만 관련 맥락으로 링크해 주세요.

새로 내린 중요한 결정이 없다면 아래 항목을 지우고 "없음"이라고 적어 주세요.
-->

### 결정 제목

- 결정자: @작성자
- 선택:
- 고려한 대안:
- 이유:
- 감수한 결과:
- 관련 근거:

## UI 계약과 consumer 경계

<!-- UI를 변경하지 않는 backend·data PR은 "해당 없음"이라고 적어도 됩니다. 이 항목의 작성이나 UI Contract classifier 결과만으로 승인·분리가 확정되는 것은 아닙니다. -->

- 기존 UI 계약을 재사용했다면 component의 named prop·variant·조합 지점과 Production story/source 경로를 적어 주세요.
- 새 component·variant·public visual prop 또는 작은 시각 계약을 바꿨다면 canonical component와 대표 story의 근거를 적어 주세요.
- layout·placement와 component-owned visual override를 구분하고, route·data·Relay·API·mutation·cache·권한·feature flag 변경은 대응 runtime 경로의 근거와 함께 적어 주세요.
- UI 시각 변경과 runtime 기능 변경이 함께 있다면 이는 리뷰 참고 근거이며 PR 분리를 강제하지 않습니다. 불필요한 중복 UI는 canonical component 재사용을 우선하고, variant/public visual prop 변경은 상태와 근거를 자세히 적어 주세요.

## 커스텀 아이콘 (해당하는 경우에만)

<!--
새 custom icon과 예외 등록은 canonical UI component와 대표 component/pattern story의 근거를 함께 적어 주세요.
실제 runtime consumer·Relay·route·feature flag 연결의 영향과 검증도 적어 주세요. 해당하지 않는 PR에서는 이 항목을 지워도 됩니다.
-->

- 고려한 Lucide 대안:
- 미채택 이유:

## 어떻게 확인할 수 있나요

<!-- 자동 테스트, 수동 검증과 재현 가능한 명령을 적어 주세요. 확인하지 못한 항목은 이유를 명시해 주세요. -->

## 아직 어떤 문제가 남았나요

<!-- 열린 질문, 후속 작업, 회귀 위험, 운영 영향과 의도적으로 남긴 제한을 적어 주세요. 없으면 "없음"이라고 적어 주세요. -->
