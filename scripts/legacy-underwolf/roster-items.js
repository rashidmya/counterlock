// Injected into the hash-verified Scout overlay bundle by build.py.
// x/ie/ae are its React JSX runtime, ItemIcon component, and bundled catalog.
function UnderwolfRosterItems({ player }) {
  const items = Array.isArray(player.items) ? player.items : [];
  return (0, x.jsx)("span", {
    className: "underwolf-roster-items",
    "aria-label": "Purchased items",
    children: items.length
      ? items.map((id, index) => {
          const item = ae.items.find((entry) => entry.id === id);
          const name = item?.name ?? `Unknown item #${id}`;
          return (0, x.jsx)("span", {
            className: "underwolf-roster-item",
            title: name,
            "aria-label": name,
            "data-item-id": String(id),
            children: item
              ? (0, x.jsx)(ie, { item })
              : (0, x.jsx)("span", { className: "unknown-item", children: "?" }),
          }, `${id}:${index}`);
        })
      : (0, x.jsx)("span", {
          className: "underwolf-items-empty",
          children: player.itemsKnown ? "No purchased items" : "Items unavailable",
        }),
  });
}
