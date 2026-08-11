import { useState } from "react";
import { ArchiveIcon, CheckCircledIcon, CheckIcon, ClockIcon, Cross1Icon, HeartFilledIcon } from "@radix-ui/react-icons";
import { statusText } from "../lib/catalog";
import { relativeTime } from "../lib/date";
import type { Order, OrderStatus } from "../lib/types";
import { MenuArt } from "./MenuArt";

export function OrdersScreen({
  orders,
  currentName,
  onStatus,
}: {
  orders: Order[];
  /** Display name of this device's identity; only the recipient may respond. */
  currentName: string;
  onStatus: (id: string, status: OrderStatus) => void;
}) {
  const [filter, setFilter] = useState<"active" | "done">("active");
  const visible = orders.filter((order) => (filter === "done" ? order.status === "done" : order.status !== "done"));
  return (
    <section className="page-section orders-page">
      <div className="page-title">
        <div><p>每一份期待都有回应</p><h2>我们的订单</h2></div>
        <span className="round-icon"><ArchiveIcon /></span>
      </div>
      <div className="segment-control">
        <button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>进行中</button>
        <button className={filter === "done" ? "active" : ""} onClick={() => setFilter("done")}>已完成</button>
      </div>
      <div className="order-list">
        {visible.length === 0 ? (
          <div className="empty-card"><CheckCircledIcon /><h3>这里空空的</h3><p>去小铺点一个新的心愿吧</p></div>
        ) : visible.map((order) => {
          const mine = order.to === currentName;
          return (
            <article className="order-card" key={order.id}>
              <div className="order-card-top">
                <div className="order-art"><MenuArt item={order} /></div>
                <div className="order-main"><span>{order.from} → {order.to}</span><h3>{order.itemName}</h3><p>{relativeTime(order.createdAt)} · {order.desiredTime}</p></div>
                <span className={`status-badge status-${order.status}`}>{statusText[order.status]}</span>
              </div>
              {order.note && <div className="order-note">“{order.note}”</div>}
              {order.status === "pending" && (mine ? (
                <div className="order-actions">
                  <button className="ghost-action" onClick={() => onStatus(order.id, "rejected")}><Cross1Icon /> 婉拒</button>
                  <button className="primary-action" onClick={() => onStatus(order.id, "accepted")}><CheckIcon /> 接单</button>
                </div>
              ) : (
                <div className="order-waiting"><ClockIcon /> 等 {order.to} 接单，婉拒会把甜心币退给你</div>
              ))}
              {order.status === "accepted" && (mine
                ? <button className="wide-action" onClick={() => onStatus(order.id, "doing")}><ClockIcon /> 开始准备</button>
                : <div className="order-waiting"><CheckIcon /> {order.to} 已接单</div>)}
              {order.status === "doing" && (mine
                ? <button className="wide-action complete" onClick={() => onStatus(order.id, "done")}><HeartFilledIcon /> 完成心愿</button>
                : <div className="order-waiting"><HeartFilledIcon /> {order.to} 正在准备中</div>)}
            </article>
          );
        })}
      </div>
    </section>
  );
}
