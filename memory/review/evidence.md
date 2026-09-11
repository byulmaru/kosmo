# Review Style: Evidence

## Finding Evidence

- finding을 유지하기 전에 production caller, 저장 상태 전이, base branch/merge tree, PR이 만든 변화인지와 실제 domain contract 위반을 확인한다.
- test-only injected path나 가능성만 있는 문제를 확인된 production defect처럼 표현하지 않는다.
- 반대로 현재 caller가 없다는 이유만으로 잘못된 public interface를 허용하지 않는다. 공개 contract 자체가 caller에게 암시적이거나 잘못된 조합을 허용하는지도 별도로 판단한다.
- 코드가 짧다는 이유로 암시적 설계를 선택하지 않고, 미래 확장을 이유로 coordinator, mode, port 같은 추측성 추상화도 만들지 않는다. 현재 요구를 만족하는 최소한의 명시적 contract를 선호한다.
