import { useState } from "react";
import type { Item } from "@/shared/catalog/types";
import { assetUrl } from "./assets";

export function ItemIcon({
  item,
  className = "",
}: {
  item: Item;
  className?: string;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const localImage = item.localImage ? assetUrl(item.localImage) : undefined;
  const src = [localImage, item.image].find(
    (url): url is string => !!url && !failed.includes(url),
  );
  const classes = `item-icon ${item.category} ${className}`;
  return src ? (
    <img
      className={classes}
      src={src}
      alt={item.name}
      onError={() => setFailed((current) => [...current, src])}
    />
  ) : (
    <span
      className={`${classes} placeholder`}
      aria-label={`${item.name} image unavailable`}
    >
      {item.name.slice(0, 2).toUpperCase()}
    </span>
  );
}
