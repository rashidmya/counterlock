#!/usr/bin/env python3
"""Build an explicitly adapted copy of the inspected Deadlock Scout 0.2.0 OPK."""
import hashlib
import json
import pathlib
import sys
import zipfile

source, output = map(pathlib.Path, sys.argv[1:3])
expected = "790914305b07fda126cfc02e2fcb6a185445de22df16987b21bc9a6ef467924e"
if hashlib.sha256(source.read_bytes()).hexdigest() != expected:
    raise SystemExit("This adapter only supports the inspected 0.2.0 package; source hash differs.")
with zipfile.ZipFile(source) as archive:
    files = {name: archive.read(name) for name in archive.namelist() if not name.endswith("/")}
manifest = json.loads(files["manifest.json"])
manifest["meta"]["name"] = "Deadlock Scout (Underwolf)"
manifest["meta"]["version"] = "0.2.0.7"
manifest["permissions"] = sorted(set(manifest["permissions"] + ["Web"]))
files["manifest.json"] = json.dumps(manifest, indent=2).encode()
overlay = "assets/overlay-Bhgc8k31.js"
old = "overwolf.windows.getMainWindow().scoutStore"
text = files[overlay].decode()
assert text.count(old) == 1

# Preserve neutral team identity until the provider can identify the local player.
unknown_team = '(0,x.jsx)(ge,{title:`Detected players`,subtitle:`Waiting for your team identity`,players:o.players,state:o,selected:s,enemy:!1,select:c})'
neutral_teams = '(0,x.jsxs)(x.Fragment,{children:[...[2,3].map(team=>(0,x.jsx)(ge,{title:team===2?`Amber`:`Sapphire`,subtitle:`TEAM LINEUP`,players:o.players.filter(player=>player.team===team),state:o,selected:s,enemy:!0,select:e=>c(s===e?null:e)},team)),...(o.players.some(player=>![2,3].includes(player.team))?[(0,x.jsx)(ge,{title:`Unassigned players`,subtitle:`Team unavailable`,players:o.players.filter(player=>![2,3].includes(player.team)),state:o,selected:s,enemy:!1,select:c})]:[])]})'
assert text.count(unknown_team) == 1
text = text.replace(unknown_team, neutral_teams)
hero_label = 'My hero · ${o.heroName}'
assert text.count(hero_label) == 1
text = text.replace(hero_label, 'My hero · ${c?.name??o.heroName}')


# Add inventory icons to each player row, preserving the existing item catalog.
row_name = '(0,x.jsx)(`small`,{children:e.name})'
assert text.count(row_name) == 1
text = text.replace(row_name, row_name + ',(0,x.jsx)(UnderwolfRosterItems,{player:e})')
text += "\n" + pathlib.Path(__file__).with_name("roster-items.js").read_text()
# Distinguish an observed empty inventory from unavailable telemetry.
api = "assets/api-5M0PWBb2.js"
api_text = files[api].decode()
for original, replacement in [
    ('items:o?.items??[]', 'items:o?.items??[],itemsKnown:o?.itemsKnown??false'),
    ('{...c,items:a.items.map', '{...c,itemsKnown:true,items:a.items.map'),
]:
    assert api_text.count(original) == 1
    api_text = api_text.replace(original, replacement)
files[api] = api_text.encode()

files[overlay] = ('import "./underwolf-scout-bridge.js";\n' + text.replace(old, "window.underwolfScoutStore")).encode()
files["assets/underwolf-scout-bridge.js"] = """
import {i as initialState} from "./api-5M0PWBb2.js";
let snapshot = initialState();
const listeners = new Set();
const notice = document.createElement("div");
notice.textContent = "Experimental live data: match clock unavailable";
notice.setAttribute("role", "status");
Object.assign(notice.style, {position:"fixed",bottom:"8px",left:"50%",transform:"translateX(-50%)",zIndex:"9999",padding:"6px 12px",borderRadius:"6px",background:"#263443",color:"#e1edf6",font:"13px system-ui",pointerEvents:"none"});
document.body.append(notice);
window.underwolfScoutStore = {
  getSnapshot: () => snapshot,
  subscribe: callback => { listeners.add(callback); return () => listeners.delete(callback); },
  refresh: () => overwolf.windows.sendMessage("background", "scout:refresh", null, () => {}),
};
overwolf.windows.onMessageReceived.addListener(message => {
  if (message.id !== "scout:snapshot") return;
  snapshot = message.content;
  for (const callback of listeners) callback();
});
overwolf.windows.sendMessage("background", "scout:subscribe", null, () => {});
""".encode()
# Electron handles title dragging natively; interactive header controls stay clickable.
files["assets/overlay-CTq-rvfZ.css"] += b"""
.underwolf-roster-items { display:flex; flex-wrap:wrap; gap:3px; margin-top:5px; max-width:210px; }
.underwolf-roster-item { display:inline-flex; width:24px; height:24px; border-radius:4px; background:#263443; }
.underwolf-roster-item .item-icon { width:24px; height:24px; object-fit:contain; border-radius:4px; }
.underwolf-items-empty { font-size:10px; color:#8d9caa; font-weight:400; }
.unknown-item { margin:auto; color:#c7d1db; }
.app > header { -webkit-app-region: drag; user-select: none; }
.app > header :is(button, input, a, select, textarea, [role="button"]) { -webkit-app-region: no-drag; }
"""
background = "assets/background-BWDn1K0T.js"
files[background] += """
const underwolfPublish = () => overwolf.windows.sendMessage("overlay", "scout:snapshot", {
  ...window.scoutStore.getSnapshot()
}, () => {});
window.scoutStore.subscribe(underwolfPublish);
overwolf.windows.onMessageReceived.addListener(message => {
  if (message.id === "scout:subscribe") underwolfPublish();
  if (message.id === "scout:refresh") window.scoutStore.refresh();
});
""".encode()
output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
    for name, data in files.items():
        archive.writestr(name, data)
print(output)
