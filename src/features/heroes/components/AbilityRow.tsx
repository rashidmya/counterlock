import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { abilityById } from "@/shared/catalog";
import type { Ability } from "@/shared/catalog/types";
import { OptionalImage } from "@/shared/ui/OptionalImage";
import { Picture } from "@/shared/ui/Picture";

const UPGRADE_LABELS = ["◆ 1", "◆ 2", "◆ 5"];
const VIEWPORT_MARGIN = 16;
const TIP_OFFSET = 10;
const PRESS_WINDOW_MS = 1000;

function highlighted(description: string, highlights: string[]): ReactNode {
  const ranges: { start: number; end: number }[] = [];
  for (const text of highlights) {
    if (!text) continue;
    let from = description.indexOf(text);
    while (
      from >= 0 &&
      ranges.some(
        (range) => from < range.end && from + text.length > range.start,
      )
    )
      from = description.indexOf(text, from + 1);
    if (from >= 0) ranges.push({ start: from, end: from + text.length });
  }
  ranges.sort((a, b) => a.start - b.start);
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const range of ranges) {
    parts.push(description.slice(cursor, range.start));
    parts.push(
      <b key={range.start} className="hl">
        {description.slice(range.start, range.end)}
      </b>,
    );
    cursor = range.end;
  }
  parts.push(description.slice(cursor));
  return parts.map((part, index) => <Fragment key={index}>{part}</Fragment>);
}

function AbilityTip({ ability, id }: { ability: Ability; id: string }) {
  return (
    <>
      <div className="ability-tip-top">
        <Picture
          className="ability-tip-art"
          src={ability.image}
          label={ability.name}
        />
        <b>{ability.name}</b>
        {ability.cooldown && (
          <em className="ability-cooldown">⟳ {ability.cooldown}</em>
        )}
      </div>
      <p className="ability-desc">
        {highlighted(ability.description, ability.highlights)}
      </p>
      {ability.keyStats.length > 0 && (
        <div className="ability-key-stats">
          {ability.keyStats.map((stat) => (
            <span key={`${id}:${stat.label}`}>
              <OptionalImage src={stat.icon} />
              <b>{stat.value}</b>
              <small>{stat.label}</small>
            </span>
          ))}
        </div>
      )}
      {ability.minorStats.length > 0 && (
        <div className="ability-minor-stats">
          {ability.minorStats.map((stat) => (
            <span key={`${id}:${stat.label}`}>
              {stat.label} <b>{stat.value}</b>
            </span>
          ))}
        </div>
      )}
      <div className="ability-upgrades">
        {UPGRADE_LABELS.map((label, index) => (
          <span key={label}>
            <i>{label}</i>
            {ability.upgrades[index] ?? ""}
          </span>
        ))}
      </div>
    </>
  );
}

export function AbilityRow({ abilityIds }: { abilityIds: number[] }) {
  const prefix = useId();
  const rowRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ type: string; at: number } | null>(null);
  const pressedBy = (stamp: number) =>
    press.current && stamp - press.current.at < PRESS_WINDOW_MS
      ? press.current.type
      : null;
  const [open, setOpen] = useState<number | null>(null);
  const iconId = (id: number) => `${prefix}-icon-${id}`;
  const tipId = (id: number) => `${prefix}-tip-${id}`;

  useLayoutEffect(() => {
    if (open === null) return;
    const place = () => {
      const icon = document.getElementById(iconId(open));
      const tip = document.getElementById(tipId(open));
      if (!icon || !tip) return;
      const home = icon.offsetLeft - TIP_OFFSET;
      tip.style.left = `${home}px`;
      const { left, right } = tip.getBoundingClientRect();
      const limit = document.documentElement.clientWidth - VIEWPORT_MARGIN;
      let shift = right > limit ? limit - right : 0;
      if (left + shift < VIEWPORT_MARGIN) shift = VIEWPORT_MARGIN - left;
      tip.style.left = `${home + shift}px`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  useEffect(() => {
    if (open === null) return;
    const outside = (event: PointerEvent) => {
      if (!rowRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const abilities = abilityIds.flatMap((id, index) => {
    const ability = abilityById.get(id);
    return ability ? [{ ability, key: index + 1 }] : [];
  });

  return (
    <div
      ref={rowRef}
      className="ability-row"
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setOpen(null);
      }}
    >
      {abilities.map(({ ability, key }) => (
        <button
          key={ability.id}
          id={iconId(ability.id)}
          type="button"
          className={`ability-icon ${open === ability.id ? "open" : ""}`}
          aria-label={ability.name}
          aria-describedby={tipId(ability.id)}
          onPointerDown={(event) => {
            press.current = { type: event.pointerType, at: event.timeStamp };
          }}
          onPointerCancel={() => {
            press.current = null;
          }}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") setOpen(ability.id);
          }}
          onFocus={(event) => {
            if (pressedBy(event.timeStamp) === null) setOpen(ability.id);
          }}
          onBlur={() => {
            setOpen((current) => (current === ability.id ? null : current));
          }}
          onClick={(event) => {
            const mouse = pressedBy(event.timeStamp) === "mouse";
            press.current = null;
            setOpen((current) =>
              mouse || current !== ability.id ? ability.id : null,
            );
          }}
        >
          <Picture src={ability.image} label={ability.name} />
          <span className="ability-key" aria-hidden="true">
            {key}
          </span>
        </button>
      ))}
      {abilities.map(({ ability }) => (
        <div
          key={ability.id}
          id={tipId(ability.id)}
          role="tooltip"
          className="ability-tip"
          hidden={open !== ability.id}
        >
          <AbilityTip ability={ability} id={tipId(ability.id)} />
        </div>
      ))}
    </div>
  );
}
