# App license notices

Thirteen package versions remain recorded in `pending-notices.json` because no published copyright notice was found in their reviewed package metadata or upstream sources. This is a source-retrieval gap, not a legal review or a conclusion about license compliance.

Follow up with the package maintainers or an authoritative source for each exact version. Add the verified original license and copyright text to the supplemental license files, then remove the resolved version from `pending-notices.json`.

`standard-navigation@0.0.5` is the only pending package in the current Web, Android, and iOS distribution set. Its artifact row keeps the original text blank and retains the pending status. The license screen filters blank-text rows; this does not resolve the source-retrieval gap. The other 12 rows remain in `pending-notices.json` for follow-up and are not included in the app artifact.

`supplemental-families.json` and `supplemental-other.json` contain verified original texts for the other distributed packages. The [distribution analysis](./distribution-analysis.md) records the package counts, reproduction commands, and audit boundary.

Generate the artifact with `pnpm --filter @kosmo/app licenses:generate`. It runs Relay, performs fresh Web, Android, and iOS production exports, resolves native autolinking roots and evaluated font resources, then selects those exact npm package versions from pnpm's production report. It does not install or force-install packages. `pnpm --filter @kosmo/app licenses:check` does not export or install: it validates the committed artifact and source checksum, then checks its scoped package records against installed production metadata. `pnpm --filter @kosmo/app licenses:verify` repeats fresh scope collection and checks the exact package set and full records. The app `check` runs the light license check, Relay, license verification, and TypeScript in that order; install-time `prepare` remains light.
