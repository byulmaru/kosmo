# React Native KeyboardAvoidingView patch

This is maintenance context for the temporary `react-native@0.85.3` patch in
[`pnpm-workspace.yaml`](../pnpm-workspace.yaml) and
[`react-native@0.85.3.patch`](react-native@0.85.3.patch). It addresses PROD-1210.

## Rationale and boundary

On Android, React Native 0.85.3 sends `keyboardDidHide` to the keyboard-frame
change handler. That handler retains the hidden event's coordinates and can
leave `KeyboardAvoidingView` with a non-zero bottom correction after the
keyboard is gone, especially after delayed layout updates. The patch routes
Android `keyboardDidHide` through the existing hide handler, matching the iOS
hide path. It changes no app component, public API, or dependency version.

The patch was created with:

```sh
pnpm patch react-native@0.85.3 --edit-dir <temporary-absolute-directory>
pnpm patch-commit <temporary-absolute-directory>
```

Keep the focused behavioral test in
[`KeyboardAvoidingView.native.test.ts`](../apps/app/src/components/post/KeyboardAvoidingView.native.test.ts)
with the patch. The test executes the installed RN implementation through the
installed Babel preset and mocks only native emitter, View, layout-animation,
and platform boundaries. It is not a replacement for device validation.
For a pre-patch comparison without changing the installed package, set
`KOSMO_TEST_RN_KAV_SOURCE` to a temporary copy of the original source.

## Removal gate

Remove this patch only after a React Native release provides equivalent Android
`KeyboardAvoidingView` hide semantics. Compare the upstream source and rerun
the focused test against the unpatched release before removing the patch and
its lockfile metadata.

On an Android API 36 emulator, the actual composer host retained about 54dp of
bottom correction after hide before the patch. With the patch, four show/hide
cycles restored the full height with zero bottom correction; ALT text and media
sensitivity survived editor interactions. The diagnostic used local media and
upload stubs.

On a Samsung SM-S926N running Android 16, the same isolated composer diagnostic
retained about 34dp before the patch and restored full height with zero bottom
correction after all four patched show/hide cycles. Body text, ALT text, and
media sensitivity were preserved. The patched composer and editor remained
stationary during the recorded idle windows. However, the diagnostic did not
reproduce the original production app's continuous oscillation even before the
patch, so these results verify residual-height recovery, not complete resolution
of that production symptom. Full-app validation remains outstanding.
