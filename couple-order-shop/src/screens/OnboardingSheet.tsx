import { useState } from "react";
import { ArchiveIcon, HeartFilledIcon, TargetIcon } from "@radix-ui/react-icons";
import { BottomSheet } from "../mobile";
import { MENU, TASKS } from "../lib/catalog";
import { OPENING_BALANCE } from "../lib/storage";

const CHEAPEST = Math.min(...MENU.map((item) => item.price));
const DEAREST = Math.max(...MENU.map((item) => item.price));
const DAILY_REWARD = TASKS.filter((task) => task.frequency === "daily").reduce((sum, task) => sum + task.reward, 0);
const WEEKLY_REWARD = TASKS.filter((task) => task.frequency === "weekly").reduce((sum, task) => sum + task.reward, 0);

/**
 * A new wallet opens at 8 coins while the cheapest wish costs 28, so without an
 * explanation the first screen reads as "everything is locked". These three
 * steps say how the coins arrive and end on the fastest way to earn the first
 * one.
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
  const [step, setStep] = useState(0);
  const steps = [
    {
      icon: <HeartFilledIcon />,
      title: `挑一个心愿，送给${partnerName}`,
      body: `小铺里有 ${MENU.length} 个固定心愿，从 ${CHEAPEST} 甜心币的小甜品，到 ${DEAREST} 甜心币的限定券。`,
    },
    {
      icon: <TargetIcon />,
      title: "先做任务，攒够甜心币",
      body: `你现在有 ${OPENING_BALANCE} 甜心币，最便宜的心愿要 ${CHEAPEST} 币。每日任务最多 +${DAILY_REWARD}，每周任务再 +${WEEKLY_REWARD}，签到每天 +1，认真做三四天就能点第一份。`,
    },
    {
      icon: <ArchiveIcon />,
      title: `等${partnerName}接单并完成`,
      body: `对方可以接单，也可以婉拒；婉拒会把甜心币原路退回给你。完成的心愿会自动排进「回忆」的时间线，想补照片也可以。`,
    },
  ];
  const current = steps[step];
  const last = step === steps.length - 1;
  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => !next && onFinish(false)}
      title="三步开张你们的小铺"
      description={`第 ${step + 1} / ${steps.length} 步`}
      snap={0.68}
    >
      <div className="onboarding-sheet">
        <div className="onboarding-step">
          <span className="onboarding-icon">{current.icon}</span>
          <h3>{current.title}</h3>
          <p>{current.body}</p>
        </div>
        <div className="onboarding-dots" aria-hidden="true">
          {steps.map((item, index) => <i key={item.title} className={index === step ? "on" : ""} />)}
        </div>
        <button className="account-primary" onClick={() => (last ? onFinish(true) : setStep(step + 1))}>
          {last ? "去领第一个任务" : "下一步"}
        </button>
        <button className="auth-link" onClick={() => onFinish(false)}>先自己逛逛</button>
      </div>
    </BottomSheet>
  );
}
