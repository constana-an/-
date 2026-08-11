import { CheckIcon, HeartFilledIcon, MagicWandIcon, PlusIcon } from "@radix-ui/react-icons";
import { Carousel } from "../mobile";
import { MENU, categoryMeta } from "../lib/catalog";
import { savingHint } from "../lib/date";
import type { Category, MenuItem } from "../lib/types";
import { MenuArt } from "./MenuArt";

export function ShopScreen({
  category,
  setCategory,
  onAdd,
  onRandom,
  usedLimitedIds,
}: {
  category: Category;
  setCategory: (category: Category) => void;
  onAdd: (item: MenuItem) => void;
  onRandom: () => void;
  /** Limited coupons already spent by this couple; each one can only be used once. */
  usedLimitedIds: string[];
}) {
  const activeMeta = categoryMeta.find((item) => item.id === category)!;
  const items = MENU.filter((item) => item.category === category);
  return (
    <>
      <Carousel ariaLabel="点单分类" className="category-carousel" contentClassName="category-track">
        {categoryMeta.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`category-chip ${category === item.id ? "is-active" : ""}`}
              onClick={() => setCategory(item.id)}
              aria-pressed={category === item.id}
            >
              <Icon />
              <span>{item.label}</span>
            </button>
          );
        })}
      </Carousel>

      <section className="shop-section">
        <div className="section-heading">
          <div>
            <p>{activeMeta.subtitle}</p>
            <h2>{activeMeta.label}</h2>
          </div>
          <span>{items.length} 个心愿</span>
        </div>

        {category === "food" && (
          <button className="random-card" onClick={onRandom}>
            <span className="random-icon"><MagicWandIcon /></span>
            <span><strong>不知道吃啥？</strong><small>让小铺替你选一个</small></span>
            <span className="random-go"><PlusIcon /></span>
          </button>
        )}

        <div className="menu-list">
          {items.map((item) => {
            const used = Boolean(item.limited) && usedLimitedIds.includes(item.id);
            return (
              <article className={`menu-card ${used ? "is-used" : ""}`} key={item.id}>
                <div className="menu-art" style={{ background: item.tint }}><MenuArt item={item} /></div>
                <div className="menu-copy">
                  <div className="menu-title-row">
                    <h3>{item.name}</h3>
                    {item.limited && <span className="limited-tag">{used ? "已使用" : "限一次"}</span>}
                  </div>
                  <p>{item.description}</p>
                  <div className="price-meta">
                    <div className="price-pill"><HeartFilledIcon /> {item.price}</div>
                    <span>{used ? "这张券已经用掉了" : savingHint(item.price)}</span>
                  </div>
                </div>
                <button
                  className="add-button"
                  onClick={() => onAdd(item)}
                  disabled={used}
                  aria-label={used ? `${item.name}已使用` : `加入${item.name}`}
                >
                  {used ? <CheckIcon /> : <PlusIcon />}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
