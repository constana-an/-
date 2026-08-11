import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  BellIcon,
  CameraIcon,
  CheckCircledIcon,
  CheckIcon,
  DownloadIcon,
  ExitIcon,
  HeartFilledIcon,
  HeartIcon,
  HomeIcon,
  LockClosedIcon,
  PaperPlaneIcon,
  PersonIcon,
  ReaderIcon,
  TargetIcon,
  ArchiveIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { BottomSheet, KeyboardInput, MobileScroll, useKeyboard } from "./mobile";
import { MENU, statusText, taskClaimKey } from "./lib/catalog";
import { formatStartedOn, isValidDateKey, normalizeDateInput, todayKey } from "./lib/date";
import { daysUntilAnniversary } from "./lib/date";
import { authErrorMessage, orderErrorMessage, orderStatusErrorMessage, rewardErrorMessage } from "./lib/errors";
import { cloudEnabled, getSupabase, type SupabaseClient } from "./lib/supabase";
import {
  DEFAULT_PROFILE,
  STORAGE_KEYS,
  loadCoupleProfile,
  loadEconomyCoins,
  loadIdentity,
  loadLocalOrders,
  loadTaskClaims,
} from "./lib/storage";
import { displayNameFor, partnerFor } from "./lib/types";
import type {
  Anniversary,
  AuthMode,
  Category,
  CheckinStatus,
  CoupleProfile,
  CoupleTask,
  Identity,
  MainView,
  MemoryEntry,
  MembershipState,
  MenuItem,
  Order,
  OrderStatus,
} from "./lib/types";
import { MemoriesScreen } from "./screens/MemoriesScreen";
import { MenuArt } from "./screens/MenuArt";
import { OrdersScreen } from "./screens/OrdersScreen";
import { OursScreen } from "./screens/OursScreen";
import { ShopScreen } from "./screens/ShopScreen";
import { TasksScreen } from "./screens/TasksScreen";

/** iOS only exposes `Notification` in a secure context on 16.4+. */
const notificationsSupported = typeof window !== "undefined" && "Notification" in window;

/** Signed photo URLs live for an hour; re-sign once they get close to that. */
const SIGNED_URL_TTL_SECONDS = 3600;
const SIGNED_URL_REFRESH_MS = 45 * 60 * 1000;

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

/** Reads the view/order hints the service worker puts on notification links. */
function readDeepLink(): { view: MainView | null; orderId: string | null } {
  if (typeof window === "undefined") return { view: null, orderId: null };
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("view");
  const views: MainView[] = ["shop", "tasks", "orders", "memories", "ours"];
  const view = views.find((candidate) => candidate === requested) ?? null;
  const orderId = params.get("order");
  return { view: orderId ? "orders" : view, orderId };
}

export default function Prototype() {
  const keyboard = useKeyboard();
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(loadIdentity);
  const [profile, setProfile] = useState<CoupleProfile>(loadCoupleProfile);
  const [profileDraft, setProfileDraft] = useState<CoupleProfile>(loadCoupleProfile);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [view, setView] = useState<MainView>("shop");
  const [category, setCategory] = useState<Category>("food");
  const [orders, setOrders] = useState<Order[]>(loadLocalOrders);
  const [coins, setCoins] = useState(loadEconomyCoins);
  const [claimedTasks, setClaimedTasks] = useState<string[]>(loadTaskClaims);
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [note, setNote] = useState("");
  const [time, setTime] = useState("今晚 20:30");
  const [toast, setToast] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => notificationsSupported && Notification.permission === "granted",
  );
  const [cloudCoupleId, setCloudCoupleId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEYS.cloudId));
  const [inviteCode, setInviteCode] = useState<string | null>(() => localStorage.getItem(STORAGE_KEYS.inviteCode));
  const [pairingCode, setPairingCode] = useState("");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authOtp, setAuthOtp] = useState("");
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(
    () => localStorage.getItem(STORAGE_KEYS.privacyAccepted) === "1",
  );
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [dangerConfirm, setDangerConfirm] = useState<"leave" | "delete" | null>(null);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [anniversaries, setAnniversaries] = useState<Anniversary[]>([]);
  const [checkin, setCheckin] = useState<CheckinStatus>({ streak: 0, checkedToday: false });
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryCaption, setMemoryCaption] = useState("");
  const [memoryDate, setMemoryDate] = useState(todayKey());
  const [memoryFile, setMemoryFile] = useState<File | null>(null);
  const [anniversaryOpen, setAnniversaryOpen] = useState(false);
  const [anniversaryTitle, setAnniversaryTitle] = useState("");
  const [anniversaryDate, setAnniversaryDate] = useState(todayKey());
  const [membership, setMembership] = useState<MembershipState>({ planName: "基础版", status: "active" });
  const toastTimer = useRef<number | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const broadcastChannel = useRef<BroadcastChannel | null>(null);
  const applyingBroadcast = useRef(false);
  const memoriesSignedAt = useRef(0);
  const previousNames = useRef<{ first: string; second: string } | null>(null);

  const partnerIdentity = identity ? partnerFor(identity) : null;
  const currentName = identity ? displayNameFor(profile, identity) : null;
  const partnerName = partnerIdentity ? displayNameFor(profile, partnerIdentity) : null;
  const activeOrders = useMemo(
    () => orders.filter((order) => !["done", "rejected"].includes(order.status)).length,
    [orders],
  );
  const usedLimitedIds = useMemo(() => {
    const limited = new Set(MENU.filter((item) => item.limited).map((item) => item.id));
    return [...new Set(orders.filter((order) => order.status !== "rejected" && limited.has(order.itemId)).map((order) => order.itemId))];
  }, [orders]);
  const identityOptions: Array<{ name: Identity; displayName: string; tone: "pink" | "mint" }> = [
    { name: "大宝", displayName: profile.firstName, tone: "pink" },
    { name: "二宝", displayName: profile.secondName, tone: "mint" },
  ];

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  // Sheets own text inputs, so the simulated keyboard has to come down in the
  // same event that closes them — otherwise it keeps covering the bottom nav.
  const closeOrderSheet = () => { keyboard.hide(); setSelected(null); };
  const closeSettings = () => { keyboard.hide(); setSettingsOpen(false); };
  const closeAuth = () => { keyboard.hide(); setAuthOpen(false); };
  const closeMemory = () => { keyboard.hide(); setMemoryOpen(false); };
  const closeAnniversary = () => { keyboard.hide(); setAnniversaryOpen(false); };

  const chooseIdentity = useCallback((nextIdentity: Identity) => {
    localStorage.setItem(STORAGE_KEYS.identity, nextIdentity);
    setIdentity(nextIdentity);
  }, []);

  useEffect(() => {
    const pending = getSupabase();
    if (pending) pending.then(setSupabase).catch(() => showToast("云服务加载失败，已切换到本地模式"));
  }, [showToast]);

  useEffect(() => {
    const { view: deepView, orderId } = readDeepLink();
    if (!deepView && !orderId) return;
    setView(deepView ?? "orders");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const applyAuthenticatedUser = async (user: User | null) => {
      if (!active) return;
      setAuthUser(user);
      if (!user) {
        setCloudCoupleId(null);
        setInviteCode(null);
        localStorage.removeItem(STORAGE_KEYS.cloudId);
        localStorage.removeItem(STORAGE_KEYS.inviteCode);
        return;
      }
      const { data: profileRow } = await supabase.from("profiles").select("couple_id, display_name").maybeSingle();
      if (!active || !profileRow?.couple_id) return;
      const { data: coupleRow } = await supabase.from("couples").select("invite_code").eq("id", profileRow.couple_id).maybeSingle();
      if (!active) return;
      localStorage.setItem(STORAGE_KEYS.cloudId, profileRow.couple_id);
      setCloudCoupleId(profileRow.couple_id);
      if (coupleRow?.invite_code) {
        localStorage.setItem(STORAGE_KEYS.inviteCode, coupleRow.invite_code);
        setInviteCode(coupleRow.invite_code);
      }
      if (profileRow.display_name === "大宝" || profileRow.display_name === "二宝") chooseIdentity(profileRow.display_name);
    };
    supabase.auth.getSession().then(({ data }) => applyAuthenticatedUser(data.session?.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("new-password");
        setAuthOpen(true);
      }
      window.setTimeout(() => applyAuthenticatedUser(session?.user ?? null), 0);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase, chooseIdentity]);

  useEffect(() => {
    if (!supabase || !authUser) return;
    const record = (message: string, kind: string) => {
      void supabase
        .rpc("record_client_error", {
          p_message: message.slice(0, 500),
          p_context: { kind, path: window.location.pathname, appVersion: "2026.08.11" },
        })
        .then(undefined, () => undefined); // Monitoring must never create another user-visible failure.
    };
    const onError = (event: ErrorEvent) => record(event.message || "window error", "window.error");
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      record(reason instanceof Error ? reason.message : "unhandled promise rejection", "unhandledrejection");
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [supabase, authUser]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
  }, [profile]);

  // Local orders keep display names, so renaming a partner has to rewrite the
  // orders that already exist. Cloud mode is skipped: there the server is the
  // source of truth and a blind rename would mislabel the partner's orders.
  useEffect(() => {
    const previous = previousNames.current;
    previousNames.current = { first: profile.firstName, second: profile.secondName };
    if (cloudCoupleId || !previous) return;
    if (previous.first === profile.firstName && previous.second === profile.secondName) return;
    const rename = (name: string) => {
      if (name === previous.first) return profile.firstName;
      if (name === previous.second) return profile.secondName;
      return name;
    };
    setOrders((current) => current.map((order) => ({ ...order, from: rename(order.from), to: rename(order.to) })));
  }, [profile.firstName, profile.secondName, cloudCoupleId]);

  useEffect(() => {
    const channel = new BroadcastChannel("couple-order-shop");
    broadcastChannel.current = channel;
    channel.onmessage = (event) => {
      if (!cloudCoupleId && event.data?.type === "sync") {
        applyingBroadcast.current = true;
        setOrders(event.data.orders);
        setCoins(event.data.coins);
        if (event.data.claimedTasks) setClaimedTasks(event.data.claimedTasks);
        if (event.data.profile) setProfile(event.data.profile);
      }
    };
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => {
      broadcastChannel.current = null;
      channel.close();
    };
  }, [cloudCoupleId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(orders));
    localStorage.setItem(STORAGE_KEYS.coins, String(coins));
    localStorage.setItem(STORAGE_KEYS.taskClaims, JSON.stringify(claimedTasks));
    if (applyingBroadcast.current) {
      applyingBroadcast.current = false;
      return;
    }
    if (!cloudCoupleId) broadcastChannel.current?.postMessage({ type: "sync", orders, coins, claimedTasks, profile });
  }, [orders, coins, claimedTasks, profile, cloudCoupleId]);

  const signMemoryRows = useCallback(async (
    client: SupabaseClient,
    rows: Array<{ id: string; caption: string; happened_on: string; image_path: string | null; created_at: string }>,
  ): Promise<MemoryEntry[]> => {
    const paths = rows.map((row) => row.image_path).filter((path): path is string => Boolean(path));
    const signed = new Map<string, string>();
    if (paths.length > 0) {
      const { data } = await client.storage.from("memory-photos").createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      for (const entry of data ?? []) {
        if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
      }
    }
    memoriesSignedAt.current = Date.now();
    return rows.map((row) => ({
      id: row.id,
      caption: row.caption,
      happenedOn: row.happened_on,
      imagePath: row.image_path ?? undefined,
      imageUrl: row.image_path ? signed.get(row.image_path) : undefined,
      createdAt: row.created_at,
    }));
  }, []);

  const loadMemories = useCallback(async (client: SupabaseClient, coupleId: string) => {
    const { data } = await client
      .from("memory_entries")
      .select("id, caption, happened_on, image_path, created_at")
      .eq("couple_id", coupleId)
      .order("happened_on", { ascending: false });
    if (data) setMemories(await signMemoryRows(client, data));
  }, [signMemoryRows]);

  const loadOrders = useCallback(async (client: SupabaseClient, coupleId: string) => {
    const { data } = await client.from("orders").select("*").eq("couple_id", coupleId).order("created_at", { ascending: false });
    setOrders((data ?? []).map((row) => ({
      id: row.id,
      itemId: row.item_id,
      itemName: row.item_name,
      image: row.image_url ?? undefined,
      price: row.price,
      note: row.note ?? "",
      createdAt: row.created_at,
      desiredTime: row.desired_time,
      status: row.status,
      from: row.from_name,
      to: row.to_name,
      createdBy: row.created_by,
    })));
  }, []);

  const loadCouple = useCallback(async (client: SupabaseClient, coupleId: string) => {
    const { data } = await client
      .from("couples")
      .select("coin_balance, name, partner_a_name, partner_b_name, started_on")
      .eq("id", coupleId)
      .maybeSingle();
    if (!data) return;
    if (typeof data.coin_balance === "number") setCoins(data.coin_balance);
    setProfile({
      shopName: data.name || DEFAULT_PROFILE.shopName,
      firstName: data.partner_a_name || DEFAULT_PROFILE.firstName,
      secondName: data.partner_b_name || DEFAULT_PROFILE.secondName,
      startedOn: data.started_on || DEFAULT_PROFILE.startedOn,
    });
  }, []);

  const loadAnniversaries = useCallback(async (client: SupabaseClient, coupleId: string) => {
    const { data } = await client
      .from("anniversaries")
      .select("id, title, event_date, repeats_yearly, reminder_days")
      .eq("couple_id", coupleId)
      .order("event_date");
    if (data) {
      setAnniversaries(data.map((row) => ({
        id: row.id,
        title: row.title,
        eventDate: row.event_date,
        repeatsYearly: row.repeats_yearly,
        reminderDays: row.reminder_days,
      })));
    }
  }, []);

  useEffect(() => {
    if (!supabase || !cloudCoupleId || !authUser) return;
    let active = true;
    const client = supabase;
    const coupleId = cloudCoupleId;

    const loadAll = async () => {
      await Promise.all([
        loadOrders(client, coupleId),
        loadCouple(client, coupleId),
        loadMemories(client, coupleId),
        loadAnniversaries(client, coupleId),
      ]);
      if (!active) return;
      // Task claims are per person: each partner earns their own rewards.
      const { data: claims } = await client
        .from("task_claims")
        .select("task_id, period_key")
        .eq("couple_id", coupleId)
        .eq("user_id", authUser.id);
      if (active && claims) setClaimedTasks(claims.map((claim) => `${claim.period_key}:${claim.task_id}`));
      const { data: checkinRow } = await client.rpc("get_checkin_status").single();
      if (active && checkinRow) {
        const status = checkinRow as { streak: number; checked_today: boolean };
        setCheckin({ streak: status.streak, checkedToday: status.checked_today });
      }
      const { data: membershipRow } = await client
        .from("memberships")
        .select("status, membership_plans(name)")
        .eq("couple_id", coupleId)
        .maybeSingle();
      if (active && membershipRow) {
        const plan = membershipRow.membership_plans as unknown as { name?: string } | null;
        setMembership({ planName: plan?.name ?? "基础版", status: membershipRow.status });
      }
    };
    void loadAll();

    // Each table refreshes only what it owns instead of replaying every query.
    const channel = client.channel(`couple:${coupleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `couple_id=eq.${coupleId}` }, () => {
        void loadOrders(client, coupleId);
        void loadCouple(client, coupleId);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "couples", filter: `id=eq.${coupleId}` }, () => {
        void loadCouple(client, coupleId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "memory_entries", filter: `couple_id=eq.${coupleId}` }, () => {
        void loadMemories(client, coupleId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "anniversaries", filter: `couple_id=eq.${coupleId}` }, () => {
        void loadAnniversaries(client, coupleId);
      })
      .subscribe();
    return () => {
      active = false;
      client.removeChannel(channel);
    };
  }, [supabase, cloudCoupleId, authUser, loadOrders, loadCouple, loadMemories, loadAnniversaries]);

  // Signed photo links expire after an hour; refresh them when the album is
  // opened again or the app returns to the foreground.
  useEffect(() => {
    if (!supabase || !cloudCoupleId) return;
    const client = supabase;
    const coupleId = cloudCoupleId;
    const refreshIfStale = () => {
      if (memories.every((memory) => !memory.imagePath)) return;
      if (Date.now() - memoriesSignedAt.current < SIGNED_URL_REFRESH_MS) return;
      void loadMemories(client, coupleId);
    };
    if (view === "memories") refreshIfStale();
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => document.removeEventListener("visibilitychange", refreshIfStale);
  }, [supabase, cloudCoupleId, view, memories, loadMemories]);

  useEffect(() => {
    const upcoming = [...anniversaries]
      .map((item) => ({ item, days: daysUntilAnniversary(item.eventDate, item.repeatsYearly) }))
      .filter(({ item, days }) => days <= item.reminderDays)
      .sort((a, b) => a.days - b.days)[0];
    if (!upcoming) return;
    const reminderKey = `couple-shop-reminded:${upcoming.item.id}:${todayKey()}`;
    if (localStorage.getItem(reminderKey)) return;
    localStorage.setItem(reminderKey, "1");
    const timer = window.setTimeout(() => {
      const message = upcoming.days === 0 ? `今天是「${upcoming.item.title}」` : `「${upcoming.item.title}」还有 ${upcoming.days} 天`;
      showToast(message);
      if (notificationsSupported && Notification.permission === "granted" && "serviceWorker" in navigator) {
        navigator.serviceWorker.ready
          .then((registration) => registration.showNotification("纪念日提醒 💕", { body: message, icon: "/assets/app-icon.png" }))
          .catch(() => undefined);
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [anniversaries, showToast]);

  const clearCloudLocalState = () => {
    localStorage.removeItem(STORAGE_KEYS.cloudId);
    localStorage.removeItem(STORAGE_KEYS.inviteCode);
    localStorage.removeItem(STORAGE_KEYS.orders);
    localStorage.removeItem(STORAGE_KEYS.taskClaims);
    setCloudCoupleId(null);
    setInviteCode(null);
    setOrders([]);
    setClaimedTasks([]);
    setMemories([]);
    setAnniversaries([]);
    setCheckin({ streak: 0, checkedToday: false });
  };

  const openAccount = () => {
    setAuthMode(authUser && !authUser.is_anonymous ? "signin" : "signup");
    setAuthOpen(true);
  };

  const submitAuth = async () => {
    const client = await getSupabase();
    if (!client) return showToast("云服务尚未配置");
    setAuthBusy(true);
    try {
      if (authMode === "recover") {
        if (!authEmail.trim()) throw new Error("email required");
        const { error } = await client.auth.resetPasswordForEmail(authEmail.trim(), { redirectTo: window.location.origin });
        if (error) throw error;
        closeAuth();
        showToast("如果邮箱已注册，重置邮件会很快送达");
        return;
      }
      if (authMode === "new-password") {
        if (authPassword.length < 6) throw new Error("password too short");
        const { error } = await client.auth.updateUser({ password: authPassword });
        if (error) throw error;
        setAuthPassword("");
        closeAuth();
        showToast("新密码已保存");
        return;
      }
      if (authMode === "phone") {
        if (!phoneOtpSent) {
          const phone = authPhone.replace(/[\s-]/g, "");
          if (!/^\+\d{7,15}$/.test(phone)) return showToast("请输入含国家区号的手机号，例如 +86138…");
          const { error } = await client.auth.signInWithOtp({ phone });
          if (error) throw error;
          setPhoneOtpSent(true);
          showToast("验证码已发送");
        } else {
          const { error } = await client.auth.verifyOtp({ phone: authPhone.replace(/[\s-]/g, ""), token: authOtp.trim(), type: "sms" });
          if (error) throw error;
          closeAuth();
          showToast("手机号登录成功");
        }
        return;
      }
      if (!/^\S+@\S+\.\S+$/.test(authEmail.trim())) return showToast("请输入正确的邮箱地址");
      if (authPassword.length < 6) return showToast("密码至少需要 6 位");
      if (authMode === "signup") {
        if (!privacyAccepted) return showToast("请先同意隐私协议与用户协议");
        if (authUser?.is_anonymous) {
          const { error } = await client.auth.updateUser({ email: authEmail.trim(), password: authPassword });
          if (error) throw error;
          showToast("升级申请已提交，请去邮箱完成验证");
        } else {
          const { data, error } = await client.auth.signUp({ email: authEmail.trim(), password: authPassword, options: { emailRedirectTo: window.location.origin } });
          if (error) throw error;
          showToast(data.session ? "注册成功" : "注册成功，请去邮箱完成验证");
        }
      } else {
        const { error } = await client.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
        showToast("登录成功，正在恢复双人小铺");
      }
      setAuthPassword("");
      closeAuth();
    } catch (error) {
      showToast(authErrorMessage(error instanceof Error ? error.message : "unknown"));
    } finally {
      setAuthBusy(false);
    }
  };

  const signInWithApple = async () => {
    const client = await getSupabase();
    if (!client) return;
    const { error } = await client.auth.signInWithOAuth({ provider: "apple", options: { redirectTo: window.location.origin } });
    if (error) showToast(authErrorMessage(error.message));
  };

  const signOut = async () => {
    const client = await getSupabase();
    if (!client) return;
    await client.auth.signOut();
    clearCloudLocalState();
    closeAuth();
    showToast("已安全退出，这台手机的同步缓存已清理");
  };

  const exportData = async () => {
    try {
      let payload: Record<string, unknown> = { exportedAt: new Date().toISOString(), formatVersion: 1, profile, orders, claimedTasks, memories, anniversaries };
      const client = cloudCoupleId ? await getSupabase() : null;
      if (client && cloudCoupleId) {
        const [coupleData, orderData, taskData, memoryData, anniversaryData, checkinData, auditData] = await Promise.all([
          client.from("couples").select("name, partner_a_name, partner_b_name, started_on, coin_balance, created_at").eq("id", cloudCoupleId).maybeSingle(),
          client.from("orders").select("*").eq("couple_id", cloudCoupleId),
          client.from("task_claims").select("task_id, period_key, reward, created_at").eq("couple_id", cloudCoupleId),
          client.from("memory_entries").select("caption, happened_on, image_path, created_at").eq("couple_id", cloudCoupleId),
          client.from("anniversaries").select("title, event_date, repeats_yearly, reminder_days").eq("couple_id", cloudCoupleId),
          client.from("daily_checkins").select("checked_on, reward, created_at").eq("couple_id", cloudCoupleId),
          client.from("audit_logs").select("action, metadata, created_at").eq("couple_id", cloudCoupleId).order("created_at", { ascending: false }).limit(500),
        ]);
        payload = {
          exportedAt: new Date().toISOString(),
          formatVersion: 1,
          couple: coupleData.data,
          orders: orderData.data,
          taskClaims: taskData.data,
          memories: memoryData.data,
          anniversaries: anniversaryData.data,
          checkins: checkinData.data,
          auditLog: auditData.data,
        };
      }
      const file = new File([JSON.stringify(payload, null, 2)], `情侣小铺备份-${todayKey()}.json`, { type: "application/json" });
      const shareNavigator = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (navigator.share && shareNavigator.canShare?.({ files: [file] })) await navigator.share({ title: "情侣小铺数据备份", files: [file] });
      else {
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      showToast("数据备份已生成");
    } catch {
      showToast("导出失败，请稍后再试");
    }
  };

  const confirmDangerAction = async () => {
    const client = await getSupabase();
    if (!client || !dangerConfirm) return;
    setCloudBusy(true);
    try {
      if (dangerConfirm === "leave") {
        const { error } = await client.rpc("leave_couple_space");
        if (error) throw error;
        clearCloudLocalState();
        showToast("已解除配对，可以创建或加入新的小铺");
      } else {
        const { error } = await client.rpc("delete_my_account");
        if (error) throw error;
        clearCloudLocalState();
        setAuthUser(null);
        showToast("账户与个人数据已注销");
      }
      setDangerConfirm(null);
      setPrivacyOpen(false);
    } catch {
      showToast("操作失败，请稍后再试");
    } finally {
      setCloudBusy(false);
    }
  };

  const dailyCheckin = async () => {
    const client = cloudCoupleId ? await getSupabase() : null;
    if (!client || !authUser) {
      setAuthOpen(true);
      return showToast("登录并连接双人小铺后才能签到");
    }
    const { data, error } = await client.rpc("daily_checkin").single();
    if (error) return showToast(rewardErrorMessage(error.message, "今天已经签过到啦"));
    const result = data as { coin_balance: number; streak: number; reward: number };
    setCoins(result.coin_balance);
    setCheckin({ streak: result.streak, checkedToday: true });
    showToast(`连续签到 ${result.streak} 天，甜心币 +${result.reward}`);
  };

  const saveMemory = async () => {
    const client = cloudCoupleId ? await getSupabase() : null;
    if (!client || !cloudCoupleId || !authUser) return showToast("请先登录并连接双人小铺");
    if (!memoryCaption.trim()) return showToast("写一句这张照片的故事吧");
    if (!isValidDateKey(memoryDate) || memoryDate > todayKey()) return showToast("回忆日期不能晚于今天");
    if (memoryFile && (memoryFile.size > 8 * 1024 * 1024 || !memoryFile.type.startsWith("image/"))) return showToast("请选择 8MB 以内的照片");
    setCloudBusy(true);
    let imagePath: string | undefined;
    try {
      if (memoryFile) {
        const extension = memoryFile.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        imagePath = `${cloudCoupleId}/${newId()}.${extension}`;
        const { error: uploadError } = await client.storage.from("memory-photos").upload(imagePath, memoryFile, { contentType: memoryFile.type, upsert: false });
        if (uploadError) throw uploadError;
      }
      const id = newId();
      const { error } = await client.from("memory_entries").insert({ id, couple_id: cloudCoupleId, created_by: authUser.id, caption: memoryCaption.trim(), happened_on: memoryDate, image_path: imagePath ?? null });
      if (error) throw error;
      let imageUrl: string | undefined;
      if (imagePath) imageUrl = (await client.storage.from("memory-photos").createSignedUrl(imagePath, SIGNED_URL_TTL_SECONDS)).data?.signedUrl;
      setMemories((current) => [{ id, caption: memoryCaption.trim(), happenedOn: memoryDate, imagePath, imageUrl, createdAt: new Date().toISOString() }, ...current]);
      setMemoryCaption("");
      setMemoryFile(null);
      closeMemory();
      showToast("这份回忆已经收藏好啦");
    } catch {
      if (imagePath) await client.storage.from("memory-photos").remove([imagePath]);
      showToast("保存失败，请稍后再试");
    } finally {
      setCloudBusy(false);
    }
  };

  const saveAnniversary = async () => {
    const client = cloudCoupleId ? await getSupabase() : null;
    if (!client || !cloudCoupleId || !authUser) return showToast("请先登录并连接双人小铺");
    if (!anniversaryTitle.trim()) return showToast("请填写纪念日名称");
    if (!isValidDateKey(anniversaryDate)) return showToast("请填写正确日期");
    setCloudBusy(true);
    const id = newId();
    const { error } = await client.from("anniversaries").insert({ id, couple_id: cloudCoupleId, created_by: authUser.id, title: anniversaryTitle.trim(), event_date: anniversaryDate, repeats_yearly: true, reminder_days: 3 });
    setCloudBusy(false);
    if (error) return showToast("保存失败，请稍后再试");
    setAnniversaries((current) => [...current, { id, title: anniversaryTitle.trim(), eventDate: anniversaryDate, repeatsYearly: true, reminderDays: 3 }]);
    setAnniversaryTitle("");
    closeAnniversary();
    showToast("纪念日已保存，将提前 3 天提醒");
  };

  const openSettings = () => {
    setProfileDraft(profile);
    setSettingsOpen(true);
  };

  const saveProfile = async () => {
    const nextProfile: CoupleProfile = {
      shopName: profileDraft.shopName.trim(),
      firstName: profileDraft.firstName.trim(),
      secondName: profileDraft.secondName.trim(),
      startedOn: profileDraft.startedOn.trim(),
    };
    if (!nextProfile.shopName || !nextProfile.firstName || !nextProfile.secondName) return showToast("请把小铺和双方名字填写完整");
    if ([nextProfile.shopName, nextProfile.firstName, nextProfile.secondName].some((value) => value.length > 20)) return showToast("名字最多 20 个字");
    if (!isValidDateKey(nextProfile.startedOn)) return showToast("开始日期请按 YYYY-MM-DD 填写");
    if (nextProfile.startedOn > todayKey()) return showToast("开始日期不能晚于今天");

    setProfileSaving(true);
    try {
      const client = cloudCoupleId ? await getSupabase() : null;
      if (client) {
        const { error } = await client.rpc("update_couple_profile", {
          p_name: nextProfile.shopName,
          p_partner_a_name: nextProfile.firstName,
          p_partner_b_name: nextProfile.secondName,
          p_started_on: nextProfile.startedOn,
        });
        if (error) throw error;
      }
      setProfile(nextProfile);
      closeSettings();
      showToast(cloudCoupleId ? "资料已保存并同步给另一半" : "小铺资料已保存");
    } catch {
      showToast("保存失败，请稍后再试");
    } finally {
      setProfileSaving(false);
    }
  };

  const switchIdentity = () => {
    localStorage.removeItem(STORAGE_KEYS.identity);
    setIdentity(null);
  };

  const chooseRandom = () => {
    const foods = MENU.filter((item) => item.category === "food");
    const item = foods[Math.floor(Math.random() * foods.length)];
    setSelected(item);
    showToast(`今天就选「${item.name}」`);
  };

  const copyInviteCode = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      showToast(`情侣码 ${inviteCode} 已复制`);
    } catch {
      showToast(`情侣码是 ${inviteCode}`);
    }
  };

  const submitOrder = async () => {
    if (!selected || !identity || !currentName || !partnerName) return;
    const order: Order = {
      id: newId(),
      itemId: selected.id,
      itemName: selected.name,
      image: selected.image,
      price: selected.price,
      note: note.trim(),
      createdAt: new Date().toISOString(),
      desiredTime: time,
      status: "pending",
      from: currentName,
      to: partnerName,
      createdBy: authUser?.id,
    };
    const client = cloudCoupleId ? await getSupabase() : null;
    if (client) {
      const { data, error } = await client.rpc("place_couple_order", {
        p_id: order.id,
        p_item_id: order.itemId,
        p_item_name: order.itemName,
        p_image_url: order.image ?? null,
        p_price: order.price,
        p_note: order.note,
        p_desired_time: order.desiredTime,
        p_from_name: order.from,
        p_to_name: order.to,
      }).single();
      if (error) return showToast(orderErrorMessage(error.message));
      const result = data as { order_id: string; coin_balance: number };
      setCoins(result.coin_balance);
      setOrders((current) => [order, ...current.filter((item) => item.id !== order.id)]);
      closeOrderSheet();
      setNote("");
      showToast(`下单成功，已提醒${partnerName}`);
      await client.functions.invoke("notify-partner", { body: { orderId: order.id } });
      return;
    }
    if (usedLimitedIds.includes(selected.id)) return showToast("这张限定券已经用过了");
    if (coins < selected.price) return showToast("甜心币不够啦");
    setOrders((current) => [order, ...current]);
    setCoins((current) => current - selected.price);
    closeOrderSheet();
    setNote("");
    showToast("下单成功，已记在小铺里");
  };

  const updateStatus = async (id: string, status: OrderStatus) => {
    const target = orders.find((order) => order.id === id);
    const client = cloudCoupleId ? await getSupabase() : null;
    if (client) {
      const { data, error } = await client.rpc("update_order_status", { p_order_id: id, p_status: status }).single();
      if (error) return showToast(orderStatusErrorMessage(error.message));
      const result = data as { coin_balance: number } | null;
      if (typeof result?.coin_balance === "number") setCoins(result.coin_balance);
    } else if (status === "rejected" && target) {
      // Local mode has no server to refund the sender, so do it here.
      setCoins((current) => current + target.price);
    }
    setOrders((current) => current.map((order) => (order.id === id ? { ...order, status } : order)));
    if (status === "rejected") showToast(`已婉拒，${target?.price ?? 0} 甜心币退回小铺`);
    else if (status === "done") showToast("心愿完成，记得去任务中心领取奖励");
    else showToast(`订单已更新为「${statusText[status]}」`);
  };

  const claimTask = async (task: CoupleTask) => {
    const key = taskClaimKey(task);
    if (claimedTasks.includes(key)) return;
    const client = cloudCoupleId ? await getSupabase() : null;
    if (client) {
      const { data, error } = await client.rpc("claim_couple_task", { p_task_id: task.id }).single();
      if (error) return showToast(rewardErrorMessage(error.message, "这个任务已经领取过啦"));
      const result = data as { coin_balance: number; claim_key: string };
      setClaimedTasks((current) => [...current, `${result.claim_key}:${task.id}`]);
      setCoins(result.coin_balance);
      showToast(`任务完成，甜心币 +${task.reward}`);
      return;
    }
    setClaimedTasks((current) => [...current, key]);
    setCoins((current) => current + task.reward);
    showToast(`任务完成，甜心币 +${task.reward}`);
  };

  const enableNotifications = async () => {
    if (!notificationsSupported) return showToast("当前浏览器不支持通知");
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === "granted");
    if (permission !== "granted") return showToast("需要在 iPhone 设置中允许通知");
    showToast("通知已开启");
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    const vapidPublicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined;
    const client = cloudCoupleId ? await getSupabase() : null;
    if (vapidPublicKey && client && cloudCoupleId) {
      try {
        const padding = "=".repeat((4 - (vapidPublicKey.length % 4)) % 4);
        const base64 = (vapidPublicKey + padding).replace(/-/g, "+").replace(/_/g, "/");
        const applicationServerKey = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
        const json = subscription.toJSON();
        const { data: sessionData } = await client.auth.getSession();
        await client.from("push_subscriptions").upsert(
          { user_id: sessionData.session?.user.id, couple_id: cloudCoupleId, endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth },
          { onConflict: "endpoint" },
        );
      } catch {
        showToast("通知已开启，但推送订阅失败，稍后可重试");
      }
    }
    registration.showNotification("点单小铺", { body: "以后有新订单，我会马上告诉你。", icon: "/assets/app-icon.png" });
  };

  const createCloudSpace = async () => {
    const client = await getSupabase();
    if (!client || !identity) return;
    if (!authUser || authUser.is_anonymous) {
      setAuthMode("signup");
      setAuthOpen(true);
      return showToast("请先注册正式账户，换手机也能恢复");
    }
    setCloudBusy(true);
    try {
      const { data, error } = await client.rpc("create_couple_space", { display_name: identity }).single();
      if (error) throw error;
      const row = data as { couple_id: string; invite_code: string };
      localStorage.setItem(STORAGE_KEYS.cloudId, row.couple_id);
      localStorage.setItem(STORAGE_KEYS.inviteCode, row.invite_code);
      setCloudCoupleId(row.couple_id);
      setInviteCode(row.invite_code);
      await client.rpc("update_couple_profile", {
        p_name: profile.shopName,
        p_partner_a_name: profile.firstName,
        p_partner_b_name: profile.secondName,
        p_started_on: profile.startedOn,
      });
      showToast(`情侣码 ${row.invite_code} 已生成`);
    } catch {
      showToast("创建失败，请检查免费云配置");
    } finally {
      setCloudBusy(false);
    }
  };

  const joinCloudSpace = async () => {
    const client = await getSupabase();
    if (!client || !identity) return;
    if (!authUser || authUser.is_anonymous) {
      setAuthMode("signup");
      setAuthOpen(true);
      return showToast("请先登录正式账户，再加入双人小铺");
    }
    setCloudBusy(true);
    try {
      const { data, error } = await client.rpc("join_couple_space", { code: pairingCode, display_name: identity }).single();
      if (error) throw error;
      const row = data as { couple_id: string };
      localStorage.setItem(STORAGE_KEYS.cloudId, row.couple_id);
      localStorage.setItem(STORAGE_KEYS.inviteCode, pairingCode);
      setCloudCoupleId(row.couple_id);
      setInviteCode(pairingCode);
      setPairingCode("");
      showToast("配对成功，双人小铺已连接");
    } catch {
      showToast("没有找到这个情侣码");
    } finally {
      setCloudBusy(false);
    }
  };

  if (!identity || !currentName || !partnerName) {
    return (
      <div className="app-shell identity-shell">
        <MobileScroll className="identity-screen">
          <main className="identity-login" aria-label="选择登录身份">
            <div className="identity-brand"><span><HeartFilledIcon /></span><strong>{profile.shopName}</strong></div>
            <div className="identity-welcome"><span>{profile.firstName} & {profile.secondName}</span><h1>今天是谁来点单？</h1><p>两台 iPhone 分别选择自己的身份，订单就会自动发给对方。</p></div>
            <div className="identity-options">
              {identityOptions.map((option) => (
                <button key={option.name} className={`identity-choice ${option.tone}`} onClick={() => { chooseIdentity(option.name); setView("shop"); }}>
                  <span className="identity-avatar">{option.displayName.slice(0, 1)}</span>
                  <span><strong>我是{option.displayName}</strong><small>今天由{option.displayName}来点单</small></span>
                  <span className="identity-arrow"><PaperPlaneIcon /></span>
                </button>
              ))}
            </div>
            <div className="identity-note"><CheckCircledIcon /><span>选择后，这台 iPhone 会自动记住你的身份</span></div>
          </main>
        </MobileScroll>
      </div>
    );
  }

  const syncState = cloudCoupleId
    ? { title: `与${partnerName}的小铺已连接`, detail: "新订单会实时送到对方手机", live: true }
    : cloudEnabled
      ? { title: `还没有连接${partnerName}`, detail: "去「我们」页创建小铺或输入情侣码", live: false }
      : { title: "本地体验模式", detail: "订单只保存在这台 iPhone 上", live: false };

  return (
    <div className="app-shell">
      <MobileScroll className="app-screen">
        <main className="screen-content couple-shop" aria-label="情侣点单小铺">
          <header className="top-bar">
            <div className="brand-mark"><HeartFilledIcon /></div>
            <div className="brand-copy"><span>{profile.firstName} & {profile.secondName}</span><h1>{profile.shopName}</h1></div>
            <button className="bell-button" onClick={() => setView("orders")} aria-label="查看订单"><BellIcon />{activeOrders > 0 && <span>{activeOrders}</span>}</button>
          </header>
          <section className="live-push-strip" aria-label="同步状态">
            <span className="live-push-icon"><BellIcon /></span>
            <div><strong>{syncState.title}</strong><small>{syncState.detail}</small></div>
            {syncState.live && <span className="live-state"><i /> 实时</span>}
          </section>
          <section className="wallet-card">
            <div className="coin-count"><HeartFilledIcon /><strong>{coins}</strong><span>甜心币</span></div>
            <button className="earn-link" onClick={() => setView("tasks")}><CheckCircledIcon /><span>做任务赚币</span></button>
          </section>

          {view === "shop" && <ShopScreen category={category} setCategory={setCategory} onAdd={setSelected} onRandom={chooseRandom} usedLimitedIds={usedLimitedIds} />}
          {view === "tasks" && <TasksScreen coins={coins} claimedTasks={claimedTasks} onClaim={claimTask} />}
          {view === "orders" && <OrdersScreen orders={orders} currentName={currentName} onStatus={updateStatus} />}
          {view === "memories" && <MemoriesScreen orders={orders} profile={profile} memories={memories} anniversaries={anniversaries} checkin={checkin} onCheckin={dailyCheckin} onAddMemory={() => setMemoryOpen(true)} onAddAnniversary={() => setAnniversaryOpen(true)} />}
          {view === "ours" && (
            <OursScreen
              identity={identity}
              partnerName={partnerName}
              onSwitchIdentity={switchIdentity}
              notificationsSupported={notificationsSupported}
              notificationsEnabled={notificationsEnabled}
              onEnableNotifications={enableNotifications}
              cloudCoupleId={cloudCoupleId}
              inviteCode={cloudCoupleId ? inviteCode : null}
              onCopyInviteCode={copyInviteCode}
              pairingCode={pairingCode}
              setPairingCode={setPairingCode}
              cloudBusy={cloudBusy}
              onCreateSpace={createCloudSpace}
              onJoinSpace={joinCloudSpace}
              profile={profile}
              onOpenSettings={openSettings}
              authUser={authUser}
              onOpenAccount={openAccount}
              membership={membership}
              onExport={exportData}
              onLeaveCouple={() => { setDangerConfirm("leave"); setPrivacyOpen(true); }}
              onOpenPrivacy={() => setPrivacyOpen(true)}
            />
          )}
          <div className="bottom-spacer" />
        </main>
      </MobileScroll>

      <nav className="bottom-nav" aria-label="主要导航">
        <button className={view === "shop" ? "active" : ""} onClick={() => setView("shop")}><HomeIcon /><span>小铺</span></button>
        <button className={view === "tasks" ? "active" : ""} onClick={() => setView("tasks")}><TargetIcon /><span>任务</span></button>
        <button className={view === "orders" ? "active" : ""} onClick={() => setView("orders")}><ArchiveIcon />{activeOrders > 0 && <i />}<span>订单</span></button>
        <button className={view === "memories" ? "active" : ""} onClick={() => setView("memories")}><HeartIcon /><span>回忆</span></button>
        <button className={view === "ours" ? "active" : ""} onClick={() => setView("ours")}><PersonIcon /><span>我们</span></button>
      </nav>

      <BottomSheet open={Boolean(selected)} onOpenChange={(open) => !open && closeOrderSheet()} title={selected ? `点一份「${selected.name}」` : "确认点单"} description="对方会立刻收到新的心愿提醒">
        {selected && (
          <div className="order-sheet">
            <div className="sheet-item"><div className="sheet-art"><MenuArt item={selected} /></div><div><h3>{selected.name}</h3><p>{selected.description}</p></div><div className="price-pill"><HeartFilledIcon /> {selected.price}</div></div>
            <div className="time-options"><span>希望什么时候</span><div>{["尽快", "今晚 20:30", "明天见面时"].map((option) => <button key={option} className={time === option ? "active" : ""} onClick={() => setTime(option)}>{option}</button>)}</div></div>
            <label className="order-note-field" htmlFor="order-note">
              <span>给对方的悄悄话</span>
              <KeyboardInput id="order-note" value={note} maxLength={160} onChange={(event) => setNote(event.target.value)} placeholder="例如：想和你一起慢慢吃" />
            </label>
            <button className="submit-order" onClick={submitOrder}><HeartFilledIcon /> 确认下单 · {selected.price} 甜心币</button>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={settingsOpen} onOpenChange={(open) => (open ? setSettingsOpen(true) : closeSettings())} title="小铺资料" description={cloudCoupleId ? "保存后会同步到另一台 iPhone" : "连接双人云同步后，资料会自动同步"}>
        <div className="profile-sheet">
          <div className="profile-preview">
            <span>{profileDraft.firstName.slice(0, 1) || "大"}</span>
            <div><small>{profileDraft.shopName || "我们的小铺"}</small><strong>{profileDraft.firstName || "大宝"} & {profileDraft.secondName || "二宝"}</strong><p>从 {formatStartedOn(profileDraft.startedOn)} 开始</p></div>
            <span className="partner">{profileDraft.secondName.slice(0, 1) || "二"}</span>
          </div>
          <label className="profile-field" htmlFor="shop-name"><span>小铺名称</span><KeyboardInput id="shop-name" value={profileDraft.shopName} maxLength={20} onChange={(event) => setProfileDraft((current) => ({ ...current, shopName: event.target.value }))} placeholder="例如：安安和小屿的心愿铺" /></label>
          <div className="profile-name-grid">
            <label className="profile-field" htmlFor="first-name"><span>第一位名字</span><KeyboardInput id="first-name" value={profileDraft.firstName} maxLength={20} onChange={(event) => setProfileDraft((current) => ({ ...current, firstName: event.target.value }))} placeholder="大宝" /></label>
            <label className="profile-field" htmlFor="second-name"><span>第二位名字</span><KeyboardInput id="second-name" value={profileDraft.secondName} maxLength={20} onChange={(event) => setProfileDraft((current) => ({ ...current, secondName: event.target.value }))} placeholder="二宝" /></label>
          </div>
          <label className="profile-field" htmlFor="started-on"><span>恋爱开始日期</span><KeyboardInput id="started-on" value={profileDraft.startedOn} inputMode="numeric" maxLength={10} onChange={(event) => setProfileDraft((current) => ({ ...current, startedOn: normalizeDateInput(event.target.value) }))} placeholder="YYYY-MM-DD" /><small>例如 2024-05-20，保存后会自动计算相爱天数</small></label>
          <button className="save-profile" disabled={profileSaving} onClick={saveProfile}><CheckIcon />{profileSaving ? "正在保存…" : "保存小铺资料"}</button>
        </div>
      </BottomSheet>

      <BottomSheet open={authOpen} onOpenChange={(open) => (open ? setAuthOpen(true) : closeAuth())} title={authUser && !authUser.is_anonymous ? "账户中心" : authMode === "signup" ? "创建正式账户" : authMode === "recover" ? "找回账户" : authMode === "new-password" ? "设置新密码" : authMode === "phone" ? "手机号登录" : "登录账户"} description={authUser && !authUser.is_anonymous ? "账户已保护，换手机登录即可恢复" : "不再依赖匿名账户，数据跟随你的登录账户"}>
        <div className="account-sheet">
          {authUser && !authUser.is_anonymous ? (
            <>
              <div className="account-profile"><span><LockClosedIcon /></span><div><small>已验证账户</small><strong>{authUser.email ?? authUser.phone ?? "Apple 账户"}</strong><p>账户 ID 已安全绑定，不会向另一半展示</p></div></div>
              <div className="account-benefits"><div><CheckCircledIcon /><span>换手机自动恢复配对</span></div><div><CheckCircledIcon /><span>支持密码找回和数据导出</span></div><div><CheckCircledIcon /><span>所有云端操作都有安全记录</span></div></div>
              <button className="account-secondary" onClick={signOut}><ExitIcon /> 退出当前账户</button>
              <button className="account-danger" onClick={() => { closeAuth(); setDangerConfirm("delete"); setPrivacyOpen(true); }}><TrashIcon /> 注销账户</button>
            </>
          ) : (
            <>
              {authMode !== "recover" && authMode !== "new-password" && authMode !== "phone" && <div className="auth-tabs"><button className={authMode === "signin" ? "active" : ""} onClick={() => setAuthMode("signin")}>登录</button><button className={authMode === "signup" ? "active" : ""} onClick={() => setAuthMode("signup")}>{authUser?.is_anonymous ? "升级账户" : "注册"}</button></div>}
              {authMode === "phone" ? (
                <>
                  <label className="account-field"><span>手机号（含国家区号）</span><KeyboardInput value={authPhone} onChange={(event) => setAuthPhone(event.target.value)} inputMode="tel" placeholder="例如 +8613812345678" /></label>
                  {phoneOtpSent && <label className="account-field"><span>短信验证码</span><KeyboardInput value={authOtp} onChange={(event) => setAuthOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="6 位验证码" /></label>}
                </>
              ) : authMode === "new-password" ? (
                <label className="account-field"><span>新密码</span><KeyboardInput value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} type="password" placeholder="至少 6 位" /></label>
              ) : (
                <>
                  <label className="account-field"><span>邮箱</span><KeyboardInput value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} inputMode="email" autoCapitalize="none" placeholder="name@example.com" /></label>
                  {authMode !== "recover" && <label className="account-field"><span>密码</span><KeyboardInput value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} type="password" placeholder="至少 6 位" /></label>}
                </>
              )}
              {authMode === "signup" && <button className={`privacy-consent ${privacyAccepted ? "selected" : ""}`} onClick={() => { const next = !privacyAccepted; setPrivacyAccepted(next); localStorage.setItem(STORAGE_KEYS.privacyAccepted, next ? "1" : "0"); }}><span>{privacyAccepted ? <CheckIcon /> : null}</span><p>我已阅读并同意《用户协议》和《隐私政策》</p></button>}
              <button className="account-primary" disabled={authBusy} onClick={submitAuth}>{authBusy ? "处理中…" : authMode === "recover" ? "发送重置邮件" : authMode === "new-password" ? "保存新密码" : authMode === "phone" ? phoneOtpSent ? "验证并登录" : "发送验证码" : authMode === "signup" ? authUser?.is_anonymous ? "保护现有数据" : "注册账户" : "登录并恢复"}</button>
              {authMode === "signin" && <button className="auth-link" onClick={() => setAuthMode("recover")}>忘记密码？找回账户</button>}
              {(authMode === "recover" || authMode === "phone") && <button className="auth-link" onClick={() => { setAuthMode("signin"); setPhoneOtpSent(false); }}>返回邮箱登录</button>}
              {authMode !== "recover" && authMode !== "new-password" && <><div className="auth-divider"><span>其他登录方式</span></div><div className="provider-grid"><button onClick={() => setAuthMode("phone")}><span>☎</span> 手机号</button><button onClick={signInWithApple}><span className="apple-mark">●</span> Apple</button></div><p className="provider-note">手机号需配置短信服务；Apple 登录需配置 Apple Developer 凭据。</p></>}
            </>
          )}
        </div>
      </BottomSheet>

      <BottomSheet open={memoryOpen} onOpenChange={(open) => (open ? setMemoryOpen(true) : closeMemory())} title="收藏照片回忆" description="照片仅双人小铺成员可见，单张不超过 8MB">
        <div className="memory-form">
          <input ref={fileInputRef} className="hidden-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(event) => setMemoryFile(event.target.files?.[0] ?? null)} />
          <button className={`photo-picker ${memoryFile ? "selected" : ""}`} onClick={() => fileInputRef.current?.click()}><CameraIcon /><strong>{memoryFile ? memoryFile.name : "选择一张照片"}</strong><span>{memoryFile ? `${(memoryFile.size / 1024 / 1024).toFixed(1)} MB` : "支持相册与相机"}</span></button>
          <label className="account-field"><span>这张照片的故事</span><KeyboardInput value={memoryCaption} maxLength={160} onChange={(event) => setMemoryCaption(event.target.value)} placeholder="例如：第一次一起去看海" /></label>
          <label className="account-field"><span>发生日期</span><KeyboardInput value={memoryDate} inputMode="numeric" maxLength={10} onChange={(event) => setMemoryDate(normalizeDateInput(event.target.value))} placeholder="YYYY-MM-DD" /></label>
          <button className="account-primary" disabled={cloudBusy} onClick={saveMemory}>{cloudBusy ? "正在收藏…" : "保存到双人回忆"}</button>
        </div>
      </BottomSheet>

      <BottomSheet open={anniversaryOpen} onOpenChange={(open) => (open ? setAnniversaryOpen(true) : closeAnniversary())} title="添加纪念日" description="每年重复，并在进入小铺时提前 3 天提醒">
        <div className="memory-form">
          <label className="account-field"><span>纪念日名称</span><KeyboardInput value={anniversaryTitle} maxLength={40} onChange={(event) => setAnniversaryTitle(event.target.value)} placeholder="例如：第一次见面" /></label>
          <label className="account-field"><span>日期</span><KeyboardInput value={anniversaryDate} inputMode="numeric" maxLength={10} onChange={(event) => setAnniversaryDate(normalizeDateInput(event.target.value))} placeholder="YYYY-MM-DD" /></label>
          <div className="reminder-note"><BellIcon /><div><strong>提前 3 天提醒</strong><p>当前版本会在打开小铺时提醒；开启消息通知后将接入后台定时推送。</p></div></div>
          <button className="account-primary" disabled={cloudBusy} onClick={saveAnniversary}>{cloudBusy ? "正在保存…" : "保存纪念日"}</button>
        </div>
      </BottomSheet>

      <BottomSheet open={privacyOpen} onOpenChange={(open) => { setPrivacyOpen(open); if (!open) setDangerConfirm(null); }} title={dangerConfirm === "leave" ? "确认解除配对" : dangerConfirm === "delete" ? "确认注销账户" : "隐私与账户安全"} description="你的数据、你的选择，随时可以带走或删除">
        <div className="privacy-sheet">
          {dangerConfirm ? (
            <div className="danger-confirm"><span><TrashIcon /></span><h3>{dangerConfirm === "leave" ? "解除后，两台手机将停止同步" : "注销后，账户无法恢复"}</h3><p>{dangerConfirm === "leave" ? "当前账户会离开双人小铺；另一半的账户和共同数据会保留。你以后仍可用新情侣码重新配对。" : "你的登录账户、配对关系和个人数据会立即删除；若小铺只剩你一人，共同数据也会一并删除。请先导出备份。"}</p><button className="danger-final" disabled={cloudBusy} onClick={confirmDangerAction}>{cloudBusy ? "正在处理…" : dangerConfirm === "leave" ? "确认解除配对" : "确认永久注销"}</button><button className="account-secondary" onClick={() => setDangerConfirm(null)}>我再想想</button></div>
          ) : (
            <>
              <div className="privacy-section"><span><LockClosedIcon /></span><div><strong>我们保存什么</strong><p>账户标识、情侣配对、订单、任务、签到、回忆照片、纪念日和必要的安全操作记录。</p></div></div>
              <div className="privacy-section"><span><ReaderIcon /></span><div><strong>这些数据怎么使用</strong><p>只用于双人同步、提醒、账号恢复、防刷币和故障排查；不会出售给广告平台。</p></div></div>
              <div className="privacy-section"><span><DownloadIcon /></span><div><strong>数据权利</strong><p>你可以随时导出数据、解除配对或注销账户。照片使用私有存储和短时访问链接。</p></div></div>
              <div className="security-grid"><div><strong>限流</strong><span>订单、任务、签到</span></div><div><strong>审计</strong><span>关键操作留痕</span></div><div><strong>备份</strong><span>随时导出 JSON</span></div></div>
              <div className="legal-links"><button onClick={() => window.open("/privacy.html", "_blank", "noopener,noreferrer")}>完整隐私政策</button><button onClick={() => window.open("/terms.html", "_blank", "noopener,noreferrer")}>完整用户协议</button></div>
              <button className="account-secondary" onClick={exportData}><DownloadIcon /> 导出我的数据</button>
              {authUser && !authUser.is_anonymous && <button className="account-danger" onClick={() => setDangerConfirm("delete")}><TrashIcon /> 注销账户</button>}
            </>
          )}
        </div>
      </BottomSheet>

      <div className="toast-region" role="status" aria-live="polite">
        {toast && <div className="toast"><CheckCircledIcon />{toast}</div>}
      </div>
    </div>
  );
}
