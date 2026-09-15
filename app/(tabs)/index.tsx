import { useEffect, useMemo, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";

const API_URL = process.env.EXPO_PUBLIC_CONNECTOR_API_URL || "https://vpfarm-backend.onrender.com";
const TOKEN_KEY = "phonefarm_connector_token";
const DEVICE_KEY = "phonefarm_connector_device";

type ConnectorState = { token: string; deviceId: string; status: "paired" | "offline" } | null;

function makeDeviceId() {
  return `android-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function HomeScreen() {
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState("My Android phone");
  const [connector, setConnector] = useState<ConnectorState>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Only you can authorize this device.");

  useEffect(() => {
    (async () => {
      const [token, savedDevice] = await Promise.all([AsyncStorage.getItem(TOKEN_KEY), AsyncStorage.getItem(DEVICE_KEY)]);
      if (token && savedDevice) setConnector({ token, deviceId: savedDevice, status: "paired" });
    })();
  }, []);

  useEffect(() => {
    if (!connector) return;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/api/connectors/heartbeat`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${connector.token}` },
          body: JSON.stringify({ deviceId: connector.deviceId, name: deviceName, platform: "android" }),
        });
        if (!response.ok) throw new Error("offline");
        setConnector((current) => current ? { ...current, status: "paired" } : current);
      } catch {
        setConnector((current) => current ? { ...current, status: "offline" } : current);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [connector?.token, connector?.deviceId, deviceName]);

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

  const capabilities = useMemo(() => [
    ["Secure pairing", true], ["Online heartbeat", !!connector], ["APK install/run", false], ["Screen capture/control", false], ["Camera/location", false],
  ] as const, [connector]);

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="bg-[#07090f]">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text className="text-xs font-bold tracking-[3px] text-[#00e5ff]">PHONEFARMZONE / CONNECTOR</Text>
        <Text className="mt-3 text-3xl font-black text-white">PhoneFarmConnectorApp</Text>
        <Text className="mt-2 text-sm leading-6 text-slate-400">A visible, consent-based connection between your Android phone and the PhoneFarmZone dashboard.</Text>

        <View className="mt-6 rounded-2xl border border-slate-800 bg-[#0b1120] p-4">
          <View className="flex-row items-center justify-between"><Text className="text-base font-bold text-white">Connection</Text><Text className={connector?.status === "paired" ? "text-sm font-bold text-emerald-400" : "text-sm text-slate-500"}>{connector?.status === "paired" ? "● ONLINE" : "○ NOT PAIRED"}</Text></View>
          <TextInput value={deviceName} onChangeText={setDeviceName} placeholder="Device name" placeholderTextColor="#64748b" className="mt-4 rounded-xl border border-slate-700 bg-[#07090f] px-3 py-3 text-white" />
          {!connector && <TextInput value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="6-digit pairing code" placeholderTextColor="#64748b" className="mt-3 rounded-xl border border-slate-700 bg-[#07090f] px-3 py-3 text-white" />}
          <Pressable onPress={connector ? unpair : pair} disabled={busy} style={({ pressed }) => [{ marginTop: 14, borderRadius: 12, padding: 14, backgroundColor: connector ? "#1e293b" : "#00e5ff" }, pressed && { opacity: .8 }]}><Text className={connector ? "text-center font-bold text-white" : "text-center font-black text-black"}>{busy ? "Connecting…" : connector ? "Unpair device" : "Pair this phone"}</Text></Pressable>
          <Text className="mt-3 text-xs leading-5 text-slate-400">{message}</Text>
        </View>

        <View className="mt-5 rounded-2xl border border-slate-800 bg-[#0b1120] p-4"><Text className="text-base font-bold text-white">Permission and capability status</Text>{capabilities.map(([label, enabled]) => <View key={label} className="mt-3 flex-row items-center justify-between"><Text className="text-sm text-slate-300">{label}</Text><Text className={enabled ? "text-xs font-bold text-emerald-400" : "text-xs text-amber-400"}>{enabled ? "READY" : "NATIVE BUILD NEEDED"}</Text></View>)}<Text className="mt-4 text-xs leading-5 text-slate-500">The app never hides device access. Native Android permissions and services must be explicitly enabled by the device owner.</Text></View>

        <Pressable onPress={() => Linking.openSettings()} style={({ pressed }) => [{ marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: "#334155", padding: 13 }, pressed && { opacity: .75 }]}><Text className="text-center font-bold text-slate-300">Open Android app settings</Text></Pressable>
        <Text className="mt-8 text-center text-xs leading-5 text-slate-500">PhoneFarmZone · Developed By Humayun Shariar Himu</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

