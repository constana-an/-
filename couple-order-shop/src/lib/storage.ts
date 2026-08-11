import { isValidDateKey, todayKey } from "./date.ts";
import { IDENTITIES } from "./types.ts";
import type { CoupleProfile, Identity, Order } from "./types.ts";

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

export const OPENING_BALANCE = 8;

/** Wallets are per identity: 大宝 cannot spend 二宝's coins, and vice versa. */
export const walletKey = (identity: Identity) => `${STORAGE_KEYS.coins}:${identity}`;
export const claimsKey = (identity: Identity) => `${STORAGE_KEYS.taskClaims}:${identity}`;

/**
 * Economy version 4 split the single shared wallet into one wallet per person.
 * Both sides restart at the opening balance, matching the cloud migration, and
 * the old shared keys are cleared so nothing reads them again.
 */
function migrateEconomy(): void {
  if (localStorage.getItem(STORAGE_KEYS.economyVersion) === "4") return;
  localStorage.setItem(STORAGE_KEYS.economyVersion, "4");
  localStorage.removeItem(STORAGE_KEYS.coins);
  localStorage.removeItem(STORAGE_KEYS.taskClaims);
  for (const identity of IDENTITIES) {
    localStorage.removeItem(walletKey(identity));
    localStorage.removeItem(claimsKey(identity));
  }
}

export function loadEconomyCoins(identity: Identity | null): number {
  migrateEconomy();
  if (!identity) return OPENING_BALANCE;
  // Read the raw string: `Number(null)` is 0, which would silently open a new
  // wallet at zero coins instead of the opening balance.
  const raw = localStorage.getItem(walletKey(identity));
  if (raw === null) return OPENING_BALANCE;
  const saved = Number(raw);
  return Number.isFinite(saved) && saved >= 0 ? saved : OPENING_BALANCE;
}

export function loadTaskClaims(identity: Identity | null): string[] {
  migrateEconomy();
  if (!identity) return [];
  try {
    const saved = JSON.parse(localStorage.getItem(claimsKey(identity)) ?? "[]") as unknown;
    return Array.isArray(saved) ? saved.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}
