# Script Memory

## Bun workspace scripts

- `bun run --workspaces <script>`는 루트 패키지의 `<script>`를 재귀 실행하지 않고, workspace 패키지들의 해당 script를 실행한다.
- 루트 `dev` 스크립트가 `infisical run -- bun run --parallel --workspaces dev`처럼 workspace script 실행을 감싸는 구조여도, 이것만으로 루트 `dev`가 자기 자신을 무한 재귀 호출한다고 판단하면 안 된다.
- 관련 리뷰를 작성하거나 수정할 때는 실제 재현 로그 없이 재귀 실행을 단정하지 않는다.
- 루트 script 래퍼 구조를 바꾸는 경우, 이 메모의 전제가 여전히 맞는지 확인하고 변경 사항을 업데이트한다.
