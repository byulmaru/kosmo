import { View } from 'react-native';
import type { FormEvent, KeyboardEvent } from 'react';
import type { FormProps } from './Form';

export function Form({
  accessibilityLabel,
  children,
  onSubmit,
  submitOnModEnter = false,
  style,
}: FormProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) {
      return;
    }

    event.preventDefault();
    event.currentTarget.requestSubmit();
  };

  return (
    <View accessibilityLabel={accessibilityLabel} style={style}>
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
