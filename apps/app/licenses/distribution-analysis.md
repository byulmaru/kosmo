# Historical three-platform distribution license inventory

> This analysis describes the former Expo export and native autolinking package scope. The current generated artifact uses the complete `@kosmo/app` pnpm production license report, which also includes production dependencies that may not appear in app exports. The counts and reproduction behavior below are historical and do not describe the current artifact.

## Captured package set

The inventory was captured from repository base `bbb7820dc57693f23d4eb30e0064abacc3c7476c`.

| Production target                                              | npm package versions |
| -------------------------------------------------------------- | -------------------: |
| Web                                                            |                   98 |
| Android                                                        |                  129 |
| iOS                                                            |                  128 |
| Union                                                          |                  162 |
| App artifact, including the emoji and Hope:RE attribution rows |                  166 |

The collector uses production Expo exports and their source and asset maps for all three targets, Expo and React Native native autolinking for Android and iOS, and font resources from evaluated Expo public config. It selects those package identities from pnpm's production license report before reading license text. The 13 pending-notice rows remain unchanged; only `standard-navigation@0.0.5` is in this distribution set. Its artifact text remains blank.

The exact union of 162 npm package versions was verified again on `cdaff941609dc5e1d5be2911b04570aff61589bb`. This change preserves the 164 npm rows and existing emoji attribution, and adds Hope:RE for 166 total entries.

## `standard-navigation@0.0.5`

The [npm version record](https://registry.npmjs.org/standard-navigation/0.0.5) declares MIT and points to upstream commit `0016fae7800b9f27bab91326697b740a6d2266dc`. The [published npm tarball](https://registry.npmjs.org/standard-navigation/-/standard-navigation-0.0.5.tgz) matched the registry SHA-1 and SRI. Neither that exact tarball nor the [linked immutable source commit](https://github.com/react-navigation/standard-navigation/tree/0016fae7800b9f27bab91326697b740a6d2266dc) contained a nonempty license or notice file or copyright/license text in the inspected text files. There is no authentic original text to add. The artifact preserves the empty pending row; the UI omits blank-text rows, which does not resolve this evidence gap.

## Current artifact generation

After changing `@kosmo/app` production dependencies, manually regenerate the current artifact with the repository-pinned Node `26.12.1` and pnpm `11.28.8` toolchain:

```sh
pnpm --filter @kosmo/app licenses:generate
```

The generator reads the complete pnpm production license report for `@kosmo/app`. It includes dependencies that may not appear in Expo exports. The generator itself does not invoke Relay, Expo exports, or optional-package installation, and does not compare the result with the committed artifact automatically.

## Audit boundary

The inventory identifies shipped npm package source, emitted web assets, and npm roots reported by Expo and React Native native autolinking. It is conservative input for notice generation, not a complete native dependency or binary audit. Third-party Maven, CocoaPods, Swift Package Manager, and Hermes/binary contents have not been inventoried here.
