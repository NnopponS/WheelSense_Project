# Build Guide for WheelSense Mobile (Windows)

This document explains the specific fixes and procedures required to successfully build the APK on Windows, addressing issues with Node.js module resolution and Windows path length limits.

## Recommended build flow (avoid long paths)

**Prefer this when the repo lives under a long path** (CMake/Ninja failures, `build.ninja still dirty`):

1. **Copy to a short path** — Copy the entire `wheelsense-mobile` folder to e.g. `C:\wsm` (short path, ASCII, no spaces).
2. **Install and build:**

   ```powershell
   cd C:\wsm
   npm install
   npm run build:apk
   ```

3. **Retrieve the APK** — From:

   `C:\wsm\android\app\build\outputs\apk\release\app-release.apk`

4. **Cleanup** — Remove `C:\wsm` when done if it was only for building.

## Workarounds without copying the repo

- **`npm run deps:link-short`** — Puts physical `node_modules` under `%LOCALAPPDATA%\wsm-short-nm\...` and uses a junction from the project (see `scripts/link-node-modules-short.ps1`). Run `npm install` after if needed, then `npm run build:apk`.
- **Windows long paths** (optional, admin): enable `LongPathsEnabled` in the registry (see `scripts/build-release-apk.ps1` warning text).

## Applied fixes (Node + Gradle)

### 1. Node `require.resolve` from the correct working directory

Gradle must run `node` with **current working directory = the JS app root** (folder that contains `package.json` and `node_modules`), not `android/` or `android/app/`.

**Fixed in:**

- `wheelsense-mobile/android/settings.gradle` — `workingDir` = parent of `android/`; plugin paths resolved with plain `require.resolve(...)` from that root.
- `wheelsense-mobile/android/app/build.gradle` — `jsAppRoot` = two parents above `android/app/`; all `node` `Process` calls use `execute(null, jsAppRoot)`.

### 2. Avoid invalid `paths` for sibling scoped packages (Node 20+)

Patterns like:

`require.resolve('@react-native/codegen/package.json', { paths: [require('path').dirname(require.resolve('react-native/package.json'))] })`

use `.../node_modules/react-native` as `paths[]`, which is **not** the `node_modules` root — resolution of sibling `@react-native/*` packages can fail.

**Fix:** run Node with `cwd = jsAppRoot` and use `require.resolve('@react-native/codegen/package.json')` without that `paths` option (same idea for `@react-native/gradle-plugin` in `settings.gradle`).

### 3. Expo CLI path for bundling

`@expo/cli` may not be a direct dependency. Use:

`require.resolve('expo/bin/cli')`

from `jsAppRoot` for the `react { cliFile = ... }` block.

### 4. Node modules junction (short path)

When using junctions for `node_modules` (to save path length), Node.js sometimes fails to find sibling modules.

**Solution:** Create a circular junction inside the `node_modules` store:

`cmd /c mklink /J "%STORE_PATH%\node_modules" "%STORE_PATH%"`

(This is handled by `scripts/link-node-modules-short.ps1` when the build script runs it on Windows.)

## Maintaining a clean source tree

- Prefer **not** running heavy `gradlew` / full native builds only in the deepest clone path; use **`C:\wsm`** or **`deps:link-short`** for reliable Windows builds.
- You can keep `node_modules` / `android/**/build` out of backups or use `.gitignore` as usual; the short-path copy is disposable.

## Output location (local release APK)

After a successful `npm run build:apk`:

`wheelsense-mobile/android/app/build/outputs/apk/release/app-release.apk`
