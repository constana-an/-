import { CheckIcon, HeartFilledIcon, MoonIcon, TargetIcon } from "@radix-ui/react-icons";
import { TASKS, WEEKLY_PERSONAL_GOAL, taskClaimKey } from "../lib/catalog";
import { todayKey, weekKey } from "../lib/date";
import type { CoupleTask } from "../lib/types";

export function TasksScreen({
  coins,
  claimedTasks,
  onClaim,
}: {
  coins: number;
  /** Only the current person's claims — both partners earn their own rewards. */
  claimedTasks: string[];
  onClaim: (task: CoupleTask) => void;
}) {
  const daily = TASKS.filter((task) => task.frequency === "daily");
  const weekly = TASKS.filter((task) => task.frequency === "weekly");
  const monday = weekKey();
  const now = todayKey();
  const earnedThisWeek = claimedTasks.reduce((sum, key) => {
    const [period, id] = key.split(":");
    if (period < monday || period > now) return sum;
    return sum + (TASKS.find((task) => task.id === id)?.reward ?? 0);
  }, 0);
  const progress = Math.min(100, Math.round((earnedThisWeek / WEEKLY_PERSONAL_GOAL) * 100));

  const renderTask = (task: CoupleTask) => {
    const claimed = claimedTasks.includes(taskClaimKey(task));
    const Icon = task.icon;
    return (
      <article className={`task-card tone-${task.tone}`} key={task.id}>
        <span className="task-icon"><Icon /></span>
        <div className="task-copy"><h3>{task.title}</h3><p>{task.description}</p></div>
        <button className={claimed ? "claimed" : ""} disabled={claimed} onClick={() => onClaim(task)}>
          {claimed ? <><CheckIcon /> 已领取</> : <><HeartFilledIcon /> +{task.reward}</>}
        </button>
      </article>
    );
  };

  return (
    <section className="page-section tasks-page">
      <div className="task-hero">
        <div className="task-hero-top"><span><TargetIcon /> 我这周攒币计划</span><strong>{earnedThisWeek} / {WEEKLY_PERSONAL_GOAL}</strong></div>
        <h2>认真相爱，也会有奖励</h2>
        <p>两个人各自领取自己的奖励，一起攒进同一个钱包。</p>
        <div className="task-progress" aria-label={`本周进度 ${progress}%`}><span style={{ width: `${progress}%` }} /></div>
        <div className="task-balance"><HeartFilledIcon /><strong>{coins}</strong><span>双人共同甜心币</span></div>
      </div>

      <div className="task-heading"><div><span>每天零点刷新</span><h2>今日小任务</h2></div><strong>{daily.filter((task) => claimedTasks.includes(taskClaimKey(task))).length}/{daily.length}</strong></div>
      <div className="task-list">{daily.map(renderTask)}</div>

      <div className="task-heading weekly"><div><span>每周一刷新</span><h2>本周共同任务</h2></div><strong>{weekly.filter((task) => claimedTasks.includes(taskClaimKey(task))).length}/{weekly.length}</strong></div>
      <div className="task-list">{weekly.map(renderTask)}</div>

      <div className="economy-note"><span><MoonIcon /></span><div><strong>慢慢攒，更值得期待</strong><p>两人合计每天最多 8 币、每周额外 28 币；食物也要攒数天，服务与约会通常需要两周以上。</p></div></div>
    </section>
  );
}
