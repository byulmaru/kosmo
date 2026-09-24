# Reaction emoji assets

KOSMO uses the Google image set in `emoji-datasource-google@16.0.0` for reactions. The package provides Noto Emoji v2.048 artwork for Emoji 16.0. The app copies its 64px PNG images into `public/reaction-emoji/emoji-16` during setup and builds; generated images are not committed.

The picker and server allow the 3,781 fully-qualified emoji represented by that package. The package also contains five standalone skin-tone modifier images, which are not selectable reactions. Unicode strings remain the Reaction Type identifiers.

- Package source: <https://github.com/iamcal/emoji-data>
- Noto source: <https://github.com/googlefonts/noto-emoji/releases/tag/v2.048>
- Package data and code: MIT license (`emoji-datasource-google/LICENSE`)
- Noto images: Apache License 2.0 (see the package README image-source section and the Noto repository `LICENSE`)

Korean names and search words are preserved in `reactionEmojiCatalog.data.json` from CLDR 48 annotations. Unicode emoji data and CLDR annotations are Copyright © Unicode, Inc. and governed by the [Unicode Terms of Use](https://www.unicode.org/copyright.html).
