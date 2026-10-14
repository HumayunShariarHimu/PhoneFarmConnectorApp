# PhoneFarm Android capability boundary

## What this build implements

The connector is an owner-visible Android companion for authorized testing:

- pairing and heartbeat with PhoneFarmZone;
- selecting an APK with the Android document picker;
- handing the APK to Android's standard Package Installer;
- opening the OS settings page where the owner can allow this app to request APK installs;
- launching an already-installed app by its package name;
- storing launch targets locally for repeatable testing.

The OS remains responsible for package verification, install confirmation, permissions, and app lifecycle. The connector does not silently install software, hide access, or bypass Android security prompts.

## What a normal Play-style Android app cannot provide

This app cannot create ten independent, full Android phones inside one ordinary Android application. Android app sandboxes do not expose a public API for cloning the complete OS, assigning each clone its own user/profile, or running arbitrary third-party APKs as if they were separate physical devices.

Android's `PackageInstaller` can install APKs, but an install may require user action. Automatic completion is reserved for device owners and affiliated profile owners. See the official API reference: <https://developer.android.com/reference/android/content/pm/PackageInstaller>.

Android Work Profile provides a managed work/personal separation, not ten general-purpose virtual phones. See <https://www.android.com/enterprise/work-profile/>.

Android Virtualization Framework (AVF) provides protected virtual machines and Microdroid, but it is an OS/platform capability. The official documentation describes ARM64 support and Java/Native APIs available only on AVF-capable devices: <https://source.android.com/docs/core/virtualization>. Its architecture also depends on pKVM, crosvm, kernel support, and device memory: <https://source.android.com/docs/core/virtualization/architecture>.

## Production architecture for real multi-phone testing

For ten or more complete Android environments, use one of these supported architectures:

1. multiple physical Android devices connected to a host farm;
2. multiple Android emulators on a Linux/Cloud host with hardware virtualization;
3. an Android device-owner / DPC deployment where a managed profile is sufficient for the use case;
4. a custom AOSP/device build with AVF or another platform-level virtualization stack, subject to hardware support and OEM constraints.

The current repository is an Expo application and does not contain an AOSP build, device-owner provisioning flow, emulator host, or hypervisor. Claiming that it creates 10 real Android phones would therefore be misleading.
