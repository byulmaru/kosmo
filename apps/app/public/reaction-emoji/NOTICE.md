# Reaction emoji assets

KOSMO uses the Google image set in `emoji-datasource-google@16.0.0` for reactions. The package provides Noto Emoji v2.048 artwork for Emoji 16.0. The app copies its 64px PNG images into `public/reaction-emoji/emoji-16` during setup and builds; generated images are not committed.

The picker and server allow the 3,781 fully-qualified emoji represented by that package. The package also contains five standalone skin-tone modifier images, which are not selectable reactions. Unicode strings remain the Reaction Type identifiers.

- Package source: <https://github.com/iamcal/emoji-data>
- Noto source: <https://github.com/googlefonts/noto-emoji/releases/tag/v2.048>
- Package data and code: MIT license (`emoji-datasource-google/LICENSE`)
- Noto images: Apache License 2.0 ([license copy](./LICENSE-APACHE-2.0.txt); see the package README image-source section)

Korean and English names and search words come from `emojibase-data@17.0.0` (MIT). The Noto and both package license texts are available in Settings → Info → Open-source licenses. Unicode emoji data and CLDR annotations are Copyright © Unicode, Inc. and governed by the [Unicode Terms of Use](https://www.unicode.org/copyright.html).
