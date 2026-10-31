import { View } from 'react-native';
import type { FormEvent, KeyboardEvent } from 'react';
import type { FormProps } from './Form';

export function Form({
  accessibilityLabel,
  accessibilityElementsHidden,
  children,
  'aria-hidden': ariaHidden,
  onSubmit,
  pointerEvents,
  submitOnModEnter = false,
  style,
}: FormProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
      return;
    }
    if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) {
      return;
    }

    event.preventDefault();
    event.currentTarget.requestSubmit();
  };

  return (
    <View
      accessibilityElementsHidden={accessibilityElementsHidden}
      accessibilityLabel={accessibilityLabel}
      aria-hidden={ariaHidden}
      pointerEvents={pointerEvents}
      style={style}
    >
      <form
        onKeyDownCapture={submitOnModEnter ? handleKeyDown : undefined}
        onSubmit={handleSubmit}
        style={{ display: 'contents' }}
      >
        {children}
      </form>
    </View>
  );
}
