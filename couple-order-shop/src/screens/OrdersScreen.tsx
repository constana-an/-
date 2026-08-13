import { useEffect, useRef, useState } from "react";
import { ArchiveIcon, CameraIcon, CheckCircledIcon, CheckIcon, ClockIcon, Cross1Icon, HeartFilledIcon, ResetIcon } from "@radix-ui/react-icons";
import { statusText } from "../lib/catalog";
import { relativeTime } from "../lib/date";
import { KeyboardInput, useKeyboard } from "../mobile";
import type { Order, OrderFilter, OrderStatus } from "../lib/types";
import { MenuArt } from "./MenuArt";

/** Declined and withdrawn orders are finished business, not "进行中". */
const matchesFilter = (order: Order, filter: OrderFilter): boolean => {
  if (filter === "all") return true;
  if (filter === "active") return order.status !== "done" && order.status !== "rejected" && order.status !== "cancelled";
  if (filter === "closed") return order.status === "rejected" || order.status === "cancelled";
  return order.status === filter;
};

const TABS: Array<{ id: OrderFilter; label: string; empty: string }> = [
  { id: "active", label: "进行中", empty: "去小铺点一个新的心愿吧" },
  { id: "done", label: "已完成", empty: "完成的心愿会留在这里" },
  { id: "closed", label: "未完成", empty: "还没有被婉拒或撤回的心愿" },
  { id: "all", label: "全部", empty: "去小铺点一个新的心愿吧" },
];

export function OrdersScreen({
  orders,
  currentName,
  onStatus,
  onCancel,
  onKeepAsMemory,
  focusOrderId,
  onFocusConsumed,
  onBrowseShop,
}: {
  orders: Order[];
  /** Display name of this device's identity; only the recipient may respond. */
  currentName: string;
  onStatus: (id: string, status: OrderStatus, note?: string) => void;
  onCancel: (id: string) => void;
  onKeepAsMemory: (order: Order) => void;
  /** Set when a notification deep-linked to one order. */
  focusOrderId: string | null;
  onFocusConsumed: () => void;
  onBrowseShop: () => void;
}) {
  const [filter, setFilter] = useState<OrderFilter>("active");
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState("");
  const focusRef = useRef<HTMLElement | null>(null);
  const visible = orders.filter((order) => matchesFilter(order, filter));
  const activeTab = TABS.find((tab) => tab.id === filter)!;

  // A notification usually points at an order the default tab cannot show — a
  // finished or declined one — so widen the filter before scrolling to it.
  const focusOrder = focusOrderId ? orders.find((order) => order.id === focusOrderId) : undefined;
  useEffect(() => {
    if (!focusOrder) return;
    if (!matchesFilter(focusOrder, filter)) {
      setFilter("all");
      return;
    }
    focusRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    const timer = window.setTimeout(onFocusConsumed, 3000);
    return () => window.clearTimeout(timer);
  }, [focusOrder, filter, onFocusConsumed]);

  // The decline note owns a text field, so the simulated keyboard has to come
  // down in the same event that closes it — otherwise it covers the bottom nav.
  const keyboard = useKeyboard();
  const startDecline = (id: string) => { setDecliningId(id); setDeclineNote(""); };
  const closeDecline = () => { keyboard.hide(); setDecliningId(null); setDeclineNote(""); };
  const confirmDecline = (id: string) => {
    onStatus(id, "rejected", declineNote.trim() || undefined);
    closeDecline();
  };

  return (
    <section className="page-section orders-page">
      <div className="page-title">
        <div><p>每一份期待都有回应</p><h2>我们的订单</h2></div>
        <span className="round-icon"><ArchiveIcon /></span>
      </div>
      <div className="segment-control four">
        {TABS.map((tab) => (
          <button key={tab.id} className={filter === tab.id ? "active" : ""} aria-pressed={filter === tab.id} onClick={() => setFilter(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>
      <div className="order-list">
        {visible.length === 0 ? (
          <div className="empty-card">
            <CheckCircledIcon /><h3>这里空空的</h3><p>{activeTab.empty}</p>
            <button className="empty-action" onClick={onBrowseShop}>去小铺看看</button>
          </div>
        ) : visible.map((order) => {
          const mine = order.to === currentName;
          const focused = order.id === focusOrderId;
          return (
            <article
              className={`order-card ${focused ? "is-focused" : ""}`}
              key={order.id}
              ref={focused ? (node) => { focusRef.current = node; } : undefined}
            >
              <div className="order-card-top">
                <div className="order-art"><MenuArt item={order} /></div>
                <div className="order-main"><span>{order.from} → {order.to}</span><h3>{order.itemName}</h3><p>{relativeTime(order.createdAt)} · {order.desiredTime}</p></div>
                <span className={`status-badge status-${order.status}`}>{statusText[order.status]}</span>
              </div>
              {order.note && <div className="order-note">“{order.note}”</div>}
              {order.status === "pending" && (mine ? (
                decliningId === order.id ? (
                  <div className="decline-form">
                    <label htmlFor={`decline-${order.id}`}>说一句为什么，会让人好受一些（可不填）</label>
                    <KeyboardInput id={`decline-${order.id}`} value={declineNote} maxLength={40} onChange={(event) => setDeclineNote(event.target.value)} placeholder="例如：今天太累了，明天补给你" />
                    <div className="order-actions">
                      <button className="ghost-action" onClick={closeDecline}>再想想</button>
                      <button className="primary-action" onClick={() => confirmDecline(order.id)}>确认婉拒</button>
                    </div>
                  </div>
                ) : (
                  <div className="order-actions">
                    <button className="ghost-action" onClick={() => startDecline(order.id)}><Cross1Icon /> 婉拒</button>
                    <button className="primary-action" onClick={() => onStatus(order.id, "accepted")}><CheckIcon /> 接单</button>
                  </div>
                )
              ) : (
                <>
                  <div className="order-waiting"><ClockIcon /> 等 {order.to} 接单，婉拒会把甜心币退给你</div>
                  <button className="wide-action ghost" onClick={() => onCancel(order.id)}><ResetIcon /> 撤回这个心愿</button>
                </>
              ))}
              {order.status === "accepted" && (mine
                ? <button className="wide-action" onClick={() => onStatus(order.id, "doing")}><ClockIcon /> 开始准备</button>
                : <div className="order-waiting"><CheckIcon /> {order.to} 已接单</div>)}
              {order.status === "doing" && (mine
                ? <button className="wide-action complete" onClick={() => onStatus(order.id, "done")}><HeartFilledIcon /> 完成心愿</button>
                : <div className="order-waiting"><HeartFilledIcon /> {order.to} 正在准备中</div>)}
              {order.status === "done" && (
                <>
                  <div className="order-waiting"><CheckCircledIcon /> {order.completedAt ? `${relativeTime(order.completedAt)}完成` : "已经完成"}</div>
                  {/* It is already on the timeline; this only adds the photo. */}
                  <button className="wide-action ghost" onClick={() => onKeepAsMemory(order)}><CameraIcon /> 补一张照片和故事</button>
                </>
              )}
              {order.status === "rejected" && (
                <>
                  <div className="order-waiting"><Cross1Icon /> 这次没有接单，{order.price} 甜心币已退回给 {order.from}</div>
                  {order.declineNote && <div className="order-note">“{order.declineNote}”</div>}
                </>
              )}
              {order.status === "cancelled" && (
                <div className="order-waiting"><ResetIcon /> {order.from} 撤回了这个心愿，{order.price} 甜心币已退回</div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
