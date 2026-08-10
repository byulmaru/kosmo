import { View } from 'react-native';
import type { FormEvent, KeyboardEvent } from 'react';
import type { PostComposerFormProps } from './PostComposerForm';

export function PostComposerForm({
  accessibilityLabel,
  children,
  onSubmit,
  style,
}: PostComposerFormProps) {
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
        onKeyDownCapture={handleKeyDown}
        onSubmit={handleSubmit}
        style={{ display: 'contents' }}
      >
        {children}
      </form>
    </View>
  );
}
