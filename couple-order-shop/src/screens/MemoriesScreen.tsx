import { CalendarIcon, CameraIcon, HeartFilledIcon, ImageIcon, StarFilledIcon, SunIcon } from "@radix-ui/react-icons";
import { daysUntilAnniversary, formatStartedOn, relationshipDays } from "../lib/date";
import type { Anniversary, CheckinStatus, CoupleProfile, MemoryEntry, Order } from "../lib/types";

export function MemoriesScreen({
  orders,
  profile,
  memories,
  anniversaries,
  checkin,
  onCheckin,
  onAddMemory,
  onAddAnniversary,
}: {
  orders: Order[];
  profile: CoupleProfile;
  memories: MemoryEntry[];
  anniversaries: Anniversary[];
  checkin: CheckinStatus;
  onCheckin: () => void;
  onAddMemory: () => void;
  onAddAnniversary: () => void;
}) {
  const done = orders.filter((order) => order.status === "done");
  const days = relationshipDays(profile.startedOn);
  const monthLabel = new Intl.DateTimeFormat("zh-CN", { month: "long" }).format(new Date());
  const nextAnniversary = [...anniversaries].sort(
    (a, b) => daysUntilAnniversary(a.eventDate, a.repeatsYearly) - daysUntilAnniversary(b.eventDate, b.repeatsYearly),
  )[0];
  const startedLabel = formatStartedOn(profile.startedOn).replace(/ 年 | 月 | 日/g, ".").replace(/\.$/, "");
  return (
    <section className="page-section memory-page">
      <div className="memory-hero"><span>{monthLabel}的小小幸福</span><strong>{done.length}</strong><p>件一起完成的心愿</p><div className="avatar-pair"><span>{profile.firstName.slice(0, 1)}</span><span>{profile.secondName.slice(0, 1)}</span></div></div>
      <div className="stats-row"><div><HeartFilledIcon /><strong>{days}</strong><span>相爱天数</span></div><div><StarFilledIcon /><strong>{orders.length}</strong><span>甜蜜订单</span></div><div><CalendarIcon /><strong>{startedLabel}</strong><span>开始日期</span></div></div>
      <div className="checkin-card">
        <span className="checkin-flame"><SunIcon /></span>
        <div><small>连续签到</small><strong>{checkin.streak} 天</strong><p>每天一起回来看看，获得 1 甜心币</p></div>
        <button disabled={checkin.checkedToday} onClick={onCheckin}>{checkin.checkedToday ? "今日已签" : "签到 +1"}</button>
      </div>
      <div className="memory-section-heading"><div><small>只属于你们的相册</small><h3>照片回忆</h3></div><button onClick={onAddMemory}><CameraIcon /> 添加</button></div>
      {memories.length > 0 ? (
        <div className="memory-grid">
          {memories.map((memory) => (
            <article key={memory.id}>
              {memory.imageUrl ? <img src={memory.imageUrl} alt={memory.caption} draggable="false" /> : <span><ImageIcon /></span>}
              <div><strong>{memory.caption}</strong><small>{memory.happenedOn}</small></div>
            </article>
          ))}
        </div>
      ) : (
        <button className="memory-empty" onClick={onAddMemory}><CameraIcon /><strong>收藏第一张合照</strong><span>照片会加密保存在双人空间</span></button>
      )}
      <div className="anniversary-card">
        <div><span><CalendarIcon /></span><div><small>下一个纪念日</small><strong>{nextAnniversary?.title ?? "还没有添加纪念日"}</strong><p>{nextAnniversary ? `${nextAnniversary.eventDate} · 还有 ${daysUntilAnniversary(nextAnniversary.eventDate, nextAnniversary.repeatsYearly)} 天` : "生日、第一次见面、领证日都可以"}</p></div></div>
        <button onClick={onAddAnniversary}>{nextAnniversary ? "管理" : "添加"}</button>
      </div>
      <div className="memory-card"><div><span className="memory-dot" /><p>今天</p></div><h3>一份认真回应，就是最好的偏爱。</h3><p>{done.length ? `你们已经认真完成了 ${done.length} 份心愿。` : "完成的订单和上传的照片，会一起留在这里。"}</p></div>
    </section>
  );
}
