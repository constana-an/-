import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ImageIcon,
  LockClosedIcon,
  PaperPlaneIcon,
  Pencil1Icon,
  PersonIcon,
  ReaderIcon,
  TargetIcon,
  ArchiveIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { BottomSheet, KeyboardInput, MobileScroll, useKeyboard, useKeyboardInsets } from "./mobile";
import { DESIRED_TIMES, MENU, WISH_TEMPLATES, categoryMeta, earnedInWeek, reachedMilestones, statusText, taskClaimKey } from "./lib/catalog";
import { dayKeyOf, formatStartedOn, isValidDateKey, normalizeDateInput, relationshipDays, todayKey } from "./lib/date";
import { checkinStatusFrom, checkinStreak, dueAnniversaries } from "./lib/date";
import { authErrorMessage, orderErrorMessage, orderStatusErrorMessage, rewardErrorMessage, wishErrorMessage } from "./lib/errors";
import { appleAuthEnabled, cloudEnabled, getSupabase, phoneAuthEnabled, type SupabaseClient } from "./lib/supabase";
import {
  CHECKIN_REWARD,
  DEFAULT_PROFILE,
  STORAGE_KEYS,
  checkinsKey,
  claimsKey,
  loadCelebratedMilestones,
  loadCheckinDays,
  loadCoupleProfile,
  loadEconomyCoins,
  loadCustomItems,
  loadIdentity,
  loadLocalAnniversaries,
  loadLocalOrders,
  loadTaskClaims,
  pruneReminders,
  remindedKey,
  milestonesKey,
  walletKey,
} from "./lib/storage";
import { CUSTOM_CATEGORIES, CUSTOM_PRICE_RANGE, IDENTITIES, displayNameFor, partnerFor } from "./lib/types";
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
  PartnerStatus,
} from "./lib/types";
import { MemoriesScreen } from "./screens/MemoriesScreen";
import { MenuArt } from "./screens/MenuArt";
import { OnboardingSheet } from "./screens/OnboardingSheet";
import { OpeningProgress, type OpeningStep } from "./screens/OpeningProgress";
import { OrdersScreen } from "./screens/OrdersScreen";
import { OursScreen } from "./screens/OursScreen";
import { ShopScreen } from "./screens/ShopScreen";
import { TasksScreen } from "./screens/TasksScreen";

/** iOS only exposes `Notification` in a secure context on 16.4+. */
const notificationsSupported = typeof window !== "undefined" && "Notification" in window;

/**
 * Web Push needs a push service, not just permission. On iPhone Safari
 * `PushManager` does not exist until the site has been added to the Home
 * Screen, which is why "开启通知" has to come after "添加到主屏幕" — and why a
 * browser that will never have it must not be handed the step at all.
 */
const pushCapable = () =>
  notificationsSupported && typeof navigator !== "undefined"
  && "serviceWorker" in navigator && "PushManager" in window;

/** Installed to the Home Screen, where iOS finally allows push. */
const isInstalled = () =>
  typeof window !== "undefined"
  && (window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true);

/** Signed photo URLs live for an hour; re-sign once they get close to that. */
const SIGNED_URL_TTL_SECONDS = 3600;
const SIGNED_URL_REFRESH_MS = 45 * 60 * 1000;

/**
 * Coins, claims, check-in days and their owner move as one value. Check-in days
 * are personal — they pay into this identity's own wallet — so keeping them in a
 * separate state slot would reintroduce the half-applied identity switch.
 */
type Wallet = { owner: Identity | null; coins: number; claims: string[]; checkins: string[] };

const walletFor = (owner: Identity | null): Wallet => ({
  owner,
  coins: loadEconomyCoins(owner),
  claims: loadTaskClaims(owner),
  checkins: loadCheckinDays(owner),
});

/** Custom wishes carry no artwork, so the card tint is what distinguishes them. */
const CUSTOM_TINTS: Record<Category, string> = {
  food: "#fff0e5",
  care: "#ffe3ef",
  date: "#e5f6ee",
  limited: "#e1f3ff",
};

const customItemFrom = (row: { id: string; category: Category; name: string; description: string; price: number }): MenuItem => ({
  id: row.id,
  category: row.category,
  name: row.name,
  description: row.description,
  price: row.price,
  tint: CUSTOM_TINTS[row.category],
  custom: true,
});

type PushState = { permission: NotificationPermission | "unsupported"; subscribed: boolean };

const vapidPublicKey = () => (import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined) || undefined;

/** VAPID keys travel base64url; `atob` needs plain base64 with its padding. */
function applicationServerKey(key: string): Uint8Array<ArrayBuffer> {
  const padded = key + "=".repeat((4 - (key.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

async function saveSubscription(client: SupabaseClient, subscription: PushSubscription, coupleId: string, userId: string) {
  const json = subscription.toJSON();
  await client.from("push_subscriptions").upsert(
    { user_id: userId, couple_id: coupleId, endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    { onConflict: "endpoint" },
  );
}

/**
 * Picks up a subscription the worker rotated while no page was open: retire the
 * old row, record the new endpoint. The worker cannot do this itself — writing
 * to the couple's table needs a session it does not have.
 */
async function drainPushRotation(client: SupabaseClient, coupleId: string, userId: string) {
  const cache = await caches.open("couple-shop-push");
  const parked = await cache.match("/__push-rotation");
  if (!parked) return;
  const { old, next } = await parked.json() as { old: string | null; next: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } };
  if (old) await client.from("push_subscriptions").delete().eq("endpoint", old);
  if (next?.endpoint) {
    await client.from("push_subscriptions").upsert(
      { user_id: userId, couple_id: coupleId, endpoint: next.endpoint, p256dh: next.keys?.p256dh, auth: next.keys?.auth },
      { onConflict: "endpoint" },
    );
  }
  await cache.delete("/__push-rotation");
}

/** Drops this device's subscription, on the server and in the browser. */
async function dropSubscription(client: SupabaseClient | null) {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  // Delete only this endpoint: the same account may be signed in elsewhere.
  if (client) await client.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
  await subscription.unsubscribe().catch(() => undefined);
}

/**
 * Title, subtitle and primary button for the account sheet, from one place.
 * They used to be three separate ternaries down the JSX, which is how an
 * anonymous upgrade ended up calling itself 升级账户 on the tab, 创建正式账户 in
 * the title and 保护现有数据 on the button — and how 找回账户 kept a subtitle
 * about not relying on anonymous accounts.
 */
function authSheetCopy(mode: AuthMode, upgrading: boolean, otpSent: boolean) {
  switch (mode) {
    case "recover":
      return { title: "找回账户", description: "输入注册邮箱，我们发一封重置邮件给你", primary: "发送重置邮件" };
    case "new-password":
      return { title: "设置新密码", description: "设好之后用新密码登录即可", primary: "保存新密码" };
    case "phone":
      return {
        title: "手机号登录",
        description: otpSent ? "验证码已发送，填进来就能登录" : "收到短信验证码后即可登录",
        primary: otpSent ? "验证并登录" : "发送验证码",
      };
    case "signup":
      return upgrading
        ? { title: "升级账户", description: "现在的订单、任务和回忆都会保留，换手机也能登录回来", primary: "升级并保留数据" }
        : { title: "注册账户", description: "注册后换手机登录即可回到这间小铺", primary: "注册账户" };
    default:
      // Not just "登录": the tab above it already says that, and two controls
      // with the same word is the kind of thing this table exists to prevent.
      return { title: "登录账户", description: "用注册过的邮箱登录，回到你们的小铺", primary: "登录并进入小铺" };
  }
}

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
  // Fixed bottom chrome has to ride the keyboard, per the runtime contract:
  // pinned to the safe area alone it sits *behind* the keyboard, which left the
  // tab bar unreachable — and with it every way off the page.
  const { bottomInset } = useKeyboardInsets();
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(loadIdentity);
  const [profile, setProfile] = useState<CoupleProfile>(loadCoupleProfile);
  const [profileDraft, setProfileDraft] = useState<CoupleProfile>(loadCoupleProfile);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [view, setView] = useState<MainView>("shop");
  const [category, setCategory] = useState<Category>("food");
  const [orders, setOrders] = useState<Order[]>(loadLocalOrders);
  const [wallet, setWallet] = useState<Wallet>(() => walletFor(loadIdentity()));
  const coins = wallet.coins;
  const claimedTasks = wallet.claims;
  const setCoins = useCallback((next: number | ((current: number) => number)) => {
    setWallet((current) => ({ ...current, coins: typeof next === "function" ? next(current.coins) : next }));
  }, []);
  const setClaimedTasks = useCallback((next: string[] | ((current: string[]) => string[])) => {
    setWallet((current) => ({ ...current, claims: typeof next === "function" ? next(current.claims) : next }));
  }, []);
  const [customItems, setCustomItems] = useState<MenuItem[]>(loadCustomItems);
  const [wishOpen, setWishOpen] = useState(false);
  const [wishDraft, setWishDraft] = useState<{ name: string; description: string; price: string; category: Category }>(
    { name: "", description: "", price: "48", category: "food" },
  );
  const [editingWishId, setEditingWishId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [note, setNote] = useState("");
  const [time, setTime] = useState<string>(DESIRED_TIMES[0]);
  const [focusOrderId, setFocusOrderId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // `subscribed` means this device really can be pushed to: a browser
  // subscription exists *and* the couple's table has a row for it. Permission
  // alone was what let the settings row claim "订单不会错过" on a device with
  // no subscription at all.
  const [pushState, setPushState] = useState<PushState>(() => ({
    permission: notificationsSupported ? Notification.permission : "unsupported",
    subscribed: false,
  }));
  const [pushRotation, setPushRotation] = useState(0);
  const [installed, setInstalled] = useState(isInstalled);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
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
  // An anonymous account being upgraded keeps its data; a brand new one has none.
  const upgradingAnonymous = Boolean(authUser?.is_anonymous);
  const protectedAccount = Boolean(authUser && !authUser.is_anonymous);
  const authCopy = authSheetCopy(authMode, upgradingAnonymous, phoneOtpSent);
  const [authBusy, setAuthBusy] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(
    () => localStorage.getItem(STORAGE_KEYS.privacyAccepted) === "1",
  );
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [dangerConfirm, setDangerConfirm] = useState<"leave" | "delete" | null>(null);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [anniversaries, setAnniversaries] = useState<Anniversary[]>(loadLocalAnniversaries);
  const [checkin, setCheckin] = useState<CheckinStatus>({ streak: 0, checkedToday: false });
  const [partner, setPartner] = useState<PartnerStatus | null>(null);
  const [partnerRefresh, setPartnerRefresh] = useState(0);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryCaption, setMemoryCaption] = useState("");
  const [memoryDate, setMemoryDate] = useState(todayKey());
  const [memoryFile, setMemoryFile] = useState<File | null>(null);
  // Set while the memory sheet edits an existing entry instead of adding one.
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [memoryDetail, setMemoryDetail] = useState<MemoryEntry | null>(null);
  const [anniversaryOpen, setAnniversaryOpen] = useState(false);
  const [anniversaryTitle, setAnniversaryTitle] = useState("");
  const [anniversaryDate, setAnniversaryDate] = useState(todayKey());
  const [anniversaryRepeats, setAnniversaryRepeats] = useState(true);
  const [anniversaryReminder, setAnniversaryReminder] = useState(3);
  const [editingAnniversaryId, setEditingAnniversaryId] = useState<string | null>(null);
  // Deleting a memory or an anniversary is not undoable and not synced back, so
  // both ask once inside the sheet that is already open.
  const [confirmDelete, setConfirmDelete] = useState<"memory" | "anniversary" | "wish" | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [openingDismissed, setOpeningDismissed] = useState(
    () => localStorage.getItem(STORAGE_KEYS.openingDismissed) === "1",
  );
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
    // Declining or withdrawing releases the coupon; anything else holds it.
    const released = new Set<OrderStatus>(["rejected", "cancelled"]);
    return [...new Set(orders.filter((order) => !released.has(order.status) && limited.has(order.itemId)).map((order) => order.itemId))];
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
  const closeWish = () => { keyboard.hide(); setWishOpen(false); setEditingWishId(null); setConfirmDelete(null); };
  const closeMemory = () => { keyboard.hide(); setMemoryOpen(false); setEditingMemoryId(null); };
  const closeMemoryDetail = () => { setMemoryDetail(null); setConfirmDelete(null); };
  const closeAnniversary = () => { keyboard.hide(); setAnniversaryOpen(false); setEditingAnniversaryId(null); setConfirmDelete(null); };

  const openAddMemory = () => {
    setEditingMemoryId(null);
    setMemoryCaption("");
    setMemoryDate(todayKey());
    setMemoryFile(null);
    setMemoryOpen(true);
  };
  /** Turns a finished wish into the start of a photo memory. */
  const keepOrderAsMemory = (order: Order) => {
    if (!cloudCoupleId) return requirePairedForPhotos();
    setEditingMemoryId(null);
    setMemoryCaption(order.itemName);
    setMemoryDate(dayKeyOf(order.completedAt ?? order.createdAt) ?? todayKey());
    setMemoryFile(null);
    setMemoryOpen(true);
  };

  const openEditMemory = (memory: MemoryEntry) => {
    setEditingMemoryId(memory.id);
    setMemoryCaption(memory.caption);
    setMemoryDate(memory.happenedOn);
    setMemoryFile(null);
    setMemoryDetail(null);
    setMemoryOpen(true);
  };
  const openAddAnniversary = () => {
    setEditingAnniversaryId(null);
    setAnniversaryTitle("");
    setAnniversaryDate(todayKey());
    setAnniversaryRepeats(true);
    setAnniversaryReminder(3);
    setAnniversaryOpen(true);
  };
  const openEditAnniversary = (item: Anniversary) => {
    setEditingAnniversaryId(item.id);
    setAnniversaryTitle(item.title);
    setAnniversaryDate(item.eventDate);
    setAnniversaryRepeats(item.repeatsYearly);
    setAnniversaryReminder(item.reminderDays);
    setAnniversaryOpen(true);
  };

  const finishOnboarding = (goToTasks: boolean) => {
    localStorage.setItem(STORAGE_KEYS.onboarded, "1");
    setOnboardingOpen(false);
    if (goToTasks) setView("tasks");
  };

  const chooseIdentity = useCallback((nextIdentity: Identity) => {
    localStorage.setItem(STORAGE_KEYS.identity, nextIdentity);
    setIdentity(nextIdentity);
  }, []);

  useEffect(() => {
    const pending = getSupabase();
    if (pending) pending.then(setSupabase).catch(() => showToast("云服务加载失败，已切换到本地模式"));
  }, [showToast]);

  /** Invokes the push function and reports what actually happened, or null. */
  const notifyPartner = useCallback(async (client: SupabaseClient, orderId: string, event: string) => {
    const { data, error } = await client.functions.invoke("notify-partner", { body: { orderId, event } });
    if (error || !data) return null;
    return data as { subscribed: number; delivered: number; pruned: number };
  }, []);

  // Keeps `subscribed` honest, and finishes the job when the user allowed
  // notifications before pairing — the subscription needs a couple to belong to,
  // so back then it was silently skipped and never retried.
  useEffect(() => {
    if (pushState.permission !== "granted" || !("serviceWorker" in navigator)) return;
    let active = true;
    void (async () => {
      // Not `.ready`: the worker is only registered in PROD, so that promise
      // never settles in dev or under Playwright.
      const registration = await navigator.serviceWorker.getRegistration();
      const client = cloudCoupleId ? await getSupabase() : null;
      if (!active || !registration) return;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription && client && cloudCoupleId && authUser && vapidPublicKey()) {
        subscription = await registration.pushManager
          .subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(vapidPublicKey()!) })
          .catch(() => null);
      }
      if (!active) return;
      if (!subscription || !client || !cloudCoupleId || !authUser) {
        setPushState((current) => (current.subscribed ? { ...current, subscribed: false } : current));
        return;
      }
      await drainPushRotation(client, cloudCoupleId, authUser.id).catch(() => undefined);
      await saveSubscription(client, subscription, cloudCoupleId, authUser.id);
      if (active) setPushState((current) => (current.subscribed ? current : { ...current, subscribed: true }));
    })();
    return () => { active = false; };
  }, [pushState.permission, cloudCoupleId, authUser, pushRotation]);

  // The worker tells every open page when the push service rotated the endpoint.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "push-subscription-changed") setPushRotation((count) => count + 1);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  // Opening the guide during the first render would portal it outside the phone
  // frame: the screen element a sheet mounts into only exists after that first
  // commit. Waiting for an identity is also what makes the copy addressable.
  useEffect(() => {
    if (!identity || localStorage.getItem(STORAGE_KEYS.onboarded) === "1") return;
    setOnboardingOpen(true);
  }, [identity]);

  /**
   * Local mode keeps both identities on one device, so the partner's week is
   * simply their own storage keys — no server needed, and the card behaves
   * exactly as it does in the cloud. `wallet` is in the dependencies because
   * every local earn writes through it, which is the cue to recount.
   */
  useEffect(() => {
    if (cloudCoupleId) return;
    if (!partnerIdentity || !partnerName) return setPartner(null);
    const days = loadCheckinDays(partnerIdentity);
    setPartner({
      displayName: partnerName,
      streak: checkinStreak(days),
      earnedThisWeek: earnedInWeek(loadTaskClaims(partnerIdentity)),
      checkedToday: days.includes(todayKey()),
    });
  }, [cloudCoupleId, partnerIdentity, partnerName, wallet, partnerRefresh]);

  /**
   * Celebrate a milestone the first time this person crosses it, then remember
   * it so a reload is not another party. Kept per identity like the wallet:
   * on a shared device, 二宝 should still get their own moment.
   *
   * Nothing here grants coins — it is a congratulation, so localStorage is the
   * honest place for it even in cloud mode.
   */
  useEffect(() => {
    if (!identity) return;
    const counts = {
      days: relationshipDays(profile.startedOn),
      wishes: orders.filter((order) => order.status === "done").length,
      streak: cloudCoupleId ? checkin.streak : checkinStatusFrom(wallet.checkins).streak,
    };
    const celebrated = loadCelebratedMilestones(identity);
    const fresh = reachedMilestones(counts).filter((milestone) => !celebrated.includes(milestone.id));
    if (fresh.length === 0) return;
    // Several can land at once on a first run; the newest is the one to show.
    const newest = fresh[fresh.length - 1];
    localStorage.setItem(milestonesKey(identity), JSON.stringify([...celebrated, ...fresh.map((item) => item.id)]));
    showToast(`🎉 ${newest.title}`);
  }, [identity, profile.startedOn, orders, checkin.streak, wallet.checkins, cloudCoupleId, showToast]);

  /**
   * The keyboard covers about 40% of the screen, including the bottom
   * navigation, and the runtime only lowers it when something asks. Sheets
   * already do on close; a field that lives on a page — the pairing code — had
   * nothing, so tapping elsewhere left the keyboard up with the nav behind it.
   *
   * Changing page puts it away too, which covers every route in: the tab bar,
   * the bell, deep links and the buttons that jump between screens.
   */
  useEffect(() => {
    keyboard.hide();
    // `hide` is rebuilt on every keyboard state change; depending on it here
    // would re-run this on the keyboard's own updates rather than on the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const dismissKeyboardOnOutsideTap = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!keyboard.visible) return;
    if ((event.target as HTMLElement).closest("input, textarea")) return;
    keyboard.hide();
  }, [keyboard]);

  useEffect(() => {
    const recheck = () => setInstalled(isInstalled());
    const media = window.matchMedia("(display-mode: standalone)");
    media.addEventListener("change", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      media.removeEventListener("change", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, []);

  useEffect(() => {
    const { view: deepView, orderId } = readDeepLink();
    if (!deepView && !orderId) return;
    setView(deepView ?? "orders");
    // The order may not have loaded from the cloud yet, so hold the id until
    // the list can act on it rather than dropping it here.
    if (orderId) setFocusOrderId(orderId);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  // A stale focus must not fire minutes later when the tab comes back. Only on
  // an actual departure: on mount `view` is still "shop" while the deep-link
  // effect above is switching it, which would clear the id before it is used.
  const previousView = useRef(view);
  useEffect(() => {
    if (previousView.current === "orders" && view !== "orders") setFocusOrderId(null);
    previousView.current = view;
  }, [view]);

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

  // Switching identity on this device swaps to that person's wallet.
  useEffect(() => {
    if (!identity || cloudCoupleId) return;
    setWallet((current) => (current.owner === identity ? current : walletFor(identity)));
  }, [identity, cloudCoupleId]);

  useEffect(() => {
    const channel = new BroadcastChannel("couple-order-shop");
    broadcastChannel.current = channel;
    channel.onmessage = (event) => {
      if (!cloudCoupleId && event.data?.type === "sync") {
        applyingBroadcast.current = true;
        setOrders(event.data.orders);
        if (event.data.profile) setProfile(event.data.profile);
        if (event.data.customItems) setCustomItems(event.data.customItems);
        // Anniversaries belong to the couple, so both identities take them.
        if (event.data.anniversaries) setAnniversaries(event.data.anniversaries);
        // A wallet only ever accepts an update addressed to its own owner.
        if (event.data.walletOwner && event.data.walletOwner !== identity) setPartnerRefresh((count) => count + 1);
        if (event.data.walletOwner && event.data.walletOwner === identity) {
          setWallet((current) => (current.owner === identity
            ? {
              ...current,
              coins: event.data.coins,
              claims: event.data.claimedTasks ?? current.claims,
              checkins: event.data.checkins ?? current.checkins,
            }
            : current));
        }
      }
    };
    // Only in a real build: the worker caches by URL, and Vite's dev module
    // URLs are unhashed, so registering it in dev serves yesterday's code.
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    return () => {
      broadcastChannel.current = null;
      channel.close();
    };
  }, [cloudCoupleId, identity, setCoins, setClaimedTasks]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(orders));
    // In cloud mode the custom menu belongs to the server; writing it here would
    // leak one couple's wishes into this device's local-only shop.
    if (!cloudCoupleId) {
      localStorage.setItem(STORAGE_KEYS.customItems, JSON.stringify(customItems));
      localStorage.setItem(STORAGE_KEYS.anniversaries, JSON.stringify(anniversaries));
    }
    if (wallet.owner && !cloudCoupleId) {
      localStorage.setItem(walletKey(wallet.owner), String(wallet.coins));
      localStorage.setItem(claimsKey(wallet.owner), JSON.stringify(wallet.claims));
      localStorage.setItem(checkinsKey(wallet.owner), JSON.stringify(wallet.checkins));
    }
    if (applyingBroadcast.current) {
      applyingBroadcast.current = false;
      return;
    }
    if (!cloudCoupleId) {
      broadcastChannel.current?.postMessage({
        type: "sync",
        orders,
        profile,
        customItems,
        anniversaries,
        walletOwner: wallet.owner,
        coins: wallet.coins,
        claimedTasks: wallet.claims,
        checkins: wallet.checkins,
      });
    }
  }, [orders, wallet, profile, customItems, anniversaries, cloudCoupleId]);

  const signMemoryRows = useCallback(async (
    client: SupabaseClient,
    rows: Array<{ id: string; caption: string; happened_on: string; image_path: string | null; created_at: string; created_by: string }>,
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
      createdBy: row.created_by,
    }));
  }, []);

  const loadMemories = useCallback(async (client: SupabaseClient, coupleId: string) => {
    const { data } = await client
      .from("memory_entries")
      .select("id, caption, happened_on, image_path, created_at, created_by")
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
      itemCategory: row.item_category ?? undefined,
      image: row.image_url ?? undefined,
      price: row.price,
      note: row.note ?? "",
      createdAt: row.created_at,
      desiredTime: row.desired_time,
      status: row.status,
      from: row.from_name,
      to: row.to_name,
      createdBy: row.created_by,
      completedAt: row.completed_at ?? undefined,
      declineNote: row.decline_note ?? undefined,
    })));
  }, []);

  /** Wallets are personal, so the balance lives on this user's profile row. */
  const loadMyBalance = useCallback(async (client: SupabaseClient) => {
    const { data } = await client.from("profiles").select("coin_balance").maybeSingle();
    if (typeof data?.coin_balance === "number") setCoins(data.coin_balance);
  }, [setCoins]);

  /**
   * The one view across the couple boundary. It is a function call rather than a
   * `profiles` select on purpose: that table's policy only exposes your own row
   * because the wallet lives there, and this returns no balance.
   */
  const loadPartnerStatus = useCallback(async (client: SupabaseClient) => {
    const { data } = await client.rpc("get_partner_status").maybeSingle();
    if (!data) return setPartner(null);
    const row = data as { display_name: string; streak: number; earned_this_week: number; checked_today: boolean };
    setPartner({
      displayName: row.display_name,
      streak: row.streak,
      earnedThisWeek: row.earned_this_week,
      checkedToday: row.checked_today,
    });
  }, []);

  const loadCouple = useCallback(async (client: SupabaseClient, coupleId: string) => {
    const { data } = await client
      .from("couples")
      .select("name, partner_a_name, partner_b_name, started_on")
      .eq("id", coupleId)
      .maybeSingle();
    if (!data) return;
    setProfile({
      shopName: data.name || DEFAULT_PROFILE.shopName,
      firstName: data.partner_a_name || DEFAULT_PROFILE.firstName,
      secondName: data.partner_b_name || DEFAULT_PROFILE.secondName,
      startedOn: data.started_on || DEFAULT_PROFILE.startedOn,
    });
  }, []);

  const loadCustomWishes = useCallback(async (client: SupabaseClient, coupleId: string) => {
    const { data } = await client
      .from("custom_menu_items")
      .select("id, category, name, description, price")
      .eq("couple_id", coupleId)
      .order("created_at");
    if (data) setCustomItems(data.map(customItemFrom));
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
        loadMyBalance(client),
        loadMemories(client, coupleId),
        loadAnniversaries(client, coupleId),
        loadCustomWishes(client, coupleId),
        loadPartnerStatus(client),
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
      // An order event is also how a sender learns a decline refunded them.
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `couple_id=eq.${coupleId}` }, () => {
        void loadOrders(client, coupleId);
        void loadMyBalance(client);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "custom_menu_items", filter: `couple_id=eq.${coupleId}` }, () => {
        void loadCustomWishes(client, coupleId);
      })
      // Either table moving means the other person did something worth showing.
      .on("postgres_changes", { event: "*", schema: "public", table: "task_claims", filter: `couple_id=eq.${coupleId}` }, () => {
        void loadPartnerStatus(client);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_checkins", filter: `couple_id=eq.${coupleId}` }, () => {
        void loadPartnerStatus(client);
      })
      .subscribe();
    return () => {
      active = false;
      client.removeChannel(channel);
    };
  }, [supabase, cloudCoupleId, authUser, loadOrders, loadCouple, loadMyBalance, loadMemories, loadAnniversaries, loadCustomWishes, loadPartnerStatus, setClaimedTasks]);

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

  // Every anniversary inside its own window is announced, not just the soonest.
  // The dependency is a signature rather than the array: `loadAnniversaries`
  // builds a fresh one on every realtime event, which used to re-arm the timer.
  const dueSignature = dueAnniversaries(anniversaries).map((entry) => `${entry.item.id}:${entry.days}`).join("|");
  const anniversariesRef = useRef(anniversaries);
  anniversariesRef.current = anniversaries;

  useEffect(() => {
    if (!dueSignature) return;
    pruneReminders();
    const today = todayKey();
    const pending = dueAnniversaries(anniversariesRef.current)
      .filter((entry) => !localStorage.getItem(remindedKey(entry.item.id, today)));
    if (pending.length === 0) return;
    const describe = (entry: { item: Anniversary; days: number }) =>
      (entry.days === 0 ? `今天是「${entry.item.title}」` : `「${entry.item.title}」还有 ${entry.days} 天`);
    const timer = window.setTimeout(() => {
      const headline = pending.slice(0, 2).map(describe).join("；");
      showToast(pending.length > 2 ? `${headline}，等 ${pending.length} 个纪念日` : headline);
      for (const entry of pending) {
        // Marked only once the reminder has actually gone out: writing the key
        // up front meant any re-render inside the delay ate it for the day.
        localStorage.setItem(remindedKey(entry.item.id, today), "1");
        if (notificationsSupported && Notification.permission === "granted" && "serviceWorker" in navigator) {
          void navigator.serviceWorker.getRegistration()
            .then((registration) => registration?.showNotification("纪念日提醒 💕", {
              body: describe(entry),
              icon: "/assets/app-icon.png",
              tag: `anniversary:${entry.item.id}`,
            }))
            .catch(() => undefined);
        }
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [dueSignature, showToast]);

  const clearCloudLocalState = () => {
    localStorage.removeItem(STORAGE_KEYS.cloudId);
    localStorage.removeItem(STORAGE_KEYS.inviteCode);
    localStorage.removeItem(STORAGE_KEYS.orders);
    setCloudCoupleId(null);
    setInviteCode(null);
    setOrders([]);
    // Back to local mode: fall back to this identity's on-device wallet.
    setWallet(walletFor(identity));
    setMemories([]);
    setAnniversaries(loadLocalAnniversaries());
    setCustomItems(loadCustomItems());
    setCheckin({ streak: 0, checkedToday: false });
    setPushState((current) => ({ ...current, subscribed: false }));
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
    // Before signing out, while the session can still delete the row: otherwise
    // this phone keeps receiving that couple's pushes forever.
    await dropSubscription(client);
    await client.auth.signOut();
    clearCloudLocalState();
    closeAuth();
    showToast("已安全退出，这台手机的同步缓存已清理");
  };

  const exportData = async () => {
    try {
      // Both wallets, not just the one in use: the other identity's balance and
      // claims live on this device too, and the couple's own wishes are the
      // only content a local-only shop has beyond its orders.
      let payload: Record<string, unknown> = {
        exportedAt: new Date().toISOString(),
        formatVersion: 3,
        profile,
        identity,
        orders,
        customItems,
        memories,
        anniversaries,
        wallets: IDENTITIES.map((who) => ({
          identity: who,
          coins: who === wallet.owner ? wallet.coins : loadEconomyCoins(who),
          claimedTasks: who === wallet.owner ? wallet.claims : loadTaskClaims(who),
          checkins: who === wallet.owner ? wallet.checkins : loadCheckinDays(who),
        })),
      };
      const client = cloudCoupleId ? await getSupabase() : null;
      if (client && cloudCoupleId) {
        const [coupleData, walletData, orderData, taskData, memoryData, anniversaryData, checkinData, auditData] = await Promise.all([
          client.from("couples").select("name, partner_a_name, partner_b_name, started_on, created_at").eq("id", cloudCoupleId).maybeSingle(),
          client.from("profiles").select("display_name, coin_balance, created_at").maybeSingle(),
          client.from("orders").select("*").eq("couple_id", cloudCoupleId),
          client.from("task_claims").select("task_id, period_key, reward, created_at").eq("couple_id", cloudCoupleId),
          client.from("memory_entries").select("caption, happened_on, image_path, created_at").eq("couple_id", cloudCoupleId),
          client.from("anniversaries").select("title, event_date, repeats_yearly, reminder_days").eq("couple_id", cloudCoupleId),
          client.from("daily_checkins").select("checked_on, reward, created_at").eq("couple_id", cloudCoupleId),
          client.from("audit_logs").select("action, metadata, created_at").eq("couple_id", cloudCoupleId).order("created_at", { ascending: false }).limit(500),
        ]);
        payload = {
          exportedAt: new Date().toISOString(),
          formatVersion: 3,
          couple: coupleData.data,
          customItems,
          myWallet: walletData.data,
          orders: orderData.data,
          taskClaims: taskData.data,
          memories: memoryData.data,
          anniversaries: anniversaryData.data,
          checkins: checkinData.data,
          auditLog: auditData.data,
        };
      }
      const file = new File([JSON.stringify(payload, null, 2)], `情侣小铺数据-${todayKey()}.json`, { type: "application/json" });
      const shareNavigator = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (navigator.share && shareNavigator.canShare?.({ files: [file] })) await navigator.share({ title: "情侣小铺数据导出", files: [file] });
      else {
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      showToast("数据已导出（照片只含引用路径）");
    } catch {
      showToast("导出失败，请稍后再试");
    }
  };

  const confirmDangerAction = async () => {
    const client = await getSupabase();
    if (!client || !dangerConfirm) return;
    setCloudBusy(true);
    try {
      // The RPCs delete the server rows; the browser subscription is ours to
      // retire, or it would re-attach to whatever couple comes next.
      await dropSubscription(client);
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
    // A local shop keeps its own streak: the reward is this identity's own coin,
    // and there is no server involved in either mode's arithmetic.
    if (!cloudCoupleId) {
      if (!identity) return;
      const today = todayKey();
      if (wallet.checkins.includes(today)) return showToast("今天已经签过到啦");
      const days = [today, ...wallet.checkins];
      setWallet((current) => (current.owner === identity
        ? { ...current, coins: current.coins + CHECKIN_REWARD, checkins: days }
        : current));
      return showToast(`连续签到 ${checkinStreak(days)} 天，甜心币 +${CHECKIN_REWARD}`);
    }
    const client = await getSupabase();
    // cloudCoupleId is read from localStorage synchronously while the session is
    // still being restored, so authUser can legitimately be null for a moment.
    if (!client || !authUser) return showToast("正在恢复登录状态，请稍后再试");
    const { data, error } = await client.rpc("daily_checkin").single();
    if (error) return showToast(rewardErrorMessage(error.message, "今天已经签过到啦"));
    const result = data as { coin_balance: number; streak: number; reward: number };
    setCoins(result.coin_balance);
    setCheckin({ streak: result.streak, checkedToday: true });
    showToast(`连续签到 ${result.streak} 天，甜心币 +${result.reward}`);
  };

  const requirePairedForPhotos = (): boolean => {
    // The album is the one feature a local shop genuinely cannot have; point at
    // the fix instead of at a login form that may not even be configured.
    setMemoryOpen(false);
    setView("ours");
    showToast("照片回忆需要先连接双人小铺");
    return false;
  };

  const saveMemory = async () => {
    const client = cloudCoupleId ? await getSupabase() : null;
    if (!client || !cloudCoupleId || !authUser) return requirePairedForPhotos();
    if (!memoryCaption.trim()) return showToast("写一句这张照片的故事吧");
    if (!isValidDateKey(memoryDate) || memoryDate > todayKey()) return showToast("回忆日期不能晚于今天");
    if (editingMemoryId) {
      const caption = memoryCaption.trim();
      setCloudBusy(true);
      // RLS filters rather than fails, so an empty result means the row belongs
      // to the other partner and only they may rewrite it.
      const { data, error } = await client
        .from("memory_entries")
        .update({ caption, happened_on: memoryDate })
        .eq("id", editingMemoryId)
        .select("id");
      setCloudBusy(false);
      if (error) return showToast("保存失败，请稍后再试");
      if (!data?.length) return showToast("只能修改自己上传的回忆");
      setMemories((current) => current.map((item) => (item.id === editingMemoryId ? { ...item, caption, happenedOn: memoryDate } : item)));
      closeMemory();
      return showToast("回忆已更新");
    }
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
      setMemories((current) => [{ id, caption: memoryCaption.trim(), happenedOn: memoryDate, imagePath, imageUrl, createdAt: new Date().toISOString(), createdBy: authUser.id }, ...current]);
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

  const deleteMemory = async (memory: MemoryEntry) => {
    const client = cloudCoupleId ? await getSupabase() : null;
    if (!client || !authUser) return requirePairedForPhotos();
    setCloudBusy(true);
    const { data, error } = await client.from("memory_entries").delete().eq("id", memory.id).select("id");
    setCloudBusy(false);
    if (error) return showToast("删除失败，请稍后再试");
    if (!data?.length) return showToast("只能删除自己上传的回忆");
    // The row is already gone, so a failed object removal must not read as a
    // failed delete; the orphaned file is cleaned up by storage retention.
    if (memory.imagePath) await client.storage.from("memory-photos").remove([memory.imagePath]);
    setMemories((current) => current.filter((item) => item.id !== memory.id));
    closeMemoryDetail();
    showToast("这份回忆已删除");
  };

  const anniversaryFields = () => ({
    title: anniversaryTitle.trim(),
    event_date: anniversaryDate,
    repeats_yearly: anniversaryRepeats,
    reminder_days: anniversaryReminder,
  });

  const saveAnniversary = async () => {
    const title = anniversaryTitle.trim();
    if (!title) return showToast("请填写纪念日名称");
    if (!isValidDateKey(anniversaryDate)) return showToast("请填写正确日期");
    if (cloudCoupleId && !authUser) return showToast("正在恢复登录状态，请稍后再试");
    const entry: Anniversary = { id: editingAnniversaryId ?? newId(), title, eventDate: anniversaryDate, repeatsYearly: anniversaryRepeats, reminderDays: anniversaryReminder };
    const client = cloudCoupleId ? await getSupabase() : null;
    if (client && cloudCoupleId && authUser) {
      setCloudBusy(true);
      const { error } = editingAnniversaryId
        ? await client.from("anniversaries").update(anniversaryFields()).eq("id", editingAnniversaryId)
        : await client.from("anniversaries").insert({ id: entry.id, couple_id: cloudCoupleId, created_by: authUser.id, ...anniversaryFields() });
      setCloudBusy(false);
      if (error) return showToast("保存失败，请稍后再试");
    }
    setAnniversaries((current) => (editingAnniversaryId
      ? current.map((item) => (item.id === entry.id ? entry : item))
      : [...current, entry]));
    const wasEditing = Boolean(editingAnniversaryId);
    closeAnniversary();
    if (wasEditing) return showToast("纪念日已更新");
    showToast(entry.reminderDays > 0 ? `纪念日已保存，将提前 ${entry.reminderDays} 天提醒` : "纪念日已保存，当天提醒");
  };

  const deleteAnniversary = async () => {
    if (!editingAnniversaryId) return;
    const id = editingAnniversaryId;
    const client = cloudCoupleId ? await getSupabase() : null;
    if (client) {
      setCloudBusy(true);
      const { error } = await client.from("anniversaries").delete().eq("id", id);
      setCloudBusy(false);
      if (error) return showToast("删除失败，请稍后再试");
    }
    setAnniversaries((current) => current.filter((item) => item.id !== id));
    closeAnniversary();
    showToast("纪念日已删除");
  };

  const openAddWish = () => {
    setEditingWishId(null);
    setWishDraft({ name: "", description: "", price: "48", category: category === "limited" ? "food" : category });
    setWishOpen(true);
  };

  const openEditWish = (item: MenuItem) => {
    setEditingWishId(item.id);
    setWishDraft({ name: item.name, description: item.description, price: String(item.price), category: item.category });
    setWishOpen(true);
  };

  const saveWish = async () => {
    const name = wishDraft.name.trim();
    const description = wishDraft.description.trim();
    const price = Number(wishDraft.price);
    if (!name) return showToast("给这个心愿起个名字吧");
    if (name.length > 20) return showToast("名字最多 20 个字");
    if (description.length > 40) return showToast("一句话介绍最多 40 个字");
    if (!Number.isInteger(price) || price < CUSTOM_PRICE_RANGE.min || price > CUSTOM_PRICE_RANGE.max) {
      return showToast(`价格请填 ${CUSTOM_PRICE_RANGE.min}–${CUSTOM_PRICE_RANGE.max} 之间的整数`);
    }
    const entry = customItemFrom({ id: editingWishId ?? newId(), category: wishDraft.category, name, description, price });
    const client = cloudCoupleId ? await getSupabase() : null;
    if (client && cloudCoupleId && authUser) {
      setCloudBusy(true);
      const fields = { category: entry.category, name, description, price };
      const { error } = editingWishId
        ? await client.from("custom_menu_items").update(fields).eq("id", editingWishId)
        : await client.from("custom_menu_items").insert({ id: entry.id, couple_id: cloudCoupleId, created_by: authUser.id, ...fields });
      setCloudBusy(false);
      if (error) return showToast(wishErrorMessage(error.message));
    }
    setCustomItems((current) => (editingWishId
      ? current.map((item) => (item.id === entry.id ? entry : item))
      : [...current, entry]));
    setCategory(entry.category);
    closeWish();
    showToast(editingWishId ? "心愿已更新" : `「${name}」已经上架你们的小铺`);
  };

  const deleteWish = async () => {
    if (!editingWishId) return;
    const client = cloudCoupleId ? await getSupabase() : null;
    if (client) {
      setCloudBusy(true);
      const { error } = await client.from("custom_menu_items").delete().eq("id", editingWishId);
      setCloudBusy(false);
      if (error) return showToast("删除失败，请稍后再试");
    }
    // Orders already placed keep their own name, price and category, so taking
    // a wish off the menu never rewrites what has already happened.
    setCustomItems((current) => current.filter((item) => item.id !== editingWishId));
    closeWish();
    showToast("这个心愿已经下架");
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
    // Whichever category is open, not only 点吃的: the other three had no
    // randomiser at all, which is where choosing gets hardest.
    const pool = [...customItems, ...MENU].filter((item) => item.category === category && !usedLimitedIds.includes(item.id));
    if (pool.length === 0) return showToast("这个分类已经没有可选的了");
    const item = pool[Math.floor(Math.random() * pool.length)];
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
      itemCategory: selected.category,
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
      setTime(DESIRED_TIMES[0]);
      // Say only what is true right now; upgrade the wording once the push has
      // actually been handed over. This used to claim delivery beforehand and
      // then discard the invoke's error entirely.
      showToast("下单成功，已记在小铺里");
      const notice = await notifyPartner(client, order.id, "order.created");
      if (notice && notice.delivered > 0) showToast(`下单成功，已提醒${partnerName}`);
      else if (notice && notice.subscribed === 0) showToast(`${partnerName}还没开启通知，打开小铺时会看到`);
      return;
    }
    if (usedLimitedIds.includes(selected.id)) return showToast("这张限定券已经用过了");
    if (coins < selected.price) return showToast("甜心币不够啦");
    setOrders((current) => [order, ...current]);
    setCoins((current) => current - selected.price);
    closeOrderSheet();
    setNote("");
    setTime(DESIRED_TIMES[0]);
    showToast("下单成功，已记在小铺里");
  };

  /** Refunds the payer in local mode; the payer may be the other identity. */
  const refundLocally = (target: Order) => {
    const payer = target.from === currentName ? identity : partnerIdentity;
    if (payer && payer === wallet.owner) setCoins((current) => current + target.price);
    else if (payer) localStorage.setItem(walletKey(payer), String(loadEconomyCoins(payer) + target.price));
  };

  const cancelOrder = async (id: string) => {
    const target = orders.find((order) => order.id === id);
    if (!target || target.status !== "pending") return;
    const client = cloudCoupleId ? await getSupabase() : null;
    if (client) {
      const { data, error } = await client.rpc("cancel_couple_order", { p_order_id: id }).single();
      if (error) return showToast(orderStatusErrorMessage(error.message));
      const result = data as { coin_balance: number } | null;
      if (typeof result?.coin_balance === "number") setCoins(result.coin_balance);
      void notifyPartner(client, id, "order.cancelled");
    } else {
      refundLocally(target);
    }
    setOrders((current) => current.map((order) => (order.id === id ? { ...order, status: "cancelled" } : order)));
    showToast(`已撤回，${target.price} 甜心币退回给你`);
  };

  const updateStatus = async (id: string, status: OrderStatus, note?: string) => {
    const target = orders.find((order) => order.id === id);
    const client = cloudCoupleId ? await getSupabase() : null;
    if (client) {
      const { data, error } = await client.rpc("update_order_status", { p_order_id: id, p_status: status, p_note: note ?? null }).single();
      if (error) return showToast(orderStatusErrorMessage(error.message));
      const result = data as { coin_balance: number } | null;
      if (typeof result?.coin_balance === "number") setCoins(result.coin_balance);
      // The sender is the one who needs to hear this; this device says nothing
      // about it, because the notification lands on the other phone.
      void notifyPartner(client, id, `order.${status}`);
    } else if (status === "rejected" && target) {
      // Local mode has no server to refund with.
      refundLocally(target);
    }
    // Local mode has no server to stamp the completion, and the weekly task and
    // the monthly count both read it.
    const completedAt = status === "done" ? new Date().toISOString() : undefined;
    setOrders((current) => current.map((order) => (order.id === id
      ? { ...order, status, completedAt: completedAt ?? order.completedAt, declineNote: status === "rejected" ? note : order.declineNote }
      : order)));
    if (status === "rejected") showToast(`已婉拒，${target?.price ?? 0} 甜心币退回给${target?.from ?? "对方"}`);
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
    setPushState((current) => ({ ...current, permission }));
    if (permission !== "granted") return showToast("需要在 iPhone 设置中允许通知");
    // Everything below decides whether this device can actually be pushed to.
    // The old code promised push unconditionally, including when it had just
    // reported that the subscription failed.
    const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    const client = cloudCoupleId ? await getSupabase() : null;
    if (!registration || !vapidPublicKey()) return showToast("通知已开启；这台设备只能在打开小铺时提醒你");
    if (!client || !cloudCoupleId || !authUser) return showToast(`通知已开启；连接双人小铺后才能收到${partnerName}的提醒`);
    try {
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(vapidPublicKey()!),
      });
      await saveSubscription(client, subscription, cloudCoupleId, authUser.id);
      setPushState({ permission, subscribed: true });
      showToast(`已开启，${partnerName}下单或回应时会推送到这台手机`);
      void registration.showNotification("点单小铺", { body: "以后有新订单和回应，我会马上告诉你。", icon: "/assets/app-icon.png" });
    } catch {
      setPushState({ permission, subscribed: false });
      showToast("通知已开启，但推送订阅失败，稍后可重试");
    }
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
      ? { title: `还没有连接${partnerName}`, detail: "点这里创建小铺或输入情侣码", live: false }
      : { title: "本地体验模式", detail: "订单只保存在这台 iPhone 上", live: false };

  // The cloud steps only exist for a build that has a project behind it; on a
  // local install the checklist is honestly two steps long.
  const openingSteps: OpeningStep[] = [
    { id: "identity", title: `身份：${currentName}`, detail: "另一台 iPhone 选另一个身份", done: true },
    ...(cloudEnabled ? [
      {
        id: "account",
        title: "注册正式账户",
        detail: "换手机后凭账户恢复你们的小铺",
        done: Boolean(authUser && !authUser.is_anonymous),
        action: openAccount,
        cta: "去注册账户",
      },
      {
        id: "pair",
        title: "创建或加入小铺",
        detail: `和${partnerName}用同一个情侣码连接`,
        done: Boolean(cloudCoupleId),
        action: () => setView("ours"),
        cta: "去连接双人小铺",
      },
      // Installing comes first because on iPhone it is what makes push exist
      // at all. Once installed the step drops off instead of sitting ticked.
      ...(installed ? [] : [{
        id: "install",
        title: "添加到主屏幕",
        detail: "Safari 分享菜单 →「添加到主屏幕」，之后才能收通知",
        done: false,
        action: () => setInstallHelpOpen(true),
        cta: "怎么添加",
      }]),
      // A browser with no push service would leave this permanently unticked
      // and the checklist permanently on screen, so it is only offered where it
      // can actually be finished.
      ...(pushCapable() ? [{
        id: "push",
        title: "开启消息通知",
        detail: "对方下单或回应时收到提醒",
        done: pushState.subscribed,
        action: enableNotifications,
        cta: "去开启通知",
      }] : []),
    ] : []),
    {
      id: "order",
      title: "送出第一个心愿",
      detail: `攒够甜心币，点一份给${partnerName}`,
      done: orders.length > 0,
      action: () => setView("shop"),
      cta: "去挑一个心愿",
    },
  ];

  return (
    <div className="app-shell">
      <MobileScroll className="app-screen">
        <main className="screen-content couple-shop" aria-label="情侣点单小铺" onPointerDown={dismissKeyboardOnOutsideTap}>
          <header className="top-bar">
            <div className="brand-mark"><HeartFilledIcon /></div>
            <div className="brand-copy"><span>{profile.firstName} & {profile.secondName}</span><h1>{profile.shopName}</h1></div>
            <button className="bell-button" onClick={() => setView("orders")} aria-label="查看订单"><BellIcon />{activeOrders > 0 && <span>{activeOrders}</span>}</button>
          </header>
          {/* Not a sign when it is also the fix: unpaired, this line is the
              shortest route to pairing, so it is a button. */}
          <section
            className="live-push-strip"
            aria-label={syncState.live ? "同步状态" : "去连接双人小铺"}
            role={syncState.live ? undefined : "button"}
            tabIndex={syncState.live ? undefined : 0}
            onClick={syncState.live ? undefined : () => setView("ours")}
          >
            <span className="live-push-icon"><BellIcon /></span>
            <div><strong>{syncState.title}</strong><small>{syncState.detail}</small></div>
            {syncState.live ? <span className="live-state"><i /> 实时</span> : <span className="live-go">去连接</span>}
          </section>
          {view === "shop" && !openingDismissed && (
            <OpeningProgress steps={openingSteps} onDismiss={() => {
              localStorage.setItem(STORAGE_KEYS.openingDismissed, "1");
              setOpeningDismissed(true);
            }} />
          )}
          <section className="wallet-card">
            <div className="coin-count"><HeartFilledIcon /><strong>{coins}</strong><span>甜心币</span></div>
            <button className="earn-link" onClick={() => setView("tasks")}><CheckCircledIcon /><span>做任务赚币</span></button>
          </section>

          {view === "shop" && (
            <ShopScreen
              category={category}
              setCategory={setCategory}
              onAdd={setSelected}
              onRandom={chooseRandom}
              usedLimitedIds={usedLimitedIds}
              customItems={customItems}
              onAddCustom={openAddWish}
              onEditCustom={openEditWish}
            />
          )}
          {view === "tasks" && (
            <TasksScreen
              coins={coins}
              claimedTasks={claimedTasks}
              onClaim={claimTask}
              orders={orders}
              memories={memories}
              currentName={currentName}
              currentUserId={authUser?.id}
              memoriesTracked={Boolean(cloudCoupleId)}
              partner={partner}
            />
          )}
          {view === "orders" && (
            <OrdersScreen
              orders={orders}
              currentName={currentName}
              onStatus={updateStatus}
              onCancel={cancelOrder}
              onKeepAsMemory={keepOrderAsMemory}
              focusOrderId={focusOrderId}
              onFocusConsumed={() => setFocusOrderId(null)}
              onBrowseShop={() => setView("shop")}
            />
          )}
          {view === "memories" && (
            <MemoriesScreen
              orders={orders}
              profile={profile}
              memories={memories}
              anniversaries={anniversaries}
              checkin={cloudCoupleId ? checkin : checkinStatusFrom(wallet.checkins)}
              onCheckin={dailyCheckin}
              onAddMemory={openAddMemory}
              onOpenMemory={setMemoryDetail}
              onAddAnniversary={openAddAnniversary}
              onEditAnniversary={openEditAnniversary}
              paired={Boolean(cloudCoupleId)}
              onPair={() => setView("ours")}
              onPlanDate={() => { setCategory("date"); setView("shop"); }}
              onWriteWish={() => { openAddWish(); setView("shop"); }}
            />
          )}
          {view === "ours" && (
            <OursScreen
              identity={identity}
              partnerName={partnerName}
              onSwitchIdentity={switchIdentity}
              push={pushState}
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

      <nav className="bottom-nav" aria-label="主要导航" style={{ bottom: bottomInset + 9 }}>
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
            <div className="time-options">
              <span>希望什么时候</span>
              <div>{DESIRED_TIMES.map((option) => <button key={option} className={time === option ? "active" : ""} onClick={() => setTime(option)}>{option}</button>)}</div>
            </div>
            <label className="order-note-field" htmlFor="order-time">
              <span>或者写一个具体时间</span>
              <KeyboardInput id="order-time" value={time} maxLength={40} onChange={(event) => setTime(event.target.value)} placeholder="例如：周六下午三点" />
            </label>
            <label className="order-note-field" htmlFor="order-note">
              <span>给对方的悄悄话</span>
              <KeyboardInput id="order-note" value={note} maxLength={160} onChange={(event) => setNote(event.target.value)} placeholder="例如：想和你一起慢慢吃" />
            </label>
            <button className="submit-order" onClick={submitOrder}><HeartFilledIcon /> 确认下单 · {selected.price} 甜心币</button>
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={wishOpen} onOpenChange={(open) => (open ? setWishOpen(true) : closeWish())} title={editingWishId ? "修改这个心愿" : "写一个我们的心愿"} description={`价格 ${CUSTOM_PRICE_RANGE.min}–${CUSTOM_PRICE_RANGE.max} 甜心币，两个人都能修改`}>
        <div className="memory-form">
          {/* A blank form asks people to be inventive on the spot, which is
              exactly when nothing comes to mind. */}
          {!editingWishId && (
            <div className="wish-templates">
              <span>从一个例子开始</span>
              <div className="wish-template-row">
                {WISH_TEMPLATES.map((template) => (
                  <button
                    key={template.name}
                    onClick={() => setWishDraft({ name: template.name, description: template.description, price: String(template.price), category: template.category })}
                  >
                    {template.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="account-field" htmlFor="wish-name"><span>心愿名字</span><KeyboardInput id="wish-name" value={wishDraft.name} maxLength={20} onChange={(event) => setWishDraft((current) => ({ ...current, name: event.target.value }))} placeholder="例如：陪我去菜市场" /></label>
          <label className="account-field" htmlFor="wish-desc"><span>一句话介绍</span><KeyboardInput id="wish-desc" value={wishDraft.description} maxLength={40} onChange={(event) => setWishDraft((current) => ({ ...current, description: event.target.value }))} placeholder="例如：挑晚饭的菜，顺便牵手" /></label>
          <div className="option-field">
            <span>放进哪个分类</span>
            <div className="option-row">
              {CUSTOM_CATEGORIES.map((option) => (
                <button key={option} className={wishDraft.category === option ? "active" : ""} onClick={() => setWishDraft((current) => ({ ...current, category: option }))}>
                  {categoryMeta.find((meta) => meta.id === option)!.label}
                </button>
              ))}
            </div>
          </div>
          <label className="account-field" htmlFor="wish-price"><span>要多少甜心币</span><KeyboardInput id="wish-price" value={wishDraft.price} inputMode="numeric" maxLength={3} onChange={(event) => setWishDraft((current) => ({ ...current, price: event.target.value.replace(/\D/g, "") }))} placeholder="48" /></label>
          {confirmDelete === "wish" ? (
            <div className="delete-confirm">
              <strong>下架后不会再出现在菜单里</strong>
              <p>已经点过的订单会保留原来的名字和价格，不受影响。</p>
              <button className="account-danger" disabled={cloudBusy} onClick={deleteWish}>{cloudBusy ? "正在下架…" : "确认下架"}</button>
              <button className="account-secondary" onClick={() => setConfirmDelete(null)}>我再想想</button>
            </div>
          ) : (
            <>
              <button className="account-primary" disabled={cloudBusy} onClick={saveWish}>{cloudBusy ? "正在保存…" : editingWishId ? "保存修改" : "上架这个心愿"}</button>
              {editingWishId && <button className="account-danger" onClick={() => setConfirmDelete("wish")}><TrashIcon /> 下架这个心愿</button>}
            </>
          )}
        </div>
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

      <BottomSheet
        open={authOpen}
        onOpenChange={(open) => (open ? setAuthOpen(true) : closeAuth())}
        title={protectedAccount ? "账户中心" : authCopy.title}
        description={protectedAccount ? "账户已保护，换手机登录即可恢复" : authCopy.description}
      >
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
                  {authMode !== "recover" && <label className="account-field"><span>{authMode === "signup" ? "设置密码" : "密码"}</span><KeyboardInput value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} type="password" placeholder="至少 6 位" /></label>}
                </>
              )}
              {authMode === "signup" && <button className={`privacy-consent ${privacyAccepted ? "selected" : ""}`} onClick={() => { const next = !privacyAccepted; setPrivacyAccepted(next); localStorage.setItem(STORAGE_KEYS.privacyAccepted, next ? "1" : "0"); }}><span>{privacyAccepted ? <CheckIcon /> : null}</span><p>我已阅读并同意《用户协议》和《隐私政策》</p></button>}
              <button className="account-primary" disabled={authBusy} onClick={submitAuth}>{authBusy ? "处理中…" : authCopy.primary}</button>
              {authMode === "signin" && <button className="auth-link" onClick={() => setAuthMode("recover")}>忘记密码？找回账户</button>}
              {(authMode === "recover" || authMode === "phone") && <button className="auth-link" onClick={() => { setAuthMode("signin"); setPhoneOtpSent(false); }}>返回邮箱登录</button>}
              {/* Only providers this deployment has actually configured are
                  offered: an unconfigured one leads straight into a failure. */}
              {authMode !== "recover" && authMode !== "new-password" && (phoneAuthEnabled || appleAuthEnabled) && (
                <>
                  <div className="auth-divider"><span>其他登录方式</span></div>
                  <div className="provider-grid">
                    {phoneAuthEnabled && <button onClick={() => setAuthMode("phone")}><span>☎</span> 手机号</button>}
                    {appleAuthEnabled && <button onClick={signInWithApple}><span className="apple-mark">●</span> Apple</button>}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </BottomSheet>

      <BottomSheet open={memoryOpen} onOpenChange={(open) => (open ? setMemoryOpen(true) : closeMemory())} title={editingMemoryId ? "修改这份回忆" : "收藏照片回忆"} description={editingMemoryId ? "照片本身不可替换，删除后重新收藏即可" : "照片仅双人小铺成员可见，单张不超过 8MB"}>
        <div className="memory-form">
          {!editingMemoryId && (
            <>
              <input ref={fileInputRef} className="hidden-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(event) => setMemoryFile(event.target.files?.[0] ?? null)} />
              <button className={`photo-picker ${memoryFile ? "selected" : ""}`} onClick={() => fileInputRef.current?.click()}><CameraIcon /><strong>{memoryFile ? memoryFile.name : "选择一张照片"}</strong><span>{memoryFile ? `${(memoryFile.size / 1024 / 1024).toFixed(1)} MB` : "支持相册与相机"}</span></button>
            </>
          )}
          <label className="account-field"><span>这张照片的故事</span><KeyboardInput value={memoryCaption} maxLength={160} onChange={(event) => setMemoryCaption(event.target.value)} placeholder="例如：第一次一起去看海" /></label>
          <label className="account-field"><span>发生日期</span><KeyboardInput value={memoryDate} inputMode="numeric" maxLength={10} onChange={(event) => setMemoryDate(normalizeDateInput(event.target.value))} placeholder="YYYY-MM-DD" /></label>
          <button className="account-primary" disabled={cloudBusy} onClick={saveMemory}>{cloudBusy ? "正在保存…" : editingMemoryId ? "保存修改" : "保存到双人回忆"}</button>
        </div>
      </BottomSheet>

      <BottomSheet open={Boolean(memoryDetail)} onOpenChange={(open) => !open && closeMemoryDetail()} title="这份回忆" description={memoryDetail ? `记录于 ${memoryDetail.happenedOn}` : ""}>
        {memoryDetail && (
          <div className="memory-detail">
            {memoryDetail.imageUrl
              ? <img src={memoryDetail.imageUrl} alt={memoryDetail.caption} draggable="false" />
              : <div className="memory-detail-blank"><ImageIcon /><span>这条回忆没有照片</span></div>}
            <h3>{memoryDetail.caption}</h3>
            <p>{memoryDetail.happenedOn}</p>
            {memoryDetail.createdBy && authUser && memoryDetail.createdBy !== authUser.id ? (
              <p className="memory-detail-note">这是{partnerName}收藏的回忆，只有 TA 能修改或删除。</p>
            ) : confirmDelete === "memory" ? (
              <div className="delete-confirm">
                <strong>删除后无法恢复</strong>
                <p>照片和这段文字都会从双人空间移除，{partnerName}那边也会一起消失。</p>
                <button className="account-danger" disabled={cloudBusy} onClick={() => deleteMemory(memoryDetail)}>{cloudBusy ? "正在删除…" : "确认删除"}</button>
                <button className="account-secondary" onClick={() => setConfirmDelete(null)}>我再想想</button>
              </div>
            ) : (
              <div className="memory-detail-actions">
                <button className="account-secondary" onClick={() => openEditMemory(memoryDetail)}><Pencil1Icon /> 修改文字</button>
                <button className="account-danger" onClick={() => setConfirmDelete("memory")}><TrashIcon /> 删除回忆</button>
              </div>
            )}
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={anniversaryOpen} onOpenChange={(open) => (open ? setAnniversaryOpen(true) : closeAnniversary())} title={editingAnniversaryId ? "管理纪念日" : "添加纪念日"} description="提醒会在打开小铺时出现，两个人都能修改">
        <div className="memory-form">
          <label className="account-field"><span>纪念日名称</span><KeyboardInput value={anniversaryTitle} maxLength={40} onChange={(event) => setAnniversaryTitle(event.target.value)} placeholder="例如：第一次见面" /></label>
          <label className="account-field"><span>日期</span><KeyboardInput value={anniversaryDate} inputMode="numeric" maxLength={10} onChange={(event) => setAnniversaryDate(normalizeDateInput(event.target.value))} placeholder="YYYY-MM-DD" /></label>
          <div className="option-field">
            <span>重复方式</span>
            <div className="option-row">
              <button className={anniversaryRepeats ? "active" : ""} onClick={() => setAnniversaryRepeats(true)}>每年重复</button>
              <button className={anniversaryRepeats ? "" : "active"} onClick={() => setAnniversaryRepeats(false)}>仅这一次</button>
            </div>
          </div>
          <div className="option-field">
            <span>提前提醒</span>
            <div className="option-row">
              {[0, 1, 3, 7].map((days) => (
                <button key={days} className={anniversaryReminder === days ? "active" : ""} onClick={() => setAnniversaryReminder(days)}>{days === 0 ? "当天" : `${days} 天`}</button>
              ))}
            </div>
          </div>
          <div className="reminder-note"><BellIcon /><div><strong>{anniversaryReminder === 0 ? "当天提醒" : `提前 ${anniversaryReminder} 天提醒`}</strong><p>提醒会在你打开小铺时出现；小铺不会在后台叫醒你。</p></div></div>
          {confirmDelete === "anniversary" ? (
            <div className="delete-confirm">
              <strong>删除后无法恢复</strong>
              <p>「{anniversaryTitle.trim() || "这个纪念日"}」会从双人小铺移除，之后也不会再提醒。</p>
              <button className="account-danger" disabled={cloudBusy} onClick={deleteAnniversary}>{cloudBusy ? "正在删除…" : "确认删除"}</button>
              <button className="account-secondary" onClick={() => setConfirmDelete(null)}>我再想想</button>
            </div>
          ) : (
            <>
              <button className="account-primary" disabled={cloudBusy} onClick={saveAnniversary}>{cloudBusy ? "正在保存…" : editingAnniversaryId ? "保存修改" : "保存纪念日"}</button>
              {editingAnniversaryId && <button className="account-danger" onClick={() => setConfirmDelete("anniversary")}><TrashIcon /> 删除这个纪念日</button>}
            </>
          )}
        </div>
      </BottomSheet>

      <BottomSheet open={installHelpOpen} onOpenChange={setInstallHelpOpen} title="添加到主屏幕" description="装好之后才能收到对方的消息通知">
        <div className="install-help">
          <ol>
            <li>用 <strong>Safari</strong> 打开这个网址（微信或其它 App 里的浏览器不行）</li>
            <li>点底部中间的 <strong>分享</strong> 按钮</li>
            <li>下滑选择 <strong>添加到主屏幕</strong></li>
            <li>回到主屏幕，从新图标打开小铺</li>
          </ol>
          <p>装好后回到「我们」页开启通知，对方下单时你就能收到提醒。</p>
          <button className="account-primary" onClick={() => setInstallHelpOpen(false)}>知道了</button>
        </div>
      </BottomSheet>

      <OnboardingSheet open={onboardingOpen} partnerName={partnerName} onFinish={finishOnboarding} />

      <BottomSheet open={privacyOpen} onOpenChange={(open) => { setPrivacyOpen(open); if (!open) setDangerConfirm(null); }} title={dangerConfirm === "leave" ? "确认解除配对" : dangerConfirm === "delete" ? "确认注销账户" : "隐私与账户安全"} description="你的数据、你的选择，随时可以带走或删除">
        <div className="privacy-sheet">
          {dangerConfirm ? (
            <div className="danger-confirm"><span><TrashIcon /></span><h3>{dangerConfirm === "leave" ? "解除后，两台手机将停止同步" : "注销后，账户无法恢复"}</h3><p>{dangerConfirm === "leave" ? "当前账户会离开双人小铺；另一半的账户和共同数据会保留。你以后仍可用新情侣码重新配对。" : "你的登录账户、配对关系和个人数据会立即删除；若小铺只剩你一人，共同数据也会一并删除。请先导出数据。"}</p><button className="danger-final" disabled={cloudBusy} onClick={confirmDangerAction}>{cloudBusy ? "正在处理…" : dangerConfirm === "leave" ? "确认解除配对" : "确认永久注销"}</button><button className="account-secondary" onClick={() => setDangerConfirm(null)}>我再想想</button></div>
          ) : (
            <>
              <div className="privacy-section"><span><LockClosedIcon /></span><div><strong>我们保存什么</strong><p>账户标识、情侣配对、订单、任务、签到、回忆照片、纪念日和必要的安全操作记录。</p></div></div>
              <div className="privacy-section"><span><ReaderIcon /></span><div><strong>这些数据怎么使用</strong><p>只用于双人同步、提醒、账号恢复、防刷币和故障排查；不会出售给广告平台。</p></div></div>
              <div className="privacy-section"><span><DownloadIcon /></span><div><strong>数据权利</strong><p>你可以随时导出数据、解除配对或注销账户。照片使用私有存储和短时访问链接。</p></div></div>
              <div className="security-grid"><div><strong>限流</strong><span>订单、任务、签到</span></div><div><strong>审计</strong><span>关键操作留痕</span></div><div><strong>导出</strong><span>随时下载 JSON</span></div></div>
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
