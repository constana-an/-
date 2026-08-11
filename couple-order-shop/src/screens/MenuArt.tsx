import { HeartFilledIcon, PaperPlaneIcon, StarFilledIcon } from "@radix-ui/react-icons";
import type { MenuItem, Order } from "../lib/types";

export function MenuArt({ item }: { item: MenuItem | Order }) {
  if (item.image) return <img className="menu-art-image" src={item.image} alt="" draggable="false" />;
  const isCare = "category" in item && item.category === "care";
  const isDate = "category" in item && item.category === "date";
  return (
    <span className="menu-art-symbol" aria-hidden="true">
      {isCare ? <HeartFilledIcon /> : isDate ? <PaperPlaneIcon /> : <StarFilledIcon />}
    </span>
  );
}
