# App distribution license inventory

## Captured package set

The inventory was captured from repository base `bbb7820dc57693f23d4eb30e0064abacc3c7476c`.

| Production target                                 | npm package versions |
| ------------------------------------------------- | -------------------: |
| Web                                               |                   98 |
| Android                                           |                  129 |
| iOS                                               |                  128 |
| Union                                             |                  162 |
| App artifact, including the emoji attribution row |                  163 |

The collector uses production Expo exports and their source and asset maps for all three targets, Expo and React Native native autolinking for Android and iOS, and font resources from evaluated Expo public config. It selects those package identities from pnpm's production license report before reading license text. The 13 pending-notice rows remain unchanged; only `standard-navigation@0.0.5` is in this distribution set. Its artifact text remains blank.

The exact union of 162 npm package versions was verified again on `cdaff941609dc5e1d5be2911b04570aff61589bb`; the committed 163-entry app artifact retains the separate emoji attribution row.

## `standard-navigation@0.0.5`

The [npm version record](https://registry.npmjs.org/standard-navigation/0.0.5) declares MIT and points to upstream commit `0016fae7800b9f27bab91326697b740a6d2266dc`. The [published npm tarball](https://registry.npmjs.org/standard-navigation/-/standard-navigation-0.0.5.tgz) matched the registry SHA-1 and SRI. Neither that exact tarball nor the [linked immutable source commit](https://github.com/react-navigation/standard-navigation/tree/0016fae7800b9f27bab91326697b740a6d2266dc) contained a nonempty license or notice file or copyright/license text in the inspected text files. There is no authentic original text to add. The artifact preserves the empty pending row; the UI omits blank-text rows, which does not resolve this evidence gap.

## Reproduction

Use the repository-pinned Node `26.12.1` and pnpm `11.28.8` toolchain:

```sh
pnpm --filter @kosmo/app licenses:generate
pnpm --filter @kosmo/app licenses:verify
pnpm --filter @kosmo/app licenses:check
```

`licenses:generate` runs Relay, performs fresh production exports with `--no-bytecode`, and writes the exact union. These temporary exports retain the source and asset maps used for package collection; they are analysis inputs, not release artifacts. `licenses:verify` repeats scope collection and checks the exact package set, full notice records, and source checksum without writing. `licenses:check` performs no exports or installs; it checks the committed artifact and its selected records against installed production metadata. The app `check` runs that light check, Relay, `licenses:verify`, then TypeScript. Install-time `prepare` does not run exports.

## Audit boundary

The inventory identifies shipped npm package source, emitted web assets, and npm roots reported by Expo and React Native native autolinking. It is conservative input for notice generation, not a complete native dependency or binary audit. Third-party Maven, CocoaPods, Swift Package Manager, and Hermes/binary contents have not been inventoried here.
