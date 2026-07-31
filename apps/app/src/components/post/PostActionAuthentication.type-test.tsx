import { PostActionAuthenticationProvider } from './PostActionAuthentication';

export function SessionOverrideIsNotAProductionProviderProp() {
  return (
    // @ts-expect-error Storybook session state belongs in SessionProvider fixtures.
    <PostActionAuthenticationProvider sessionOverride={null} />
  );
}

export function GuestCallbackIsNotAProductionProviderProp() {
  return (
    // @ts-expect-error Guest resolution belongs to the production login lifecycle.
    <PostActionAuthenticationProvider onGuestResolution={() => undefined} />
  );
}

export function ProfileCallbackIsNotAProductionProviderProp() {
  return (
    // @ts-expect-error Profile resolution belongs to ShellChromeContext.
    <PostActionAuthenticationProvider onProfileResolution={() => undefined} />
  );
}
