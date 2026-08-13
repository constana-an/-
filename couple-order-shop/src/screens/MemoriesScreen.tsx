import { CalendarIcon, CameraIcon, HeartFilledIcon, ImageIcon, LockClosedIcon, Pencil1Icon, PlusIcon, StarFilledIcon, SunIcon } from "@radix-ui/react-icons";
import { dayKeyOf, daysUntilAnniversary, formatStartedOn, isPastOneOff, monthKeyOf, relationshipDays, thisMonthKey } from "../lib/date";
import { cloudEnabled } from "../lib/supabase";
import { MenuArt } from "./MenuArt";
import type { Anniversary, CheckinStatus, CoupleProfile, MemoryEntry, Order } from "../lib/types";

const isPast = (item: Anniversary) => isPastOneOff(item.eventDate, item.repeatsYearly);

const anniversaryHint = (item: Anniversary): string => {
  if (isPast(item)) return "已经过去";
  const days = daysUntilAnniversary(item.eventDate, item.repeatsYearly);
  return days === 0 ? "就是今天" : `还有 ${days} 天`;
};

/** Past one-offs sink to the bottom instead of masquerading as "today". */
const countdownOrder = (item: Anniversary) => (isPast(item) ? Number.MAX_SAFE_INTEGER : daysUntilAnniversary(item.eventDate, item.repeatsYearly));

export function MemoriesScreen({
  orders,
  profile,
  memories,
  anniversaries,
  checkin,
  onCheckin,
  onAddMemory,
  onOpenMemory,
  onAddAnniversary,
  onEditAnniversary,
  paired,
  onPair,
  onPlanDate,
  onWriteWish,
}: {
  orders: Order[];
  profile: CoupleProfile;
  memories: MemoryEntry[];
  anniversaries: Anniversary[];
  checkin: CheckinStatus;
  onCheckin: () => void;
  onAddMemory: () => void;
  onOpenMemory: (memory: MemoryEntry) => void;
  onAddAnniversary: () => void;
  onEditAnniversary: (anniversary: Anniversary) => void;
  /** Photos need the couple's private bucket; everything else works offline. */
  paired: boolean;
  onPair: () => void;
  onPlanDate: () => void;
  onWriteWish: () => void;
}) {
  const done = orders.filter((order) => order.status === "done");
  // The hero counts this calendar month; the all-time total gets its own tile so
  // the two numbers can never be mistaken for each other.
  const month = thisMonthKey();
  // A wish ordered last month but finished today belongs to this month.
  const doneThisMonth = done.filter((order) => monthKeyOf(order.completedAt ?? order.createdAt) === month);
  const days = relationshipDays(profile.startedOn);
  const monthLabel = new Intl.DateTimeFormat("zh-CN", { month: "long" }).format(new Date());
  const sortedAnniversaries = [...anniversaries].sort((a, b) => countdownOrder(a) - countdownOrder(b));
  const nextAnniversary = sortedAnniversaries[0];
  const startedLabel = formatStartedOn(profile.startedOn).replace(/ 年 | 月 | 日/g, ".").replace(/\.$/, "");
  // Finished wishes are the couple's own history and need no curation: newest
  // first, straight from the order list. The album on top is for the photos
  // they choose to add on purpose.
  const timeline = [...done].sort((a, b) =>
    (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt)).slice(0, 20);
  return (
    <section className="page-section memory-page">
      <div className="memory-hero"><span>{monthLabel}的小小幸福</span><strong>{doneThisMonth.length}</strong><p>件这个月一起完成的心愿</p><div className="avatar-pair"><span>{profile.firstName.slice(0, 1)}</span><span>{profile.secondName.slice(0, 1)}</span></div></div>
      <div className="stats-row"><div><HeartFilledIcon /><strong>{days}</strong><span>相爱天数</span></div><div><StarFilledIcon /><strong>{done.length}</strong><span>累计完成</span></div><div><CalendarIcon /><strong>{startedLabel}</strong><span>开始日期</span></div></div>
      <div className="checkin-card">
        <span className="checkin-flame"><SunIcon /></span>
        <div><small>连续签到</small><strong>{checkin.streak} 天</strong><p>每天回来看看，给自己的钱包 +1 甜心币</p></div>
        <button disabled={checkin.checkedToday} onClick={onCheckin}>{checkin.checkedToday ? "今日已签" : "签到 +1"}</button>
      </div>
      <div className="memory-section-heading">
        <div><small>给时间线补上照片</small><h3>照片回忆</h3></div>
        {paired && <button onClick={onAddMemory}><CameraIcon /> 添加</button>}
      </div>
      {!paired ? (
        // Photos live in the couple's private bucket. Offering the picker here
        // would only lead to a "请先登录" toast, so say why instead.
        <div className="locked-section">
          <span><LockClosedIcon /></span>
          {cloudEnabled ? (
            <>
              <strong>照片回忆需要双人空间</strong>
              <p>照片存在你们的私密云空间里，两个人都能看到。去「我们」页创建小铺，或输入对方的情侣码。</p>
              <button onClick={onPair}>去连接双人小铺</button>
            </>
          ) : (
            <>
              <strong>本地体验模式没有相册</strong>
              <p>这台设备还没有云配置。签到、纪念日和订单都会保存在本机，照片需要双人云空间才能收藏。</p>
            </>
          )}
        </div>
      ) : memories.length > 0 ? (
        <div className="memory-grid">
          {memories.map((memory) => (
            <button type="button" key={memory.id} onClick={() => onOpenMemory(memory)} aria-label={`查看回忆 ${memory.caption}`}>
              {memory.imageUrl ? <img src={memory.imageUrl} alt={memory.caption} draggable="false" /> : <span><ImageIcon /></span>}
              <div><strong>{memory.caption}</strong><small>{memory.happenedOn}</small></div>
            </button>
          ))}
        </div>
      ) : (
        <button className="memory-empty" onClick={onAddMemory}><CameraIcon /><strong>收藏第一张合照</strong><span>照片私密保存在双人空间，只有你们两个能看到</span></button>
      )}
      <div className="memory-section-heading"><div><small>打开小铺时提醒你</small><h3>纪念日</h3></div><button onClick={onAddAnniversary}><PlusIcon /> 添加</button></div>
      {nextAnniversary ? (
        <>
          <div className="anniversary-card">
            <div><span><CalendarIcon /></span><div><small>下一个纪念日</small><strong>{nextAnniversary.title}</strong><p>{nextAnniversary.eventDate} · {anniversaryHint(nextAnniversary)}</p></div></div>
            <button onClick={() => onEditAnniversary(nextAnniversary)}>管理</button>
          </div>
          {/* Once it is close enough to be reminded about, the useful thing is
              not another reminder — it is somewhere to start. */}
          {daysUntilAnniversary(nextAnniversary.eventDate, nextAnniversary.repeatsYearly) <= nextAnniversary.reminderDays && (
            <div className="anniversary-ideas">
              <strong>为「{nextAnniversary.title}」做点什么？</strong>
              <div className="anniversary-idea-row">
                <button onClick={onPlanDate}>订一个约会</button>
                <button onClick={onWriteWish}>写一份专属心愿</button>
                <button onClick={paired ? onAddMemory : onPair}>上传一张照片</button>
              </div>
            </div>
          )}
          <div className="anniversary-list">
            {sortedAnniversaries.map((item) => (
              <button type="button" key={item.id} onClick={() => onEditAnniversary(item)} aria-label={`编辑纪念日 ${item.title}`}>
                <span className="anniversary-count">
                  {isPast(item) ? <small>已过</small> : <><strong>{daysUntilAnniversary(item.eventDate, item.repeatsYearly)}</strong><small>天</small></>}
                </span>
                <span className="anniversary-info">
                  <strong>{item.title}</strong>
                  <small>{item.eventDate} · {item.repeatsYearly ? "每年重复" : "仅这一次"} · 提前 {item.reminderDays} 天提醒</small>
                </span>
                <span className="anniversary-edit"><Pencil1Icon /></span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <button className="memory-empty" onClick={onAddAnniversary}><CalendarIcon /><strong>添加第一个纪念日</strong><span>生日、第一次见面、领证日都可以</span></button>
      )}
      <div className="memory-section-heading"><div><small>完成的心愿自动留在这里</small><h3>我们的时间线</h3></div></div>
      {timeline.length > 0 ? (
        <ol className="memory-timeline">
          {timeline.map((order) => (
            <li key={order.id}>
              <span className="timeline-art"><MenuArt item={order} /></span>
              <div>
                <small>{dayKeyOf(order.completedAt ?? order.createdAt) ?? ""} · {order.to} 完成了 {order.from} 点的</small>
                <strong>{order.itemName}</strong>
                {order.note && <p>“{order.note}”</p>}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="memory-card"><div><span className="memory-dot" /><p>还没有开始</p></div><h3>一份认真回应，就是最好的偏爱。</h3><p>完成一个心愿，它就会自己出现在这条时间线上。</p></div>
      )}
    </section>
  );
}
