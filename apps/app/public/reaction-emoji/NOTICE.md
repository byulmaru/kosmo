# Reaction emoji assets

This directory contains the pinned static assets used by KOSMO reactions. Runtime code does not download from these upstream hosts.

## Pinned sources

- Unicode 17.0.0 fully-qualified emoji data: <https://www.unicode.org/Public/17.0.0/emoji/emoji-test.txt>
  - SHA-256: `1d8a944f88d7952f7ef7c5167fef3c67995bcae24543949710231b03a201acda`
- CLDR 48.0.0 JSON annotations (`en`, `ko`, full and derived): <https://github.com/unicode-org/cldr-json/tree/48.0.0>
  - Archive URL: <https://github.com/unicode-org/cldr-json/archive/refs/tags/48.0.0.zip>
  - SHA-256: `33533684f537a6679c1720f37bdc6780f4b74f35b1e7ae2e1fe771be01b263e2`
- Noto Emoji v2.051: <https://github.com/googlefonts/noto-emoji/releases/tag/v2.051>
  - Archive URL: <https://github.com/googlefonts/noto-emoji/archive/refs/tags/v2.051.zip>
  - SHA-256: `8bf6ee50a5ae5873880a9541be3d532f9db10673013892084a04673c8c1e580b`

## Included files

- 3,682 ordinary emoji PNGs from Noto `png/72`.
- 262 country and subdivision flag SVGs from Noto `third_party/region-flags/waved-svg`.
- Each source emoji is fully-qualified in Unicode 17; the Unicode string remains the catalog id. Noto filenames omit U+FE0F where applicable, so only the filename mapping removes that code point.

## License attribution

- Unicode emoji-test data and CLDR annotations are Copyright © Unicode, Inc. and are governed by the [Unicode Terms of Use](https://www.unicode.org/copyright.html).
- Ordinary Noto Emoji image resources are provided under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0), as stated by Noto Emoji `LICENSE`.
- Noto region flag images are public domain or otherwise exempt from copyright as stated by Noto Emoji `third_party/region-flags/LICENSE`.
