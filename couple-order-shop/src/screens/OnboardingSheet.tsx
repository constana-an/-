import { HeartFilledIcon } from "@radix-ui/react-icons";
import { BottomSheet } from "../shell";
import { MENU, TASKS } from "../lib/catalog";
import { OPENING_BALANCE } from "../lib/storage";
import { cloudEnabled } from "../lib/supabase";

const CHEAPEST = Math.min(...MENU.map((item) => item.price));
const DEAREST = Math.max(...MENU.map((item) => item.price));
const DAILY_REWARD = TASKS.filter((task) => task.frequency === "daily").reduce((sum, task) => sum + task.reward, 0);

/** What `public.grant_pairing_bonus` credits each partner the first time they pair. */
export const PAIRING_BONUS = 20;

/**
 * One screen, not three. The opening checklist on the shop page already walks
 * people through account → pairing → notifications → first wish, so a stepped
 * guide covering the same ground meant sitting through two onboardings to
 * arrive at the same place.
 *
 * What the checklist cannot explain is why a wallet holding 8 coins is looking
 * at a menu starting at 28 — so that is what this keeps, with the arithmetic
 * the pairing bonus actually produces rather than the pre-bonus "三四天".
 */
export function OnboardingSheet({
  open,
  partnerName,
  onFinish,
}: {
  open: boolean;
  partnerName: string;
  /** `goToTasks` sends the reader straight to their first claimable task. */
  onFinish: (goToTasks: boolean) => void;
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => !next && onFinish(false)}
      title="这间小铺怎么开"
      description={`你和${partnerName}互相点单，用甜心币结账`}
      snap={0.62}
    >
      <div className="onboarding-sheet">
        <div className="onboarding-step">
          <span className="onboarding-icon"><HeartFilledIcon /></span>
          <h3>{MENU.length} 个心愿，{CHEAPEST} 到 {DEAREST} 甜心币</h3>
          <p>
            从一杯奶茶到「一整天听你安排」。点单花的是你自己的甜心币，
            {partnerName}可以接单也可以婉拒——婉拒会原路退给你。
          </p>
        </div>
        <div className="onboarding-note">
          <strong>甜心币从哪来</strong>
          {cloudEnabled ? (
            <p>
              开张先给 {OPENING_BALANCE} 枚。和{partnerName}连上双人小铺后两个人各再得 {PAIRING_BONUS} 枚，
              加起来正好 {OPENING_BALANCE + PAIRING_BONUS} 枚——当天就能点第一份。
              之后靠每日任务（最多 +{DAILY_REWARD}）和签到慢慢攒。
            </p>
          ) : (
            <p>
              开张先给 {OPENING_BALANCE} 枚，最便宜的心愿 {CHEAPEST} 枚。
              每日任务最多 +{DAILY_REWARD}，签到每天 +1，认真做三四天就能点第一份。
            </p>
          )}
        </div>
        <button className="account-primary" onClick={() => onFinish(true)}>去领第一个任务</button>
        <button className="auth-link" onClick={() => onFinish(false)}>先自己逛逛</button>
      </div>
    </BottomSheet>
  );
}
