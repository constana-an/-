import type { HomeIcon } from "@radix-ui/react-icons";

export type Category = "food" | "care" | "date" | "limited";
export type MainView = "shop" | "tasks" | "orders" | "memories" | "ours";
export type OrderStatus = "pending" | "accepted" | "doing" | "done" | "rejected";
export type TaskFrequency = "daily" | "weekly";
export type Identity = "大宝" | "二宝";
export type AuthMode = "signin" | "signup" | "recover" | "new-password" | "phone";

export type CoupleProfile = {
  shopName: string;
  firstName: string;
  secondName: string;
  startedOn: string;
};

export type MenuItem = {
  id: string;
  category: Category;
  name: string;
  description: string;
  price: number;
  image?: string;
  tint: string;
  limited?: boolean;
};

export type Order = {
  id: string;
  itemId: string;
  itemName: string;
  image?: string;
  price: number;
  note: string;
  createdAt: string;
  desiredTime: string;
  status: OrderStatus;
  from: string;
  to: string;
  /** Auth user id of the sender. Absent for local-mode and legacy orders. */
  createdBy?: string;
};

export type CoupleTask = {
  id: string;
  frequency: TaskFrequency;
  title: string;
  description: string;
  reward: number;
  icon: typeof HomeIcon;
  tone: "pink" | "mint" | "gold" | "lavender";
};

export type MemoryEntry = {
  id: string;
  caption: string;
  happenedOn: string;
  imagePath?: string;
  imageUrl?: string;
  createdAt: string;
};

export type Anniversary = {
  id: string;
  title: string;
  eventDate: string;
  repeatsYearly: boolean;
  reminderDays: number;
};

export type CheckinStatus = {
  streak: number;
  checkedToday: boolean;
};

export type MembershipState = {
  planName: string;
  status: string;
};

/** The two fixed identity slots. Each one owns its own sweet-heart coin wallet. */
export const IDENTITIES: Identity[] = ["大宝", "二宝"];

export const partnerFor = (identity: Identity): Identity => (identity === "大宝" ? "二宝" : "大宝");

export function displayNameFor(profile: CoupleProfile, identity: Identity): string {
  return identity === "大宝" ? profile.firstName : profile.secondName;
}
