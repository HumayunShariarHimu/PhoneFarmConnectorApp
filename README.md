# PhoneFarm Android

PhoneFarm is an owner-visible Android connector for authorized device QA and testing. It pairs a real Android device with PhoneFarmZone, hands APKs to Android's standard Package Installer after user approval, and can launch already-installed test targets by package name.

## Download

Use the live [download page](https://phonefarm-android-download-humayunshariarhimus-projects.vercel.app/) or the [latest GitHub Release](https://github.com/HumayunShariarHimu/PhoneFarmConnectorApp/releases/latest). The same `index.html` is kept at the repository root for reproducible deployment.

## Install and pair

1. Download the latest APK from GitHub Releases.
2. Open the APK on Android and approve the system installer prompt. If Android asks, allow the browser or file manager to install unknown apps.
3. Open PhoneFarmZone and sign in with the owner password.
4. Click **Pair Android** to create a one-time six-digit code.
5. Enter that code in PhoneFarm. Pairing requires explicit owner consent.

## Local development

```bash
pnpm install
pnpm check
pnpm lint
pnpm android
```

A standalone Android build is required for APK installation permissions. Expo Go is not a release substitute for this workflow.

## GitHub APK build

The workflow at `.github/workflows/android-apk.yml` builds an installable debug APK after manual dispatch or a tag matching `connector-v*`. To create a release from a machine with write access:

```bash
git tag connector-v1.0.2
git push origin main --tags
```

The workflow uploads the APK as an artifact and attaches it to the GitHub Release for the tag.

## Capability boundary

This connector does not create hidden Android clones, bypass Android permission prompts, or manufacture ten full Android operating systems inside one phone. For a real multi-device QA lab, use multiple physical Android devices or emulator hosts. See [ANDROID_CAPABILITIES.md](./ANDROID_CAPABILITIES.md).
