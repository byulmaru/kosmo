import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, memo } from 'react';
import { act, create } from 'react-test-renderer';
import { ShellChromeProvider, useShellChrome } from './ShellChromeContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test('경로만 바뀐 shell 갱신은 chrome 소비자를 다시 렌더링하지 않고 실제 drawer 변경은 전달한다', async () => {
  let renders = 0;
  const Consumer = memo(function Consumer() {
    renders += 1;
    const chrome = useShellChrome();
    return createElement('drawer-state', {
      onCompose: chrome?.openComposer,
      open: chrome?.navigationDrawerOpen,
    });
  });
  const openComposer = () => {};
  const actions = {
    openComposer,
    openNavigationDrawer: () => {},
    openProfileSwitcher: () => {},
    registerHomeReselection: () => () => {},
    reselectHome: () => {},
  };
  const render = (open: boolean) =>
    createElement(ShellChromeProvider, {
      ...actions,
      navigationDrawerOpen: open,
      children: createElement(Consumer),
    });
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(render(false));
  });
  try {
    const initialRenders = renders;
    assert.equal(
      renderer!.root.find((node) => (node.type as unknown) === 'drawer-state').props.onCompose,
      openComposer,
    );
    await act(async () => {
      renderer.update(render(false));
    });
    assert.equal(renders, initialRenders);
    await act(async () => {
      renderer.update(render(true));
    });
    assert.equal(
      renderer!.root.find((node) => (node.type as unknown) === 'drawer-state').props.open,
      true,
    );
    assert.equal(
      renderer!.root.find((node) => (node.type as unknown) === 'drawer-state').props.onCompose,
      openComposer,
    );
    assert.equal(renders, initialRenders + 1);
  } finally {
    await act(async () => {
      renderer!.unmount();
    });
  }
});
