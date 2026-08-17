# Figma 증거 수집

## 도구 역할

- `get_metadata`: 페이지·node 범위를 좁히는 overview. 상세 판정 근거로 단독 사용하지 않는다.
- `use_figma`: 구조, geometry, style·variable binding, component·variant를 읽는 주 도구. 모든 호출 전에 `figma:figma-use`를 로드하고 `skillNames: "figma-use"`를 전달한다.
- `get_screenshot`: 실제 위계, clipping, optical alignment, Light/Dark의 시각 증거.
- `get_variable_defs`: 선택 node에 적용된 variable과 해석값.
- `search_design_system`: 대체할 기존 component·variable·style을 찾을 때만 사용한다.

감사 단계의 `use_figma` 코드는 `setCurrentPageAsync`, node 생성·삭제, property assignment, variable/style 생성, `figma.notify`를 호출하지 않는다.

## 1차 구조 덤프

`TARGET_NODE_ID`만 바꿔 실행한다. 대형 screen은 먼저 하위 section으로 범위를 좁힌다.

```js
const TARGET_NODE_ID = '200:1';
const MAX_NODES = 400;
const root = await figma.getNodeByIdAsync(TARGET_NODE_ID);
if (!root) return { error: `Node not found: ${TARGET_NODE_ID}` };

const mixed = (value) => (typeof value === 'symbol' ? 'MIXED' : value);
const aliases = (value) =>
  Object.fromEntries(
    Object.entries(value ?? {}).map(([key, alias]) => [
      key,
      Array.isArray(alias) ? alias.map((item) => item?.id ?? null) : (alias?.id ?? null),
    ]),
  );
const paints = (value) =>
  Array.isArray(value)
    ? value.map((paint) => ({
        type: paint.type,
        visible: paint.visible,
        opacity: paint.opacity,
        color: paint.type === 'SOLID' ? paint.color : undefined,
        boundVariables: aliases(paint.boundVariables),
      }))
    : mixed(value);

const nodes = [];
const visit = async (node) => {
  if (nodes.length >= MAX_NODES) return;
  const isText = node.type === 'TEXT';
  const mainComponent = node.type === 'INSTANCE' ? await node.getMainComponentAsync() : null;
  nodes.push({
    id: node.id,
    name: node.name,
    type: node.type,
    parentId: node.parent?.id,
    visible: node.visible,
    opacity: 'opacity' in node ? node.opacity : undefined,
    x: 'x' in node ? node.x : undefined,
    y: 'y' in node ? node.y : undefined,
    width: 'width' in node ? node.width : undefined,
    height: 'height' in node ? node.height : undefined,
    layoutMode: 'layoutMode' in node ? node.layoutMode : undefined,
    layoutPositioning: 'layoutPositioning' in node ? node.layoutPositioning : undefined,
    primaryAxisSizingMode: 'primaryAxisSizingMode' in node ? node.primaryAxisSizingMode : undefined,
    counterAxisSizingMode: 'counterAxisSizingMode' in node ? node.counterAxisSizingMode : undefined,
    padding:
      'paddingTop' in node
        ? {
            top: node.paddingTop,
            right: node.paddingRight,
            bottom: node.paddingBottom,
            left: node.paddingLeft,
          }
        : undefined,
    itemSpacing: 'itemSpacing' in node ? node.itemSpacing : undefined,
    clipContent: 'clipsContent' in node ? node.clipsContent : undefined,
    cornerRadius: 'cornerRadius' in node ? mixed(node.cornerRadius) : undefined,
    corners:
      'topLeftRadius' in node
        ? {
            topLeft: node.topLeftRadius,
            topRight: node.topRightRadius,
            bottomRight: node.bottomRightRadius,
            bottomLeft: node.bottomLeftRadius,
          }
        : undefined,
    cornerSmoothing: 'cornerSmoothing' in node ? node.cornerSmoothing : undefined,
    fills: 'fills' in node ? paints(node.fills) : undefined,
    strokes: 'strokes' in node ? paints(node.strokes) : undefined,
    strokeWeight: 'strokeWeight' in node ? mixed(node.strokeWeight) : undefined,
    styleIds: {
      fill: 'fillStyleId' in node ? mixed(node.fillStyleId) : undefined,
      stroke: 'strokeStyleId' in node ? mixed(node.strokeStyleId) : undefined,
      effect: 'effectStyleId' in node ? mixed(node.effectStyleId) : undefined,
      text: 'textStyleId' in node ? mixed(node.textStyleId) : undefined,
    },
    boundVariables: 'boundVariables' in node ? aliases(node.boundVariables) : undefined,
    mainComponentId: mainComponent?.id,
    componentProperties: 'componentProperties' in node ? node.componentProperties : undefined,
    variantProperties: 'variantProperties' in node ? node.variantProperties : undefined,
    text: isText
      ? {
          length: node.characters.length,
          textAutoResize: node.textAutoResize,
          fontName: mixed(node.fontName),
          fontSize: mixed(node.fontSize),
          lineHeight: mixed(node.lineHeight),
          hasMissingFont: node.hasMissingFont,
        }
      : undefined,
  });
  if ('children' in node) {
    for (const child of node.children) await visit(child);
  }
};

await visit(root);
const componentSet =
  root.type === 'COMPONENT_SET' ? root : root.parent?.type === 'COMPONENT_SET' ? root.parent : null;
return {
  target: { id: root.id, name: root.name, type: root.type },
  componentContext: {
    componentSet: componentSet ? { id: componentSet.id, name: componentSet.name } : null,
    siblingVariants: componentSet
      ? componentSet.children.map((node) => ({
          id: node.id,
          name: node.name,
          type: node.type,
        }))
      : [],
    propertyDefinitions:
      'componentPropertyDefinitions' in root ? root.componentPropertyDefinitions : undefined,
  },
  nodeCount: nodes.length,
  truncated: nodes.length >= MAX_NODES,
  nodes,
};
```

source 수정 제안 직전에만 영향 범위를 별도로 수집한다. `COMPONENT_SET`이면 실제 수정할 child component마다 실행한다.

```js
const SOURCE_NODE_ID = '200:1';
const MAX_INSTANCES = 200;
const source = await figma.getNodeByIdAsync(SOURCE_NODE_ID);
if (!source || source.type !== 'COMPONENT') {
  return { error: `Component not found: ${SOURCE_NODE_ID}` };
}
const instances = await source.getInstancesAsync();
return {
  source: { id: source.id, name: source.name },
  total: instances.length,
  truncated: instances.length > MAX_INSTANCES,
  instances: instances.slice(0, MAX_INSTANCES).map((node) => ({
    id: node.id,
    name: node.name,
    parentId: node.parent?.id,
    componentProperties: node.componentProperties,
  })),
};
```

이 목록은 consumer 수와 component property override를 보여준다. text·nested override 등 세부 override가 노출되지 않으면 임의로 추정하지 말고 영향 범위 검증 공백으로 남긴다.

## 판정 순서

1. source/instance와 감사 범위를 확인한다.
2. raw 값, style ID, variable alias를 함께 본다. raw 해석값이 있어도 binding이 있으면 raw 사용으로 오판하지 않는다.
3. parent padding, child x/y·크기, corner별 radius를 비교한 뒤에만 nested radius 후보를 판단한다.
4. variant 이름만 보고 state 완성도를 선언하지 않는다. 실제 component properties와 대표 screenshot을 확인한다.
5. Light/Dark는 같은 source·내용·크기의 evidence pair로 비교한다.
6. 긴 한국어·영어 확장은 source를 바꾸지 않는 임시 대표 instance나 기존 specimen이 있을 때 검사한다. 감사 단계에서 새 node를 만들지 않는다.
7. Figma에서 증명할 수 없는 항목은 runtime 검증 목록으로 이동한다.

## 최소 증거 묶음

- target source node ID와 scope screenshot
- 구조 덤프의 relevant node 일부
- 적용 variable 정의와 mode
- 필요한 state·variant screenshot
- source 수정 시 영향받는 instance와 override 요약
- 확인하지 못한 platform·theme·state·runtime 목록
