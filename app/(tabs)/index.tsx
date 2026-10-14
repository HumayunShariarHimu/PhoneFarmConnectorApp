import { useEffect, useMemo, useState } from "react";
import { Alert, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Application from "expo-application";
import { ScreenContainer } from "@/components/screen-container";

const API_URL = process.env.EXPO_PUBLIC_CONNECTOR_API_URL || "https://vpfarm-backend.onrender.com";
const TOKEN_KEY = "phonefarm_connector_token";
const DEVICE_KEY = "phonefarm_connector_device";
const TARGETS_KEY = "phonefarm_launch_targets";

type ConnectorState = { token: string; deviceId: string; status: "paired" | "offline" } | null;

type LaunchTarget = { packageName: string; label: string };

function makeDeviceId() {
  return `android-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function installApk(uri: string) {
  if (Platform.OS !== "android") throw new Error("APK installation is available on Android builds only.");
  const localUri = uri.startsWith("file:") ? uri : `${FileSystem.cacheDirectory}phonefarm-${Date.now()}.apk`;
  if (localUri !== uri) await FileSystem.copyAsync({ from: uri, to: localUri });
  const contentUri = await FileSystem.getContentUriAsync(localUri);
  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    type: "application/vnd.android.package-archive",
    flags: 1 | 2,
  });
}

export default function HomeScreen() {
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState("My Android phone");
  const [connector, setConnector] = useState<ConnectorState>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Only you can authorize this device.");
  const [apkName, setApkName] = useState<string | null>(null);
  const [packageName, setPackageName] = useState("");
  const [targets, setTargets] = useState<LaunchTarget[]>([]);
  const connectorToken = connector?.token;
  const connectorDeviceId = connector?.deviceId;

  useEffect(() => {
    (async () => {
      const [token, savedDevice, savedTargets] = await Promise.all([
        AsyncStorage.getItem(TOKEN_KEY),
        AsyncStorage.getItem(DEVICE_KEY),
        AsyncStorage.getItem(TARGETS_KEY),
      ]);
      if (token && savedDevice) setConnector({ token, deviceId: savedDevice, status: "paired" });
      if (savedTargets) setTargets(JSON.parse(savedTargets));
    })();
  }, []);

  useEffect(() => {
    if (!connectorToken || !connectorDeviceId) return;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/api/connectors/heartbeat`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${connectorToken}` },
          body: JSON.stringify({ deviceId: connectorDeviceId, name: deviceName, platform: "android" }),
        });
        if (!response.ok) throw new Error("offline");
        setConnector((current) => current ? { ...current, status: "paired" } : current);
      } catch {
        setConnector((current) => current ? { ...current, status: "offline" } : current);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [connectorToken, connectorDeviceId, deviceName]);

  const pair = async () => {
    if (code.trim().length < 6) return setMessage("Enter the 6-digit code shown in PhoneFarmZone.");
    setBusy(true); setMessage("Pairing with your explicit approval…");
    const deviceId = connector?.deviceId || makeDeviceId();
    try {
      const response = await fetch(`${API_URL}/api/connectors/pair`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim(), deviceId, name: deviceName, platform: "android", consent: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Pairing failed");
      await AsyncStorage.multiSet([[TOKEN_KEY, data.token], [DEVICE_KEY, deviceId]]);
      setConnector({ token: data.token, deviceId, status: "paired" });
      setMessage("Connected. You can revoke access any time by unpairing below.");
      setCode("");
    } catch (error: any) { setMessage(error.message || "Pairing failed."); }
    finally { setBusy(false); }
  };

  const unpair = async () => {
    if (!connector) return;
    Alert.alert("Unpair this device?", "PhoneFarmZone will no longer be able to send commands to this phone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Unpair", style: "destructive", onPress: async () => {
        await fetch(`${API_URL}/api/connectors/revoke`, { method: "POST", headers: { authorization: `Bearer ${connector.token}` } }).catch(() => {});
        await AsyncStorage.multiRemove([TOKEN_KEY, DEVICE_KEY]); setConnector(null); setMessage("Device unpaired.");
      } },
    ]);
  };

  const pickAndInstallApk = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/vnd.android.package-archive",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setApkName(asset.name);
      setMessage("Opening Android's installer. Review the package and approve it yourself.");
      await installApk(asset.uri);
    } catch (error: any) {
      setMessage(error?.message || "Could not open the Android package installer.");
    }
  };

  const addLaunchTarget = async () => {
    const value = packageName.trim();
    if (!value || !/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(value)) {
      return setMessage("Enter a valid Android package name, for example com.google.android.youtube.");
    }
    const next = [...targets.filter((item) => item.packageName !== value), { packageName: value, label: value }];
    setTargets(next); setPackageName("");
    await AsyncStorage.setItem(TARGETS_KEY, JSON.stringify(next));
  };

  const launchTarget = (target: LaunchTarget) => {
    if (Platform.OS !== "android") return setMessage("Launching Android packages is available on Android builds only.");
    try { IntentLauncher.openApplication(target.packageName); }
    catch { setMessage(`Android could not find ${target.packageName}. Install it first.`); }
  };

  const openInstallerSettings = () => {
    if (Platform.OS !== "android") return Linking.openSettings();
    IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, {
      data: `package:${Application.applicationId}`,
    }).catch(() => Linking.openSettings());
  };

  const capabilities = useMemo(() => [
    ["Secure pairing", true],
    ["Online heartbeat", !!connector],
    ["User-approved APK installation", Platform.OS === "android"],
    ["Installed app launch", Platform.OS === "android"],
    ["Multiple full Android phones in one app", false],
  ] as const, [connector]);

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="bg-[#07090f]">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text className="text-xs font-bold tracking-[3px] text-[#00e5ff]">PHONEFARM / ANDROID CONNECTOR</Text>
        <Text className="mt-3 text-3xl font-black text-white">PhoneFarm</Text>
        <Text className="mt-2 text-sm leading-6 text-slate-400">An owner-visible Android connector for authorized device testing. Android remains in control of every sensitive operation.</Text>

        <View className="mt-6 rounded-2xl border border-slate-800 bg-[#0b1120] p-4">
          <View className="flex-row items-center justify-between"><Text className="text-base font-bold text-white">Connection</Text><Text className={connector?.status === "paired" ? "text-sm font-bold text-emerald-400" : "text-sm text-slate-500"}>{connector?.status === "paired" ? "● ONLINE" : "○ NOT PAIRED"}</Text></View>
          <TextInput value={deviceName} onChangeText={setDeviceName} placeholder="Device name" placeholderTextColor="#64748b" className="mt-4 rounded-xl border border-slate-700 bg-[#07090f] px-3 py-3 text-white" />
          {!connector && <TextInput value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="6-digit pairing code" placeholderTextColor="#64748b" className="mt-3 rounded-xl border border-slate-700 bg-[#07090f] px-3 py-3 text-white" />}
          <Pressable onPress={connector ? unpair : pair} disabled={busy} style={({ pressed }) => [{ marginTop: 14, borderRadius: 12, padding: 14, backgroundColor: connector ? "#1e293b" : "#00e5ff" }, pressed && { opacity: .8 }]}><Text className={connector ? "text-center font-bold text-white" : "text-center font-black text-black"}>{busy ? "Connecting…" : connector ? "Unpair device" : "Pair this phone"}</Text></Pressable>
          <Text className="mt-3 text-xs leading-5 text-slate-400">{message}</Text>
        </View>

        <View className="mt-5 rounded-2xl border border-slate-800 bg-[#0b1120] p-4">
          <Text className="text-base font-bold text-white">Install an APK on this Android phone</Text>
          <Text className="mt-2 text-xs leading-5 text-slate-400">This uses Android&apos;s standard Package Installer. It does not silently install packages and it does not create a second Android OS.</Text>
          <Pressable onPress={pickAndInstallApk} style={({ pressed }) => [{ marginTop: 14, borderRadius: 12, padding: 14, backgroundColor: "#153047" }, pressed && { opacity: .8 }]}><Text className="text-center font-bold text-cyan-200">Choose APK and continue</Text></Pressable>
          <Pressable onPress={openInstallerSettings} style={({ pressed }) => [{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: "#334155", padding: 12 }, pressed && { opacity: .75 }]}><Text className="text-center text-sm font-bold text-slate-300">Allow this app to install APKs</Text></Pressable>
          {apkName && <Text className="mt-3 text-xs text-emerald-400">Last selected: {apkName}</Text>}
        </View>

        <View className="mt-5 rounded-2xl border border-slate-800 bg-[#0b1120] p-4">
          <Text className="text-base font-bold text-white">Launch an installed app</Text>
          <Text className="mt-2 text-xs leading-5 text-slate-400">Add the package name of an app already installed on this phone. The launcher only asks Android to open that app.</Text>
          <TextInput value={packageName} onChangeText={setPackageName} autoCapitalize="none" autoCorrect={false} placeholder="com.example.app" placeholderTextColor="#64748b" className="mt-4 rounded-xl border border-slate-700 bg-[#07090f] px-3 py-3 text-white" />
          <Pressable onPress={addLaunchTarget} style={({ pressed }) => [{ marginTop: 10, borderRadius: 12, padding: 13, backgroundColor: "#00e5ff" }, pressed && { opacity: .8 }]}><Text className="text-center font-black text-black">Add app target</Text></Pressable>
          {targets.map((target) => <View key={target.packageName} className="mt-3 flex-row items-center justify-between rounded-xl border border-slate-800 px-3 py-3"><Text className="flex-1 text-sm text-slate-300">{target.packageName}</Text><Pressable onPress={() => launchTarget(target)}><Text className="font-bold text-cyan-300">Launch</Text></Pressable></View>)}
        </View>

        <View className="mt-5 rounded-2xl border border-slate-800 bg-[#0b1120] p-4"><Text className="text-base font-bold text-white">Capability status</Text>{capabilities.map(([label, enabled]) => <View key={label} className="mt-3 flex-row items-center justify-between"><Text className="text-sm text-slate-300">{label}</Text><Text className={enabled ? "text-xs font-bold text-emerald-400" : "text-xs text-amber-400"}>{enabled ? "READY" : "NOT AVAILABLE"}</Text></View>)}<Text className="mt-4 text-xs leading-5 text-slate-500">A normal third-party app cannot manufacture 10 isolated full Android phones. That requires OS-level virtualization support or multiple physical/emulator hosts.</Text></View>

        <Pressable onPress={() => Linking.openSettings()} style={({ pressed }) => [{ marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: "#334155", padding: 13 }, pressed && { opacity: .75 }]}><Text className="text-center font-bold text-slate-300">Open Android app settings</Text></Pressable>
        <Text className="mt-8 text-center text-xs leading-5 text-slate-500">PhoneFarm · Developed By Humayun Shariar Himu</Text>
      </ScrollView>
    </ScreenContainer>
  );
}
