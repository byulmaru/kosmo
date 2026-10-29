import { expect, userEvent, within } from 'storybook/test';

async function pointerAt(container: HTMLElement, x: number, y: number, drag = 0) {
  const target = container.ownerDocument.elementFromPoint(x, y)!;
  expect(target).not.toBeNull();
  const coords = (offset: number) => ({
    clientX: x,
    clientY: y + offset,
    pageX: x + window.scrollX,
    pageY: y + offset + window.scrollY,
  });
  await userEvent.pointer([
    { keys: '[MouseLeft>]', target, coords: coords(0) },
    ...(drag
      ? [
          { target, coords: coords(drag) },
          { target, coords: coords(0) },
        ]
      : []),
    { keys: '[/MouseLeft]', target, coords: coords(0) },
  ]);
}

export async function checkReactionSummaryExcludedTouches(
  container: HTMLElement,
  assertUnchanged: () => void,
) {
  const scope = within(container);
  const background = await scope.findByTestId('reaction-summary-detail-background');
  background.scrollIntoView({ block: 'center' });
  const row = scope.getByTestId('reaction-summary-row');
  const people = within(row).getByRole('link', { name: /반응한 프로필 보기/ });
  const controls = [...within(row).getAllByRole('button'), people];
  const peopleBounds = people.getBoundingClientRect();
  const bounds = background.getBoundingClientRect();
  expect(bounds.left - peopleBounds.right).toBe(4);
  expect(bounds.right).toBe(row.getBoundingClientRect().right);
  const y = (bounds.top + bounds.bottom) / 2;
  for (let index = 1; index < controls.length; index += 1) {
    const previous = controls[index - 1]!.getBoundingClientRect();
    const current = controls[index]!.getBoundingClientRect();
    await pointerAt(container, (previous.right + current.left) / 2, y);
    assertUnchanged();
  }
  await pointerAt(container, peopleBounds.right + 2, y);
  assertUnchanged();
  await pointerAt(container, (bounds.left + bounds.right) / 2, y, 30);
  assertUnchanged();
}

export async function tapReactionSummaryWhitespace(container: HTMLElement, fraction = 0.5) {
  const background = await within(container).findByTestId('reaction-summary-detail-background');
  background.scrollIntoView({ block: 'center' });
  const bounds = background.getBoundingClientRect();
  expect(bounds.width).toBeGreaterThan(2);
  const x = bounds.left + 1 + (bounds.width - 2) * fraction;
  const y = (bounds.top + bounds.bottom) / 2;
  expect(container.ownerDocument.elementFromPoint(x, y)).toBe(background);
  await pointerAt(container, x, y);
}
