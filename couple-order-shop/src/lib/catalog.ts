import { ActivityLogIcon, BookmarkIcon, CameraIcon, ChatBubbleIcon, CheckCircledIcon, HeartIcon, HomeIcon, RocketIcon, StarFilledIcon, SunIcon, TimerIcon } from "@radix-ui/react-icons";
import { todayKey, weekKey } from "./date.ts";
import type { Category, CoupleTask, MenuItem, OrderStatus, TaskFrequency } from "./types.ts";

export const MENU: MenuItem[] = [
  { id: "fruit-tea", category: "food", name: "缤纷水果茶", description: "满杯鲜果，酸甜刚刚好", price: 28, image: "/assets/menu/fruit-tea.png", tint: "#fff0e5" },
  { id: "ice-cream", category: "food", name: "草莓冰淇淋", description: "今天的甜，要一起分享", price: 32, image: "/assets/menu/ice-cream.png", tint: "#ffe8ef" },
  { id: "milk-tea", category: "food", name: "奶茶投喂", description: "半糖去冰，再加一份想念", price: 36, image: "/assets/menu/milk-tea.png", tint: "#fff0e5" },
  { id: "duck-neck", category: "food", name: "绝味鸭脖", description: "香辣入味，越啃越上头", price: 38, image: "/assets/menu/duck-neck.png", tint: "#ffe8e2" },
  { id: "breakfast", category: "food", name: "爱心早餐", description: "豆浆包子油条，起床就能吃", price: 42, image: "/assets/menu/breakfast.png", tint: "#fff1dd" },
  { id: "fried-chicken", category: "food", name: "炸鸡可乐", description: "今晚一起快乐加倍", price: 48, image: "/assets/menu/fried-chicken.png", tint: "#fff0df" },
  { id: "cake", category: "food", name: "草莓奶油蛋糕", description: "切一块软乎乎的甜给你", price: 52, image: "/assets/menu/cake.png", tint: "#ffe8ef" },
  { id: "sushi", category: "food", name: "寿司约会", description: "便利店也行，重要的是一起", price: 56, image: "/assets/menu/sushi.png", tint: "#fff0ea" },
  { id: "roast-chicken", category: "food", name: "香喷喷烤鸡", description: "金黄酥香，撕着吃最快乐", price: 62, image: "/assets/menu/roast-chicken.png", tint: "#fff0df" },
  { id: "hotpot", category: "food", name: "暖呼呼火锅", description: "鸳鸯锅走起，今天都要吃饱", price: 68, image: "/assets/menu/hotpot.png", tint: "#ffe7eb" },
  { id: "crayfish", category: "food", name: "麻辣小龙虾", description: "戴上手套，认真嗦一大盆", price: 72, image: "/assets/menu/crayfish.png", tint: "#ffe6e3" },
  { id: "bbq", category: "food", name: "快乐烤肉", description: "肉食动物最爱的治愈时刻", price: 78, image: "/assets/menu/bbq.png", tint: "#ffe8e2" },
  { id: "hug", category: "care", name: "十分钟抱抱", description: "什么都不用说，抱紧就好", price: 48, tint: "#ffe3ef" },
  { id: "wake-up", category: "care", name: "温柔叫早", description: "用喜欢的声音开启新一天", price: 56, tint: "#fff1d9" },
  { id: "dry-hair", category: "care", name: "帮忙吹头发", description: "洗完头就交给我照顾", price: 62, tint: "#e5f6ee" },
  { id: "sleep", category: "care", name: "晚安哄睡", description: "陪你聊到困意来敲门", price: 68, tint: "#e7efff" },
  { id: "no-phone", category: "care", name: "一小时不看手机", description: "把全部注意力认真交给你", price: 78, tint: "#f0e8ff" },
  { id: "massage", category: "care", name: "肩颈按摩", description: "辛苦啦，今天让我照顾你", price: 88, tint: "#efe8ff" },
  { id: "listen", category: "care", name: "认真倾听一小时", description: "不讲道理，只认真听你说", price: 98, tint: "#e6f2ff" },
  { id: "hair-wash", category: "care", name: "豪华洗头服务", description: "含按摩、吹干和无限耐心", price: 118, tint: "#ffe6ee" },
  { id: "walk", category: "date", name: "牵手散步", description: "不赶路，只和你慢慢走", price: 60, tint: "#e5f6ee" },
  { id: "sunset", category: "date", name: "去看日落", description: "收藏一场只属于我们的晚霞", price: 78, tint: "#fff0dd" },
  { id: "movie", category: "date", name: "电影之夜", description: "零食、毯子和你都要有", price: 88, tint: "#e9e6ff" },
  { id: "cook", category: "date", name: "一起做顿饭", description: "哪怕手忙脚乱也很浪漫", price: 98, tint: "#fff0e5" },
  { id: "coffee", category: "date", name: "咖啡店约会", description: "找个角落坐下来慢慢聊", price: 108, tint: "#f2eadf" },
  { id: "museum", category: "date", name: "逛展览馆", description: "把今天喜欢的作品讲给你听", price: 118, tint: "#e6f2ff" },
  { id: "picnic", category: "date", name: "公园野餐", description: "带上水果和一整天好心情", price: 138, tint: "#e8f6df" },
  { id: "day-trip", category: "date", name: "周末小旅行", description: "你负责期待，我负责计划", price: 188, tint: "#e6f2ff" },
  { id: "choose-meal", category: "limited", name: "今天吃什么我决定", description: "一次免纠结的最高决定权", price: 120, tint: "#fff3d2", limited: true },
  { id: "forgive", category: "limited", name: "和好抱抱券", description: "吵架后先抱一分钟再说", price: 148, tint: "#ffe6ee", limited: true },
  { id: "wish", category: "limited", name: "任性愿望券", description: "一辈子只有一次，请认真使用", price: 188, tint: "#fff3d2", limited: true },
  { id: "full-day", category: "limited", name: "一整天听你安排", description: "从早餐到晚安全部交给你", price: 228, tint: "#e9e4ff", limited: true },
  { id: "anniversary", category: "limited", name: "纪念日惊喜", description: "只在特别的日子闪闪发光", price: 288, tint: "#ffe1e9", limited: true },
  { id: "staycation", category: "limited", name: "双人度假日", description: "认真空出一天，只陪彼此", price: 360, tint: "#e1f3ff", limited: true },
];

/**
 * Every person owns their own wallet and funds their own orders, so rewards are
 * sized for a single earner: at most 8 coins a day and 29 a week, about 85 in a
 * perfect week, against a 28–360 price ladder. Both partners claim their own
 * copy of each task; a claim by one never consumes the other's.
 */
export const TASKS: CoupleTask[] = [
  { id: "morning", frequency: "daily", title: "好好说早安或晚安", description: "让今天从被惦记开始或结束", reward: 1, icon: SunIcon, tone: "gold" },
  { id: "compliment", frequency: "daily", title: "认真夸对方一次", description: "要具体，不可以只说“你好看”", reward: 2, icon: ChatBubbleIcon, tone: "pink" },
  { id: "mood", frequency: "daily", title: "分享今天的心情", description: "开心或委屈都可以被看见", reward: 2, icon: ActivityLogIcon, tone: "lavender" },
  { id: "focus", frequency: "daily", title: "专心陪伴 20 分钟", description: "放下手机，认真听彼此说话", reward: 3, icon: TimerIcon, tone: "mint" },
  { id: "photo", frequency: "weekly", title: "记录一张本周合照", description: "把普通日子也收藏起来", reward: 5, icon: CameraIcon, tone: "pink" },
  { id: "walk-task", frequency: "weekly", title: "一起散步半小时", description: "边走边聊，不带任务地相处", reward: 6, icon: RocketIcon, tone: "mint" },
  { id: "order-task", frequency: "weekly", title: "认真完成一份订单", description: "说到做到，是小铺最重要的规则", reward: 8, icon: CheckCircledIcon, tone: "gold" },
  { id: "date-task", frequency: "weekly", title: "完成一次用心约会", description: "不看价格，重点是认真安排", reward: 10, icon: BookmarkIcon, tone: "lavender" },
];

/** What one person can earn in a perfect week: 7 daily rounds plus the weekly set. */
export const WEEKLY_PERSONAL_GOAL = TASKS.reduce(
  (sum, task) => sum + task.reward * (task.frequency === "daily" ? 7 : 1),
  0,
);

export const categoryMeta: Array<{ id: Category; label: string; subtitle: string; icon: typeof HomeIcon }> = [
  { id: "food", label: "点吃的", subtitle: "想吃就许愿", icon: HomeIcon },
  { id: "care", label: "点服务", subtitle: "今天想被偏爱", icon: HeartIcon },
  { id: "date", label: "去约会", subtitle: "一起出发", icon: RocketIcon },
  { id: "limited", label: "限定券", subtitle: "珍贵且唯一", icon: StarFilledIcon },
];

export const statusText: Record<OrderStatus, string> = {
  pending: "等对方回应",
  accepted: "已接单",
  doing: "进行中",
  done: "甜蜜完成",
  rejected: "这次未接单",
};

export function periodKeyFor(frequency: TaskFrequency): string {
  return frequency === "daily" ? todayKey() : weekKey();
}

export function taskClaimKey(task: CoupleTask): string {
  return `${periodKeyFor(task.frequency)}:${task.id}`;
}
