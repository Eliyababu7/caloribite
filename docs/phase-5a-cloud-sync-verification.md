# Phase 5A cloud-food-log-sync verification

Recorded on 15 November 2026 for `feature/cloud-food-log-sync` at
`82610afa4d75a5c668d5d7256cacf874a0ae009d`.

The initial verification record is preserved below. The final section records
the subsequent scoped SDK 57 patch alignment and its current validation results.

## Controlled physical-phone test (user reported)

The project owner confirmed that the controlled live-test checklist passed.
This is a user-reported physical-phone result, not an automated test result or
an independently observed pass. Individual checklist outcomes, device details,
and operating-system versions were not supplied in the final confirmation.

## Automated verification before patch alignment

| Check | Result |
| --- | --- |
| Initial branch and worktree | Expected branch; clean worktree |
| Required commits | `dedbfe7` and `82610afa` present in branch history |
| `npm test` | Passed: 475 tests, 6 suites, no failures or skips |
| `npx tsc --noEmit` | Passed |
| `npm ls --depth=0` and `npm ls --all --json` | Passed |
| `npx expo install --check` | Failed: eight SDK 57 patch-version mismatches |
| `npx expo-doctor` | 20/21 passed; package-version compatibility check failed |
| Temporary web export | Passed: two web bundles and 15 static routes |
| `git diff --check` | Passed before and after this documentation update |
| `.env.local` Git safeguards | Ignored and untracked; contents not displayed or changed |
| Committed rollout default | `.env.example` remains `false`; runtime requires exact string `true` |

The initial sandboxed test run could not launch Node test subprocesses
(`spawn EPERM`). The unchanged test command passed when rerun outside that
restriction. Network-dependent Expo checks and audits were rerun with network
access; sandbox-only results were not used as validation evidence.

The web export was written outside the repository to the temporary directory
`caloribite-phase5a-web-631554f0afa046679814c2cd0b102c42`.

### Expo SDK 57 compatibility findings

| Package | Installed | Expected by Expo check |
| --- | --- | --- |
| `@expo/ui` | 57.0.25 | ~57.0.26 |
| `expo` | 57.0.30 | ~57.0.33 |
| `expo-constants` | 57.0.22 | ~57.0.24 |
| `expo-glass-effect` | 57.0.4 | ~57.0.5 |
| `expo-linking` | 57.0.13 | ~57.0.14 |
| `expo-network` | 57.0.2 | ~57.0.3 |
| `expo-router` | 57.0.28 | ~57.0.31 |
| `expo-splash-screen` | 57.0.10 | ~57.0.11 |

No dependency changes or SDK upgrade were applied.

### npm audit comparison

| Audit | Low | Moderate | High | Critical |
| --- | --- | --- | --- | --- |
| Recorded baseline supplied by project owner | Not specified | 11 | 19 | 0 |
| Full (`npm audit --include=dev --offline=false --json`) | 1 | 8 | 7 | 0 |
| Production (`npm audit --omit=dev --offline=false --json`) | 1 | 8 | 7 | 0 |

Both audits exited 1 because vulnerabilities remain. Each reports three fewer
moderate and twelve fewer high findings than the recorded baseline, with no
critical findings. This comparison does not establish that dependencies were
fixed; audit advisories and their classification can change independently of
the repository. No automatic fixes were applied.

## Finalization status before patch alignment

The reported controlled live test passed, but automated validation is not fully
passing because Expo compatibility and Expo Doctor flag package versions, and
both audits still report vulnerabilities. This record does not declare Phase 5A
fully validated or ready to merge. Dependency remediation or explicit acceptance
of the outstanding findings requires a separate decision.

Only this verification document was added. Application source, dependencies,
configuration, migrations, `.env.local`, hosted Supabase, and application data
were not changed. No commit, push, merge, deployment, database reset, or diary
upload was performed during this finalization run.

## Scoped SDK 57 patch alignment

The eight explicitly requested ranges were installed with `npx expo install`.
Expo installed its updated SDK package first, then invoked its updated installer
for the other seven packages. No force option, overrides, audit fixes, broad
refresh command, or SDK 58 upgrade was used.

| Direct dependency | Declared range after alignment | Locked and installed version |
| --- | --- | --- |
| `@expo/ui` | ~57.0.26 | 57.0.26 |
| `expo` | ~57.0.33 | 57.0.33 |
| `expo-constants` | ~57.0.24 | 57.0.24 |
| `expo-glass-effect` | ~57.0.5 | 57.0.5 |
| `expo-linking` | ~57.0.14 | 57.0.14 |
| `expo-network` | ~57.0.3 | 57.0.3 |
| `expo-router` | ~57.0.31 | 57.0.31 |
| `expo-splash-screen` | ~57.0.11 | 57.0.11 |

### Dependency and configuration review

Only these eight direct dependency declarations changed. The lockfile contains
45 version-changed package paths (eight direct and 37 transitive), 14 added paths,
and 12 removed paths. Added/removed paths include package relocation, rather than
representing exclusively new or removed package identities.

Reviewed transitive changes include Expo CLI 57.0.31 to 57.0.34, relocated under
`expo/node_modules`; config 57.0.10 to 57.0.11; config-plugins 57.0.10 to 57.0.13;
prebuild-config 57.0.19 to 57.0.21; modules-core 57.0.23 to 57.0.26; and related
Metro, Babel, asset, autolinking, and Router tooling. New Expo config tooling
requires glob 14 and xcode 4; glob requires path-scurry 3 and minimatch 11.
The separate minimatch 10 dependency remains through fingerprint. node-forge
updated from 1.4.0 to 1.4.3; deepmerge, uuid, and zod paths were removed.
No new Expo SDK 58 package paths were introduced.

No application source or configuration file changed. The Router and SplashScreen
plugin declarations remain unchanged, but updated config-plugin/prebuild tooling
can affect generated native configuration during a later native build. No
prebuild or native release-build verification was performed.

### Automated verification after alignment

| Check | Result |
| --- | --- |
| `npm test` | Passed: 475 tests, 6 suites, no failures or skips |
| `npx tsc --noEmit` | Passed |
| `npm ls --depth=0` | Passed; all eight targets match declared, locked, and installed versions |
| `npx expo install --check` | Passed: dependencies are up to date |
| Expo Doctor 1.21.8 (`npx expo-doctor`) | Passed: 21/21 checks |
| Temporary web export | Passed: two bundles and 15 static routes |
| `git diff --check` | Passed |
| Local environment safeguards | `.env.local` unchanged by SHA-256 comparison, ignored, and untracked |
| Committed rollout default | Remains disabled in unchanged `.env.example` |

The export was written outside the repository to temporary directory
`caloribite-phase5a-aligned-web-149c0c77095244a09b90fc49660d7b95`.
Metro reported an incompatible old file-map cache, automatically performed a full
crawl, and completed the export successfully. Color-environment warnings were
also non-fatal.

### Advisory-level audit comparison after alignment

The original detailed temporary reports `caloribite-audit-full.json` and
`caloribite-audit-production.json` were preserved. Post-update reports were saved
separately as `caloribite-audit-post-alignment-full.json` and
`caloribite-audit-post-alignment-production.json` in the system temporary folder.

| Audit | Before: low / moderate / high / critical | After: low / moderate / high / critical |
| --- | --- | --- |
| Full, explicitly including development dependencies | 1 / 8 / 7 / 0 | 0 / 3 / 4 / 0 |
| Production only | 1 / 8 / 7 / 0 | 0 / 3 / 4 / 0 |

Both post-update audits exited 1 because vulnerabilities remain. In each report,
unique advisory IDs decreased from 30 to five: 25 are no longer reported, none
are new, and none of the retained advisories changed severity. Affected package
records/installation paths decreased from 16 to seven. The six retained affected
package records keep their previous severities and paths. `expo` is newly listed
as an affected package through the existing fingerprint/minimatch advisory; this
is inherited dependency reporting, not a new advisory.

The five retained advisories are:

| Dependency | Advisory ID | Severity |
| --- | --- | --- |
| decode-uri-component | GHSA-vcc3-ghjq-m6fr | Moderate |
| decode-uri-component | GHSA-qr28-fpjm-wq7f | High |
| image-size | GHSA-5p2g-fcmc-qvqq | High |
| image-size | GHSA-w3rx-r6r6-pgpr | High |
| minimatch | GHSA-g3hv-75wg-m249 | Moderate |

The 25 advisories no longer reported comprise all 21 previously reported
node-forge advisories, plus deepmerge GHSA-gcqx-w48m-w2h4, glob
GHSA-3g3m-2fjr-6pw4, uuid GHSA-w5hq-g745-h8pq, and zod
GHSA-mrhx-c7xc-m3w5. Removed affected package records are `@expo/cli`,
`@expo/config`, `@expo/config-plugins`, `@expo/metro-config`, `deepmerge`, `glob`,
`node-forge`, `uuid`, `xcode`, and `zod`.

Advisory details for the older owner-supplied 11-moderate/19-high baseline were
not available; no advisory equivalence or remediation is inferred from those
older totals. Identical full and production results do not establish native or
web runtime reachability of every finding.

### Verification limits and Git state immediately after alignment

Automated application, type, dependency, Expo compatibility, Doctor, web export,
and whitespace checks pass after alignment. Audit findings remain open.
The earlier controlled physical-phone checklist pass remains a user-reported
result for the pre-update dependencies. **Post-update physical-device testing is
pending. Native release builds have not been verified.**

The only tracked changes are `package.json` and `package-lock.json`; this existing
verification document was updated and remains untracked. HEAD remains
`82610afa4d75a5c668d5d7256cacf874a0ae009d` on `feature/cloud-food-log-sync`.
Nothing was staged or committed. No hosted changes, diary uploads, pushes,
merges, or deployments were performed.

## Post-update physical-phone verification (user reported, 16 November 2026)

The project owner confirmed that the following tests passed after the SDK 57
patch alignment and nutrition display-formatting changes:

| Physical-phone check | User-reported result |
| --- | --- |
| Nutrition number formatting and mobile layout | Passed |
| Cross-device food-log synchronization | Passed |
| Offline replay | Passed |
| Pausing and re-enabling cloud backup | Passed |

These are user-reported device results, separate from automated validation and
not independently observed by the coding agent. No device model or OS version
was supplied. **Native release-build verification remains pending.** The earlier
post-update device-testing-pending statement describes the state immediately
after patch alignment and is superseded by this confirmation.

## Final local automated validation (16 November 2026)

Validation was rerun against the combined SDK 57 dependency alignment and
nutrition display changes before creating the requested scoped local commits.
Display regression coverage was added for floating-point artifacts, fractional
values, real zeroes, invalid/missing values, large numbers, accessibility, and
preservation of full-precision progress and remaining/over-target calculations.
Stored nutrition, editable inputs, provider data, and sync payloads were not
rounded by the display changes.

| Automated check | Final result |
| --- | --- |
| `npm test` | Passed: 486 tests, 6 suites, no failures or skips |
| `npx tsc --noEmit` | Passed |
| `npm ls --depth=0` | Passed |
| `npm ls --all --json` | Passed |
| `npx expo install --check` | Passed: dependencies are up to date |
| Expo Doctor 1.21.8 | Passed: 21/21 checks |
| Final temporary web export | Passed: two web bundles and 15 static routes |
| `git diff --check` | Passed |

The final web export was written outside the repository to temporary directory
`caloribite-phase5a-final-web-7344c5758fc142a3b38adb7c5dbf1177`.
Only non-fatal color-environment warnings were reported during this export.

Both full and production-only audits report **0 low, 3 moderate, 4 high, and
0 critical** findings, matching the latest post-alignment baseline. Each retains
the same five advisory IDs and seven affected package records/installation
paths. Comparison with the saved post-alignment JSON reports found no new or
removed advisories, severity changes, or changed package records. Both audits
exit 1 for the known findings; no unexplained regression or automatic fix was
introduced. Final audit reports were saved separately in the system temporary
folder as `caloribite-audit-final-phase5a-full.json` and
`caloribite-audit-final-phase5a-production.json`.

`.env.local` remained unchanged by SHA-256 comparison, ignored, and untracked.
The committed rollout example remains disabled. No hosted Supabase changes or
diary-data access occurred during finalization. Native release-build verification
remains pending despite the user-reported physical-phone passes above.

### Scoped local finalization

No unexplained validation regressions were found. The requested local commit
sequence is:

1. `69ed7ad7bb1ce0b40af1a1444700c6f88a6cb3bf` —
   `chore: align Expo SDK 57 patch dependencies`; only `package.json` and
   `package-lock.json`.
2. `9be25867495b3b88e53f8a42210ee3e45ed0c961` —
   `fix: format nutrition values for display`; only the display implementation,
   regression tests, and required test tooling (15 files).
3. `docs: record Phase 5A verification results`; only this verification document.

This completes local Phase 5A finalization with the known audit baseline retained
and native release-build verification still pending. It is not a production
release or deployment approval. No push, merge, deployment, hosted change, or
diary-data access was performed.
