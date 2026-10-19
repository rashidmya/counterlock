import { abilityById } from "@/shared/catalog";
import type { Ability } from "@/shared/catalog/types";
import { Picture } from "@/shared/ui/Picture";

const summary = (ability: Ability) =>
  ability.quip ||
  ability.description.match(/^.*?[.!?](?=\s|$)/)?.[0] ||
  ability.description;

const tooltip = (ability: Ability) =>
  [
    ability.name,
    ability.description,
    ...ability.upgrades.flatMap((text, index) =>
      text ? [`T${index + 1}: ${text}`] : [],
    ),
  ]
    .filter(Boolean)
    .join("\n\n");

export function AbilityCards({ abilityIds }: { abilityIds: number[] }) {
  return (
    <div className="ability-cards">
      {abilityIds.map((id, index) => {
        const ability = abilityById.get(id);
        if (!ability) return null;
        const text = summary(ability);
        return (
          <div
            key={id}
            className="ability-card"
            tabIndex={0}
            title={tooltip(ability)}
          >
            <div className="ability-art">
              <Picture src={ability.image} label={ability.name} />
              <span className="ability-number">{index + 1}</span>
            </div>
            <div>
              <strong>{ability.name}</strong>
              {text && <small>{text}</small>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
