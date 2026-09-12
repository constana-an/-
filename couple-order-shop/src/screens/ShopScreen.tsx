import { CheckIcon, HeartFilledIcon, MagicWandIcon, Pencil1Icon, PlusIcon } from "@radix-ui/react-icons";
import { Carousel } from "../shell";
import { MENU, categoryMeta, localizedCategory, localizedItem } from "../lib/catalog";
import { useI18n } from "../i18n";
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
  const { lang, t } = useI18n();
  const activeMeta = localizedCategory(categoryMeta.find((item) => item.id === category)!, lang);
  // The couple's own wishes come first: they are the ones worth rediscovering.
  const items = [
    ...customItems.filter((item) => item.category === category),
    ...MENU.filter((item) => item.category === category),
  ];
  const canCustomise = category !== "limited";
  return (
    <>
      <Carousel ariaLabel={t("shop.categoriesAria")} className="category-carousel" contentClassName="category-track">
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
              <span>{localizedCategory(item, lang).label}</span>
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
          <span>{t("shop.wishCount", { count: items.length })}</span>
        </div>

        <button className="random-card" onClick={onRandom}>
          <span className="random-icon"><MagicWandIcon /></span>
          <span><strong>{category === "food" ? t("shop.randomFood") : t("shop.randomOther")}</strong><small>{t("shop.randomHint", { category: activeMeta.label })}</small></span>
          <span className="random-go"><PlusIcon /></span>
        </button>

        <div className="menu-list">
          {items.map((item) => {
            const used = Boolean(item.limited) && usedLimitedIds.includes(item.id);
            // A new wallet holds 8 and the cheapest wish is 28, so most of the
            // menu is out of reach on day one. Saying it here beats letting
            // someone fill in a time and a note first.
            const short = item.price - coins;
            const copy = localizedItem(item, lang);
            return (
              <article className={`menu-card ${used ? "is-used" : ""} ${short > 0 ? "is-short" : ""}`.trim()} key={item.id}>
                <div className="menu-art" style={{ background: item.tint }}><MenuArt item={item} /></div>
                <div className="menu-copy">
                  <div className="menu-title-row">
                    <h3>{copy.name}</h3>
                    {item.limited && <span className="limited-tag">{used ? t("shop.used") : t("shop.limitedOnce")}</span>}
                    {item.custom && (
                      <button className="custom-edit" onClick={() => onEditCustom(item)} aria-label={t("shop.editAria", { name: copy.name })}>
                        <Pencil1Icon /> {t("shop.ourOwn")}
                      </button>
                    )}
                  </div>
                  <p>{copy.description}</p>
                  <div className="price-meta">
                    <div className="price-pill"><HeartFilledIcon /> {item.price}</div>
                    {used
                      ? <span>{t("shop.couponUsed")}</span>
                      : short > 0 && <span className="price-short">{t("shop.short", { count: short })}</span>}
                  </div>
                </div>
                <button
                  className="add-button"
                  onClick={() => onAdd(item)}
                  disabled={used}
                  aria-label={used ? t("shop.usedAria", { name: copy.name }) : t("shop.addAria", { name: copy.name })}
                >
                  {used ? <CheckIcon /> : <PlusIcon />}
                </button>
              </article>
            );
          })}
          {canCustomise && (
            <button className="add-wish-card" onClick={onAddCustom}>
              <span className="add-wish-icon"><PlusIcon /></span>
              <span><strong>{t("shop.addWish")}</strong><small>{t("shop.addWishHint", { category: activeMeta.label })}</small></span>
            </button>
          )}
        </div>
      </section>
    </>
  );
}
