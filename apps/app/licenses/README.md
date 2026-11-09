# App license notices

Thirteen package versions remain recorded in `pending-notices.json` because no published copyright notice was found in their reviewed package metadata or upstream sources. This is a source-retrieval gap, not a legal review or a conclusion about license compliance.

Follow up with the package maintainers or an authoritative source for each exact version. Add the verified original license and copyright text to the supplemental license files, then remove the resolved version from `pending-notices.json`.

The generated artifact includes all package versions in `@kosmo/app`'s pnpm production license report, including packages that do not appear in the current Expo exports. This is a production dependency inventory and does not mean every listed package is bundled in an app release. Pending rows keep their original text blank; the license screen filters blank-text rows, which does not resolve the source-retrieval gap.

`supplemental-families.json` and `supplemental-other.json` contain verified original texts for package versions whose installed package does not provide the full license text. The [historical distribution analysis](./distribution-analysis.md) records the former three-platform inventory and its audit boundary.

After changing `@kosmo/app` production dependencies, regenerate the artifact with `pnpm --filter @kosmo/app licenses:generate`. It uses pnpm's complete production license report, including dependencies that may not appear in Expo exports. The generator itself does not invoke Relay, Expo exports, or optional-package installation. Generation checks package metadata and requires original license text from the installed package, a verified supplement, or an exact pending notice. There is no automatic freshness check; license data is generated manually when dependencies change. The app `check` and install-time `prepare` run Relay before their consumers.
