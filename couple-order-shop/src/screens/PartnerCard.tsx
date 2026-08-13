import { CheckCircledIcon, MoonIcon, SunIcon } from "@radix-ui/react-icons";
import { WEEKLY_PERSONAL_GOAL } from "../lib/catalog";
import type { PartnerStatus } from "../lib/types";

/**
 * Everything else in this app is single-player: your wallet, your tasks, your
 * streak. This is the one place the other person shows up while they are not
 * ordering anything — so the shop reads as something two people keep, rather
 * than two apps that happen to share a menu.
 *
 * It never shows a balance. Wallets are private and the server-side function
 * this renders does not return one.
 */
export function PartnerCard({ status }: { status: PartnerStatus | null }) {
  if (!status) return null;
  const progress = Math.min(100, Math.round((status.earnedThisWeek / WEEKLY_PERSONAL_GOAL) * 100));
  return (
    <section className="partner-card" aria-label={`${status.displayName}的本周进度`}>
      <div className="partner-head">
        <span className="partner-avatar">{status.displayName.slice(0, 1)}</span>
        <div>
          <strong>{status.displayName}这周</strong>
          <small>
            {status.checkedToday ? "今天已经来过小铺了" : "今天还没来签到"}
            {status.streak > 0 && ` · 连续 ${status.streak} 天`}
          </small>
        </div>
        <span className={`partner-today ${status.checkedToday ? "is-on" : ""}`}>
          {status.checkedToday ? <SunIcon /> : <MoonIcon />}
        </span>
      </div>
      <div className="partner-progress" aria-label={`${status.displayName}本周进度 ${progress}%`}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="partner-foot">
        <span><CheckCircledIcon /> 本周攒了 {status.earnedThisWeek} 甜心币</span>
        <span>{status.earnedThisWeek} / {WEEKLY_PERSONAL_GOAL}</span>
      </div>
    </section>
  );
}
