# Review Style: Comments And Conclusion

## Comment Shape

- 가능한 한 정확한 파일/라인에 단다.
- inline comment를 제출하기 직전에 live diff를 다시 조회하고 실제 changed hunk의 추가·수정 라인에 anchor한다.
- PR head가 force-push나 rebase로 바뀌었거나 `Line could not be resolved`가 반환되면 같은 line payload를 반복하지 말고 최신 diff에서 anchor를 다시 계산한다.
- 코멘트에는 다음 중 필요한 것을 포함한다.
  - 현재 코드가 만드는 동작
  - 실제 영향 또는 깨지는 workflow
  - 관찰한 재현 결과
  - 선호하는 수정 방향 또는 suggested change
  - 지금 PR에서 막아야 하는지, follow-up으로 둘 수 있는지
- actionable blocker와 non-blocking note를 구분한다.
- 후속 정책으로 미뤄도 되는 내용은 `TODO:` 주석, OpenSpec 남은 결정, 후속 PR/이슈로 남기도록 요구한다.

## Priority Labels

- `P1`: merge 전에 고쳐야 하는 동작/보안/캐시/API 계약 문제.
- `P2`: 지금 고치는 편이 좋지만, 범위와 위험에 따라 후속으로 분리할 수 있는 문제.
- `P3`: 설계 방향이나 미래 정책을 위해 짚는 낮은 우선순위 문제.
- `P5`: 사소한 일관성, 불필요한 변수/wrapper, 정리성 문제.
- priority를 붙이면 이유도 함께 적는다. 숫자만 남기지 않는다.

## Review Conclusion

- 최종 결론은 PR의 목적, 사용자·외부 시스템에 보이는 변화, 실제 실행 흐름, 확인된 finding, 범위 밖 또는 후속 문제, 검증 결과와 merge 가능 여부 순으로 설명한다.
- `문제가 없어 보인다`로 끝내지 않는다. 필수 CI, unresolved thread, public contract, failure isolation과 알려진 제한의 ownership을 근거로 지금 merge 가능한지 명시한다.
