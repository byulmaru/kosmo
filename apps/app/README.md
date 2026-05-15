# Kosmo Native App

Native WebView shells for the Kosmo web app.

## Structure

- `android/`: Kotlin Android app that hosts `https://kos.moe` in `WebView`.
- `ios/`: Swift iOS app that hosts `https://kos.moe` in `WKWebView`.

Both apps use the existing app identifier `moe.kos` and the custom callback URL `kosmo://login/callback`.

## Login Flow

1. The WebView loads `https://kos.moe`.
2. When the WebView navigates to `https://kos.moe/login`, native code cancels the navigation.
3. Android opens the OIDC authorize URL with Custom Tabs.
4. iOS opens the OIDC authorize URL with `ASWebAuthenticationSession`.
5. The OIDC provider redirects to `kosmo://login/callback`.
6. Native code validates `state` and loads `https://kos.moe/login/callback` in the WebView with the authorization `code`, `state`, `code_verifier`, and `redirect_uri`.
7. The web server should exchange the code and set the app WebView session cookie with `Set-Cookie` before redirecting back to `/`.

## Configuration

Android expects an OIDC client id from the public build-time environment variable `PUBLIC_OIDC_CLIENT_ID`. The web origin can be overridden with `PUBLIC_ORIGIN` and defaults to `https://kos.moe`. Cleartext traffic is enabled only when `PUBLIC_ORIGIN` starts with `http://`.

```sh
pnpm --dir apps/app/android build
```

iOS expects an OIDC client id from the public build-time environment variable `PUBLIC_OIDC_CLIENT_ID`. The web origin can be overridden with `PUBLIC_ORIGIN` and defaults to `https://kos.moe`. A host-specific ATS exception is enabled only when `PUBLIC_ORIGIN` starts with `http://`. Code signing uses the Apple development team selected in the Xcode project.

```sh
pnpm --dir apps/app/ios build
```

To build, install, and launch on a selected physical iOS device:

```sh
pnpm --dir apps/app/ios run
```

## Web Contract

The native apps assume these web routes exist:

- `GET /login`: starts login in a browser on the web, but is intercepted by native WebView shells.
- `GET /login/callback`: accepts the native OIDC callback parameters, exchanges the code, sets the HttpOnly session cookie, and redirects to `/`.

The web route implementation is intentionally separate from this native app scaffold.
