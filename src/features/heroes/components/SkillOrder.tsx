import type { CSSProperties } from "react";
import { abilityById } from "@/shared/catalog";
import { Picture } from "@/shared/ui/Picture";

export function SkillOrder({
  abilityIds,
  order,
}: {
  abilityIds: number[];
  order: number[];
}) {
  return (
    <div
      className="skill-order"
      style={{ "--steps": order.length } as CSSProperties}
    >
      {abilityIds.map((id) => {
        const ability = abilityById.get(id);
        return (
          <div
            key={id}
            className="skill-row"
            title={ability?.name}
            aria-label={ability?.name}
          >
            <Picture src={ability?.image} label={ability?.name ?? "Ability"} />
            {order.map((chosen, step) => (
              <span
                key={step}
                className={`skill-cell ${chosen === id ? "chosen" : ""}`}
              >
                {chosen === id ? step + 1 : ""}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}
