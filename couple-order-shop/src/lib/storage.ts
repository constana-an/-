import { isValidDateKey, todayKey } from "./date";
import type { CoupleProfile, Identity, Order } from "./types";

export const STORAGE_KEYS = {
  profile: "couple-shop-profile",
  identity: "couple-shop-identity",
  orders: "couple-shop-orders",
  coins: "couple-shop-coins",
  taskClaims: "couple-shop-task-claims",
  economyVersion: "couple-shop-economy-version",
  cloudId: "couple-shop-cloud-id",
  inviteCode: "couple-shop-invite-code",
  privacyAccepted: "couple-shop-privacy-accepted",
} as const;

export const DEFAULT_PROFILE: CoupleProfile = {
  shopName: "我们的小铺",
  firstName: "大宝",
  secondName: "二宝",
  startedOn: todayKey(),
};

export function loadCoupleProfile(): CoupleProfile {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.profile) ?? "null") as Partial<CoupleProfile> | null;
    return {
      shopName: saved?.shopName?.trim() || DEFAULT_PROFILE.shopName,
      firstName: saved?.firstName?.trim() || DEFAULT_PROFILE.firstName,
      secondName: saved?.secondName?.trim() || DEFAULT_PROFILE.secondName,
      startedOn: isValidDateKey(saved?.startedOn ?? "") ? saved!.startedOn! : DEFAULT_PROFILE.startedOn,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function loadIdentity(): Identity | null {
  const saved = localStorage.getItem(STORAGE_KEYS.identity);
  return saved === "大宝" || saved === "二宝" ? saved : null;
}

export function loadLocalOrders(): Order[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.orders);
    return saved ? (JSON.parse(saved) as Order[]) : [];
  } catch {
    return [];
  }
}

/**
 * Economy version 2 reset every wallet to 8 coins when prices were rebalanced.
 * Version 3 halves per-person task rewards; balances stay untouched because the
 * couple's combined earning rate is unchanged.
 */
export function loadEconomyCoins(): number {
  const version = localStorage.getItem(STORAGE_KEYS.economyVersion);
  if (version !== "2" && version !== "3") {
    localStorage.setItem(STORAGE_KEYS.economyVersion, "3");
    localStorage.setItem(STORAGE_KEYS.coins, "8");
    return 8;
  }
  localStorage.setItem(STORAGE_KEYS.economyVersion, "3");
  const saved = Number(localStorage.getItem(STORAGE_KEYS.coins));
  return Number.isFinite(saved) && saved >= 0 ? saved : 8;
}

export function loadTaskClaims(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.taskClaims) ?? "[]") as unknown;
    return Array.isArray(saved) ? saved.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}
