# Pending license notices

These 13 package versions have a declared license, but no published copyright notice was found in the package metadata or the reviewed upstream source/archive. Their package name, exact version, license metadata, and evidence links remain in the offline notice list; their original text is blank until an authentic notice can be confirmed.

Follow up with the package maintainers or an authoritative source for each exact version. Add the verified original license and copyright text to the supplemental license files, then remove the resolved version from `pending-notices.json`.

This file records a source-retrieval gap. It is not a legal review or a conclusion about license compliance.

`supplemental-families.json` and `supplemental-other.json` contain verified original texts for the remaining packages. Generate the all-platform artifact with `pnpm --filter @kosmo/app licenses:generate`; it synchronizes locked platform packages before reading the pnpm production report. `pnpm --filter @kosmo/app licenses:check` never installs packages and checks the installed subset against the committed artifact and its combined source checksum.
