import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type * as FormModule from './Form.web';

mock.module('react-native', {
  exports: { View: 'View' },
} as unknown as Parameters<typeof mock.module>[1]);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let Form: typeof FormModule.Form | undefined;

before(async () => {
  Form = (await import('./Form.web')).Form;
});

after(() => {
  mock.restoreAll();
});

test('Web form ignores IME Enter for the submit shortcut', async () => {
  assert.ok(Form);
  let submitCount = 0;
  let prevented = false;
  let requestSubmitCount = 0;
  let renderer: ReturnType<typeof create> | undefined;

  await act(async () => {
    renderer = create(
      createElement(
        Form!,
        {
          accessibilityLabel: 'Post composer',
          onSubmit: () => submitCount++,
          submitOnModEnter: true,
        },
        createElement('button', { type: 'submit' }, 'Publish'),
      ),
    );
  });

  const form = renderer!.root.findByType('form');
  const submitEvent = () =>
    form.props.onSubmit({
      preventDefault: () => undefined,
    });
  const keyDown = (nativeEvent: { isComposing: boolean; keyCode: number }) =>
    form.props.onKeyDownCapture({
      currentTarget: {
        requestSubmit: () => {
          requestSubmitCount += 1;
          submitEvent();
        },
      },
      ctrlKey: true,
      key: 'Enter',
      metaKey: false,
      nativeEvent,
      preventDefault: () => {
        prevented = true;
      },
    });

  await act(async () => keyDown({ isComposing: true, keyCode: 229 }));
  assert.equal(prevented, false);
  assert.equal(requestSubmitCount, 0);
  assert.equal(submitCount, 0);

  await act(async () => keyDown({ isComposing: false, keyCode: 229 }));
  assert.equal(prevented, false);
  assert.equal(requestSubmitCount, 0);
  assert.equal(submitCount, 0);

  await act(async () => keyDown({ isComposing: false, keyCode: 13 }));
  assert.equal(prevented, true);
  assert.equal(requestSubmitCount, 1);
  assert.equal(submitCount, 1);

  await act(async () => renderer!.unmount());
});
