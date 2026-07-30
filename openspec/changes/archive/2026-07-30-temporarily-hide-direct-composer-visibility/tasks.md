## 1. PROD-580 Composer 공개 범위 임시 제한

**Authority / Provenance**

- `docs/domain/objects/post.md`
- [PROD-580](https://linear.app/byulmaru/issue/PROD-580/direct-%EA%B5%AC%ED%98%84-%EC%A0%84-composer%EC%9D%98-%EC%96%B8%EA%B8%89%ED%95%9C-%EA%B3%84%EC%A0%95%EB%A7%8C-%EC%98%B5%EC%85%98%EC%9D%84-%EC%9E%84%EC%8B%9C%EB%A1%9C-%EC%88%A8%EA%B8%B4%EB%8B%A4)

**Deliverable**

Web·Native Post Composer에서 `PUBLIC`, `UNLISTED`, `FOLLOWERS`만 선택·제출할 수 있고, 기본 `UNLISTED`와 기존 세 옵션 동작이 유지된다. `DIRECT`는 Composer에서 보이지 않으며 새 게시에 사용되지 않는다.

**Guardrails**

- `PostVisibility.DIRECT` enum, GraphQL/server visibility 코드와 기존 DIRECT 게시글의 저장·조회·표시 정책을 삭제하거나 변경하지 않는다.
- DIRECT option은 주석 처리하고 `TODO(PROD-462)` 복원 기준을 남긴다.
- Mentioned Profile recipient 모델·입력·저장·조회 권한, 본문 Mention UI와 notification은 포함하지 않는다.
- 기존 `UNLISTED` 기본값, 세 옵션의 label·description·icon, 선택 surface 종료와 제출 reset 동작을 유지한다.

**Verification**

- 구현 snapshot `4fe6578d707cffff05f3fc7175304b4c96b1002a`에서 shared Composer option의 DIRECT 주석/TODO와 enum·server 미변경을 확인한다.
- Posts Storybook interaction 34/34 통과로 DIRECT 미노출 및 기존 공개 범위 선택을 확인한다.
- Storybook build 통과로 Composer presentation artifact를 확인한다.
- Composer Web E2E 1/1 통과로 키보드 끝 이동이 `FOLLOWERS`에 도달하고 공개 게시 payload가 유지됨을 확인한다.
- Web check, ESLint, Prettier 통과를 확인한다.
- 전체 app check의 변경 외 route 타입 오류와 전체 Storybook의 변경 외 PostActionBar `aria-modal` a11y 오류는 알려진 범위 밖 aggregate failure로 기록하며 이 change의 수정 작업으로 확장하지 않는다.

- [x] 1.1 Composer의 Web·Native 공개 범위 surface에서 DIRECT option을 주석 처리하고 PROD-462 복원 TODO를 남긴다.
- [x] 1.2 Composer Storybook interaction에서 `언급한 계정만` 메뉴 항목이 없고 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 선택·기본값 동작이 유지되는지 검증한다.
- [x] 1.3 Composer Web E2E에서 공개 범위 메뉴 keyboard 경계가 마지막 `FOLLOWERS` option을 가리키고 DIRECT visibility를 새로 제출하지 않는지 검증한다.
- [x] 1.4 Posts Storybook 34/34, Storybook build, Composer E2E 1/1, Web check·ESLint·Prettier를 통과시키고 변경 외 aggregate failure를 알려진 제한으로 분리 기록한다.
