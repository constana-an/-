import { ChatBubbleIcon, CheckIcon, HeartFilledIcon, LightningBoltIcon, LockClosedIcon, MoonIcon, TargetIcon } from "@radix-ui/react-icons";
import { TASKS, WEEKLY_PERSONAL_GOAL, earnedInWeek, promptOfDay, requirementHint, taskClaimKey, taskRequirementMet } from "../lib/catalog";
import type { CoupleTask, MemoryEntry, Order, PartnerStatus } from "../lib/types";
import { PartnerCard } from "./PartnerCard";

export function TasksScreen({
  coins,
  claimedTasks,
  onClaim,
  orders,
  memories,
  currentName,
  currentUserId,
  memoriesTracked,
  partner,
}: {
  coins: number;
  /** Only the current person's claims — both partners earn their own rewards. */
  claimedTasks: string[];
  onClaim: (task: CoupleTask) => void;
  orders: Order[];
  memories: MemoryEntry[];
  currentName: string;
  currentUserId?: string;
  memoriesTracked: boolean;
  /** The other person's week, or null when nobody is paired yet. */
  partner: PartnerStatus | null;
}) {
  const daily = TASKS.filter((task) => task.frequency === "daily");
  const weekly = TASKS.filter((task) => task.frequency === "weekly");
  const earnedThisWeek = earnedInWeek(claimedTasks);
  const progress = Math.min(100, Math.round((earnedThisWeek / WEEKLY_PERSONAL_GOAL) * 100));
  const context = { orders, memories, currentName, currentUserId, memoriesTracked };
  const prompt = promptOfDay();

  const renderTask = (task: CoupleTask) => {
    const claimed = claimedTasks.includes(taskClaimKey(task));
    // Tasks tied to a real action only unlock once the shop has seen it happen.
    const ready = claimed || taskRequirementMet(task, context);
    const Icon = task.icon;
    return (
      <article className={`task-card tone-${task.tone}`} key={task.id}>
        <span className="task-icon"><Icon /></span>
        <div className="task-copy">
          <h3>{task.title}</h3>
          <p>{ready ? task.description : requirementHint[task.requires!]}</p>
        </div>
        <button className={claimed ? "claimed" : ready ? "" : "locked"} disabled={claimed || !ready} onClick={() => onClaim(task)}>
          {claimed ? <><CheckIcon /> 已领取</> : ready ? <><HeartFilledIcon /> +{task.reward}</> : <><LockClosedIcon /> 待完成</>}
        </button>
      </article>
    );
  };

  return (
    <section className="page-section tasks-page">
      <div className="task-hero">
        <div className="task-hero-top"><span><TargetIcon /> 我这周攒币计划</span><strong>{earnedThisWeek} / {WEEKLY_PERSONAL_GOAL}</strong></div>
        <h2>认真相爱，也会有奖励</h2>
        <p>每个人有自己的甜心币钱包，各攒各的，也各花各的。</p>
        <div className="task-progress" aria-label={`本周进度 ${progress}%`}><span style={{ width: `${progress}%` }} /></div>
        <div className="task-balance"><HeartFilledIcon /><strong>{coins}</strong><span>我的甜心币</span></div>
      </div>

      <PartnerCard status={partner} />

      {/* The four daily tasks never change; this does, and both phones show the
          same one so "今天聊这个" actually means something. */}
      <div className="daily-prompt">
        <span className="daily-prompt-tag"><ChatBubbleIcon /> 今天聊点什么</span>
        <p>{prompt.topic}</p>
        <div className="daily-prompt-action"><LightningBoltIcon /> 小行动：{prompt.action}</div>
      </div>

      <div className="task-heading"><div><span>每天零点刷新</span><h2>我的今日任务</h2></div><strong>{daily.filter((task) => claimedTasks.includes(taskClaimKey(task))).length}/{daily.length}</strong></div>
      <div className="task-list">{daily.map(renderTask)}</div>

      {/* Both partners get their own copy of every task, so these headings say
          "我的": one side claiming a task never consumes the other's. */}
      <div className="task-heading weekly"><div><span>每周一刷新</span><h2>我的本周任务</h2></div><strong>{weekly.filter((task) => claimedTasks.includes(taskClaimKey(task))).length}/{weekly.length}</strong></div>
      <div className="task-list">{weekly.map(renderTask)}</div>

      <div className="economy-note"><span><MoonIcon /></span><div><strong>慢慢攒，更值得期待</strong><p>每人每天最多 8 币、每周额外 29 币；合照与订单类任务要真的做过才能领。</p></div></div>
    </section>
  );
}
