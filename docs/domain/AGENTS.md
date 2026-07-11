# docs/domain 작업 규칙

## 목적

`docs/domain`은 Kosmo의 도메인 원천 문서다. 구현 스펙, 테이블/컬럼 정의, resolver/API 세부, 현재 코드
감사 결과를 중심으로 쓰지 않는다. durable 객체, 상태, 속성, 관계, Mutation, 권한, 조회 정책을 기준으로
유지한다.

OpenSpec은 이 문서를 참조하는 downstream 구현 스펙이다. OpenSpec에만 있는 타입, nullable, 검증 값은
도메인 결정으로 자동 승격하지 않는다.

## 문서 위치

- `objects/`: durable 객체별 도메인 문서. 독립 identity와 생명주기를 가진 객체만 파일로 둔다.
- `policies/`: durable 객체가 아닌 교차 객체 조회 정책. 기술 projection이나 조회 결과 객체를 두지 않는다.
- `decisions/`: 확정된 보편 언어, 모델 소유권, 제외 범위 같은 장기 결정을 ADR 형태로 남긴다.
- `records/`: 특정 점검/대화에서 어떤 질문이 닫혔고 무엇이 남았는지 기록한다.

`records/`는 현재 canonical 명세가 아니라 이력 보존 문서다. 과거 record의 용어, 질문, 당시 결정 문장이
최신 문서와 다르다는 이유만으로 수정하지 않는다. 이동으로 깨진 링크만 고친다.

## 객체 문서 형식

각 객체 문서는 다음 섹션을 가진다.

- 정의: 객체가 대표하는 도메인 개념과 책임.
- 상태: 객체가 가진 상태 차원과 상태 값. 상태 차원은 enum type처럼, 값은 enum value처럼 명명한다.
- 속성: 객체가 가진 스칼라 값. 이름 있는 타입, nullable 여부, 검증 정책, 존재 조건, 조회 조건, 조회
  권한을 기록한다.
- 관계: 다른 durable 객체와의 연결. 방향, cardinality, 존재 조건, 조회 조건, 조회 권한을 기록한다.
- 행동: 객체를 바꾸는 Mutation. 행동 주체, 대상, 입력, 권한, 조건, 변경 결과를 기록한다.
- 권한: 주체가 대상에 대해 무엇인지 나타내는 사실. ACL action이나 계산 결과를 권한 이름으로 만들지 않는다.
- 조회 정책: 객체를 바꾸지 않는 조회/검색/노출 조건. 필요한 객체에만 둔다.
- 확정 용어: 한국어 표현과 canonical domain term.
- 제외/보류: 현재 범위에서 제외하거나 아직 확정하지 않은 항목.

`불변 조건` 섹션은 두지 않는다. 행동 전제는 `행동.조건`, 결과 보장은 `행동.결과`, 값 제약은
`속성.검증 정책`, uniqueness와 cardinality는 `관계`, 조회 제한은 `조회 조건`과 `조회 정책`에 둔다.

## 반영 기준

- 행동에는 Mutation만 둔다. 조회, 검색, lookup, 목록 계산, 접근 결과 반환, 생성 억제는 행동이 아니다.
- 상태 전이는 행동 결과에만 기록하고, 허용되는 현재 상태는 행동 조건에 기록한다.
- 권한은 `Account.Self`, `Profile.Owner`, `Post.Author`, `Notification.Recipient`처럼 사실을 나타낸다.
  `Visible`, `Accessible`, `Manage`, `Eligible`, `Repliable` 같은 능력 이름은 사용하지 않는다.
- 생성 전 객체의 Owner 권한을 생성 조건으로 사용하지 않는다. 생성에는 이미 존재하는 주체의 권한과 상태를
  사용하고 Owner 관계는 결과로 만든다.
- 관계가 아닌 값을 관계로 중복 저장하지 않는다. 대상 객체의 식별 값은 관계에서 파생한다.
- 확정하지 않은 타입이나 검증 정책을 placeholder로 남기지 않는다. canonical 본문에서 제거하고
  `제외/보류`에 기록한다.
- Post Visibility는 Post 상태 차원이다. Post Eligibility는 데이터를 가지는 속성이 아니라 Post가 소유한
  조회 후보성 정책이다.
- Repost는 Post Form 상태 값이며 별도 durable 객체가 아니다.
- Follow Request와 Follow Relationship은 별도 객체다.
- Account가 주체인 행동은 인증, Profile Owner/Member 권한, 운영자 권한에 한정한다. 기본 소셜 행동 주체는
  Profile이다.
- Messaging, Collection, 신고 처리 객체는 현재 도메인 범위에서 제외한다.

## 검증 명령

```sh
pnpm lint:prettier
node -e 'const fs=require("fs"),path=require("path"); const files=[]; function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name); if(e.isDirectory()) walk(p); else if(p.endsWith(".md")) files.push(p)}} walk("docs/domain"); const slug=s=>s.trim().toLowerCase().replace(/[^\p{Letter}\p{Number}\s-]/gu,"").replace(/\s+/g,"-"); const anchors=new Map(files.map(f=>[path.resolve(f),new Set(fs.readFileSync(f,"utf8").split(/\n/).filter(l=>/^#{1,6}\s+/.test(l)).map(l=>slug(l.replace(/^#{1,6}\s+/,""))))])); let bad=[]; for(const f of files){const s=fs.readFileSync(f,"utf8"); const re=/\[[^\]]*\]\(([^)]+)\)/g; let m; while((m=re.exec(s))){const href=m[1]; if(/^(https?:|mailto:)/.test(href)) continue; const [target,hash]=href.split("#"); const resolved=target?path.resolve(path.dirname(f),target):path.resolve(f); if(target&&!fs.existsSync(resolved)) bad.push(`${f}: ${href}`); else if(hash&&anchors.has(resolved)&&!anchors.get(resolved).has(hash)) bad.push(`${f}: ${href}`); }} if(bad.length){console.error(bad.join("\n")); process.exit(1)} console.log(`checked ${files.length} markdown links`);'
node -e 'const fs=require("fs"),path=require("path"); const files=fs.readdirSync("docs/domain/objects").filter(f=>f.endsWith(".md")).map(f=>path.join("docs/domain/objects",f)); const defs=new Set(); const refs=new Map(); for(const f of files){const s=fs.readFileSync(f,"utf8"); for(const m of s.matchAll(/^\|\s*`([A-Z][A-Za-z]+(?:\.[A-Za-z]+)+)`\s*\|/gm)) defs.add(m[1]); for(const m of s.matchAll(/`([A-Z][A-Za-z]+(?:\.[A-Za-z]+)+)`/g)){if(!refs.has(m[1])) refs.set(m[1],[]); refs.get(m[1]).push(f)}} const missing=[...refs.keys()].filter(x=>!defs.has(x)).sort(); if(missing.length){console.error("missing permission definitions:\n"+missing.map(x=>x+" <- "+[...new Set(refs.get(x))].join(", ")).join("\n")); process.exit(1)} console.log("all object permission refs are defined in object docs");'
node -e 'const fs=require("fs"),path=require("path"); const bad=[]; for(const f of fs.readdirSync("docs/domain/objects").filter(x=>x.endsWith(".md"))){const p=path.join("docs/domain/objects",f); const s=fs.readFileSync(p,"utf8"); if(/^## 불변[ ]조건$/m.test(s)) bad.push(`${p}: legacy invariant section`); if(/미[정]/.test(s)) bad.push(`${p}: undecided marker`); const rel=s.match(/## 관계\n[\s\S]*?\n(\|[^\n]+\|)/); if(rel&&!/방향/.test(rel[1])) bad.push(`${p}: relationship direction`); if(rel&&!/cardinality/.test(rel[1])) bad.push(`${p}: relationship cardinality`); const action=s.match(/## 행동\n([\s\S]*?)(?=\n## )/); if(action){for(const line of action[1].split(/\n/)){if(/^\|[^-].*\|/.test(line)&&/조회|검색|lookup|Lookup|억제/.test(line.split("|")[1]||"")) bad.push(`${p}: non-mutation action: ${line}`)}}} if(bad.length){console.error(bad.join("\n")); process.exit(1)} console.log("object document structure is valid");'
node -e 'const fs=require("fs"),path=require("path"); const banned=/\.(Visi[b]le|Accessi[b]le|Usa[b]le|Mana[g]e|Eligi[b]le|Eligible[P]rofile|Target[A]vailable|Replia[b]le|Repost[S]ource|Safe[S]cope|Home[V]iewer|Profile[V]iewer|Public[E]xplorer)\b/; const bad=[]; for(const f of fs.readdirSync("docs/domain/objects").filter(x=>x.endsWith(".md"))){const p=path.join("docs/domain/objects",f); const s=fs.readFileSync(p,"utf8"); for(const m of s.matchAll(/`([A-Z][A-Za-z]+(?:\.[A-Za-z]+)+)`/g)){if(banned.test(m[1])) bad.push(`${p}: ${m[1]}`)}} if(bad.length){console.error(bad.join("\n")); process.exit(1)} console.log("permissions are fact-named");'
node -e 'const fs=require("fs"),path=require("path"); const pattern=/사용자|User|Actor|actor|Share|share|Timeline|타임라인|비공개 게시|private 게시|공유|share\/repost|repost|\bprofile\b|\baccount\b|\bpost\b|Antenna|Keyword Feed|키워드 수집 피드/; const files=[]; function collect(p){const st=fs.statSync(p); if(st.isDirectory()) for(const e of fs.readdirSync(p,{withFileTypes:true})) collect(path.join(p,e.name)); else if(p.endsWith(".md")) files.push(p)} ["docs/domain/README.md","docs/domain/objects","docs/domain/policies","docs/domain/decisions"].forEach(collect); const bad=[]; for(const f of files){const text=fs.readFileSync(f,"utf8").replace(/\[([^\]]*)\]\([^)]+\)/g,"$1"); text.split(/\n/).forEach((line,i)=>{if(pattern.test(line)) bad.push(`${f}:${i+1}: ${line}`)})} if(bad.length){console.error(bad.join("\n")); process.exit(1)} console.log("no canonical term conflicts found");'
! rg -ni "c[o]ntext|컨텍[스]트|bounded c[o]ntex[t]|c[o]ntext[s]/" docs/domain/README.md docs/domain/AGENTS.md docs/domain/objects docs/domain/policies docs/domain/decisions
! rg -n "docs/f[e]ature[s]|c[o]ntext[s]/|objects/search[-]index\.md|objects/post-list[-]definition\.md|objects/profile-relation[-]rule\.md" docs/domain --glob '!docs/domain/records/**'
```
