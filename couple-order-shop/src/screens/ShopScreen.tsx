import { CheckIcon, HeartFilledIcon, MagicWandIcon, Pencil1Icon, PlusIcon } from "@radix-ui/react-icons";
import { Carousel } from "../shell";
import { MENU, categoryMeta } from "../lib/catalog";
import type { Category, MenuItem } from "../lib/types";
import { MenuArt } from "./MenuArt";

export function ShopScreen({
  category,
  setCategory,
  onAdd,
  onRandom,
  usedLimitedIds,
  customItems,
  onAddCustom,
  onEditCustom,
  coins,
}: {
  category: Category;
  setCategory: (category: Category) => void;
  onAdd: (item: MenuItem) => void;
  onRandom: () => void;
  /** Limited coupons already spent by this couple; each one can only be used once. */
  usedLimitedIds: string[];
  /** Wishes this couple wrote themselves, already scoped to their own shop. */
  customItems: MenuItem[];
  onAddCustom: () => void;
  onEditCustom: (item: MenuItem) => void;
  /** Spending power, so a wish out of reach says so before it is tapped. */
  coins: number;
}) {
  const activeMeta = categoryMeta.find((item) => item.id === category)!;
  // The couple's own wishes come first: they are the ones worth rediscovering.
  const items = [
    ...customItems.filter((item) => item.category === category),
    ...MENU.filter((item) => item.category === category),
  ];
  const canCustomise = category !== "limited";
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

        <button className="random-card" onClick={onRandom}>
          <span className="random-icon"><MagicWandIcon /></span>
          <span><strong>{category === "food" ? "不知道吃啥？" : "拿不定主意？"}</strong><small>让小铺从「{activeMeta.label}」里替你选一个</small></span>
          <span className="random-go"><PlusIcon /></span>
        </button>

        <div className="menu-list">
          {items.map((item) => {
            const used = Boolean(item.limited) && usedLimitedIds.includes(item.id);
            // A new wallet holds 8 and the cheapest wish is 28, so most of the
            // menu is out of reach on day one. Saying it here beats letting
            // someone fill in a time and a note first.
            const short = item.price - coins;
            return (
              <article className={`menu-card ${used ? "is-used" : ""} ${short > 0 ? "is-short" : ""}`.trim()} key={item.id}>
                <div className="menu-art" style={{ background: item.tint }}><MenuArt item={item} /></div>
                <div className="menu-copy">
                  <div className="menu-title-row">
                    <h3>{item.name}</h3>
                    {item.limited && <span className="limited-tag">{used ? "已使用" : "限一次"}</span>}
                    {item.custom && (
                      <button className="custom-edit" onClick={() => onEditCustom(item)} aria-label={`编辑${item.name}`}>
                        <Pencil1Icon /> 我们写的
                      </button>
                    )}
                  </div>
                  <p>{item.description}</p>
                  <div className="price-meta">
                    <div className="price-pill"><HeartFilledIcon /> {item.price}</div>
                    {used
                      ? <span>这张券已经用掉了</span>
                      : short > 0 && <span className="price-short">还差 {short} 币</span>}
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
          {canCustomise && (
            <button className="add-wish-card" onClick={onAddCustom}>
              <span className="add-wish-icon"><PlusIcon /></span>
              <span><strong>写一个我们自己的心愿</strong><small>只属于你们的{activeMeta.label}，价格自己定</small></span>
            </button>
          )}
        </div>
      </section>
    </>
  );
}
