# SmartAssistantBuilder

A Home Assistant custom panel that lets you build a clean, modern dashboard from your **actual physical devices only** — no helpers, no automations, no diagnostic noise. Step-by-step wizard: pick a room, pick a device, pick what to show.

## Goal

Replace the cluttered default Lovelace experience with an Apple Home-style dashboard creator that surfaces only real-world devices (lights, locks, climate, sensors with a physical source, etc.) and walks you through building rooms and tiles in a guided wizard.

## Context / Constraints

- **Hosting**: Custom HA panel installed via HACS. Lives at the user's HA URL, uses HA's built-in auth.
- **HA setup**: HA OS / Supervised (full).
- **Wizard model**: Room → Device → Tile.
- **Look/feel**: Apple Home style. Dark + light, follows HA theme tokens.
- **Tech**: Lit + TypeScript, Vite for dev, single JS bundle for distribution.
- **Storage**: HA storage (JSON config persisted server-side, backed up with HA).
- **Multi-dashboard**: Supported (Home, Bedtime, Vacation, etc.).
- **Tile UX**: Tap = primary action, long-press = detail sheet (with 24h sparkline), inline slider for dimmable/climate, drag-to-reorder in edit mode.
- **Attribute selection**: Smart defaults per device type, with a "Customize" override.
- **Edit mode**: First-run empty state shows the wizard; afterward, a pencil button reopens it.
- **Dev workflow**: Mock HA fixture first, then connect to real HA.
- **MVP first**, polish later. Mobile + desktop both supported.

## Out of scope (for MVP)

- Replacing Lovelace entirely (panel coexists alongside it).
- Building automations or scenes from inside the panel.
- Energy dashboard, Logbook, History views beyond the per-tile 24h sparkline.
- Custom themes (uses HA's current theme).
- i18n (English only; can add Hebrew later).

## Real-device filter rules

**Include** entities whose domain is one of:
`light, switch, lock, cover, climate, fan, vacuum, media_player, humidifier, water_heater, sensor, binary_sensor`

**Exclude** when any of:
- Domain is `automation`, `script`, `scene`, `input_*`, `counter`, `timer`, `schedule`, `group`, `zone`, `person`, `sun`, `weather` (unless explicitly opted in).
- `entity_category` is `diagnostic` or `config`.
- Entity is `disabled_by` not null in the registry.
- State is `unavailable` or `unknown` at filter time (still listed but greyed; not auto-added).
- For `sensor` / `binary_sensor`: must have a `device_id` with a manufacturer in the device registry (filters out template/synthetic sensors with no physical source).

## Architecture

```
SmartAssistantBuilder/
├── src/
│   ├── panel.ts                # Custom panel entry, registers <smart-assistant-panel>
│   ├── ha/
│   │   ├── adapter.ts          # Hass-like interface (subscribe, callService, getHistory)
│   │   ├── adapter.real.ts     # Uses panel's hass prop (WebSocket + REST)
│   │   ├── adapter.mock.ts     # Fixture-based for dev
│   │   └── filter.ts           # Real-device filter logic
│   ├── store/
│   │   ├── dashboards.ts       # Dashboard CRUD + persistence
│   │   └── storage.ts          # HA storage collection wrapper
│   ├── wizard/
│   │   ├── wizard.ts           # State machine (room → device → tile)
│   │   ├── step-room.ts
│   │   ├── step-device.ts
│   │   └── step-tile.ts        # Smart-default attribute picker
│   ├── tiles/
│   │   ├── tile-light.ts
│   │   ├── tile-switch.ts
│   │   ├── tile-lock.ts
│   │   ├── tile-cover.ts
│   │   ├── tile-climate.ts
│   │   ├── tile-media.ts
│   │   ├── tile-sensor.ts
│   │   └── detail-sheet.ts     # Long-press bottom sheet with sparkline
│   ├── components/
│   │   ├── dashboard-selector.ts
│   │   ├── room-section.ts
│   │   ├── tile-grid.ts
│   │   ├── sparkline.ts        # Tiny SVG sparkline, no chart lib
│   │   └── icon.ts
│   ├── theme.ts                # Reads HA CSS vars + Apple-Home tokens
│   └── types.ts                # Dashboard, Room, Tile, AttributeBinding
├── hacs.json
├── manifest.json (if a small custom_component is needed for storage)
├── package.json
├── vite.config.ts
└── README.md
```

## Data model (sketch)

```ts
type Dashboard = {
  id: string;
  name: string;
  rooms: Room[];
};
type Room = {
  id: string;
  name: string;
  areaId?: string;        // links to HA area, optional
  tiles: Tile[];
};
type Tile = {
  id: string;
  entityId: string;
  type: 'light' | 'switch' | 'lock' | 'cover' | 'climate' | 'media' | 'sensor';
  attributes: string[];   // attributes to surface on the tile face
  primaryAction?: 'toggle' | 'open' | 'lock' | 'unlock' | 'play_pause' | 'none';
};
```

## Steps

- [ ] **1. Scaffold panel project** (Lit + TS + Vite + HACS metadata)
- [ ] **2. Build mock HA data layer** (fixtures + adapter interface)
- [ ] **3. Implement real-device filter** (domains + exclusions + device-registry check)
- [ ] **4. Design wizard in Stitch + build it** (room → device → tile, smart defaults, customize)
- [ ] **5. Build Apple Home-style tile components** (all device types, tap/long-press/slider, dark+light)
- [ ] **6. Build detail sheet with 24h sparkline** (long-press → bottom sheet)
- [ ] **7. Multi-dashboard + storage** (top selector, CRUD, HA-side persistence)
- [ ] **8. Wire up real HA connection** (swap mock adapter, verify on user's HA OS)
- [ ] **9. Drag-to-reorder in edit mode**
- [ ] **10. Publish to GitHub + HACS** (repo, workflow, README, screenshots)

## Status

- [x] **1. Scaffold panel project** - Lit 3 + TS + Vite, single ESM bundle, hacs.json, dev.html shell. Build outputs `dist/smart-assistant-builder.js` (31.5 KB / 9.98 KB gzipped).
- [x] **2. Mock HA data layer** - `src/ha/adapter.mock.ts` with 5 areas, 14 real devices (lights, locks, climate, sensors, fan, vacuum, media, plug, garage), plus 6 noise entities (automation, script, scene, helper, template, disabled).
- [x] **3. Real-device filter** - `src/ha/filter.ts` implements all exclusion rules. Verified: noise entities are dropped, sensors without manufacturer are dropped, disabled and unavailable are dropped.
- [ ] 4. Wizard
- [ ] 5. Tile components
- [ ] 6. Detail sheet + sparkline
- [ ] 7. Multi-dashboard + storage
- [ ] 8. Real HA wiring
- [ ] 9. Drag-to-reorder
- [ ] 10. HACS publish

## Open questions

- **GitHub repo name**: `ha-smart-assistant-builder` proposed — confirm.
- **Storage approach**: HA frontend has a JS-only storage collection that can store arbitrary JSON via WebSocket; if that proves too constrained, add a small `custom_component` for storage. Decide after step 7 prototype.
- **HA URL for real-instance testing** when we reach step 8 — long-lived access token will be needed if we test outside the HA frontend during development; if installed as a panel, the `hass` object is passed in automatically.
- **Mobile companion app integration**: Custom panels work in the HA mobile app for free; nothing extra needed unless we want haptics / native gestures.
- **HACS submission to default**: do we want listed in HACS default, or keep as a custom repo install?
