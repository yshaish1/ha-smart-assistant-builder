# Smart Assistant Builder

An Apple Home-style Home Assistant panel that builds dashboards from your **actual physical devices only** - no helpers, no automations, no diagnostic noise.

A guided wizard walks you through Room -> Device -> Tile, surfacing only lights, switches, locks, covers, climate, fans, vacuums, media players, and physical sensors. Tap a tile for the primary action, long-press for a detail sheet with a 24h history sparkline, and drag tiles around in edit mode.

## Highlights

- **Real devices only.** Helpers, automations, scripts, scenes, diagnostic and config entities, disabled entities, and template sensors with no device are all hidden by default.
- **Three-step wizard.** Pick rooms (from your HA Areas), pick devices, customize tiles. Smart defaults pre-pick the most useful attributes per device family.
- **Apple Home tiles.** Tap = primary action, long-press = detail sheet, inline slider for brightness / fan speed / cover position, drag-to-reorder in edit mode.
- **Multi-dashboard.** Build separate views for Home, Bedtime, Vacation. Switch from the top tabs.
- **Theme-aware.** Reads HA's CSS variables, blends with both dark and light themes.
- **Tiny bundle.** ~80 KB minified, ~20 KB gzipped. Lit only, no chart library.
- **HA storage.** Config persists via HA's frontend storage so it follows you across devices.

## Install via HACS (custom repository)

1. Open HACS in your Home Assistant.
2. Go to **Frontend** -> three-dot menu -> **Custom repositories**.
3. Add the repository URL of this project, choose **Lovelace** (frontend) as the category, and click **Add**.
4. Find **Smart Assistant Builder** in the HACS Frontend list, click **Download**.
5. Add this to your `configuration.yaml`:

   ```yaml
   panel_custom:
     - name: smart-assistant-panel
       sidebar_title: Smart
       sidebar_icon: mdi:home-heart
       url_path: smart-builder
       module_url: /hacsfiles/ha-smart-assistant-builder/smart-assistant-builder.js
   ```

6. Restart Home Assistant. A new **Smart** entry appears in the left sidebar.

The first time you open it, the empty-state screen invites you to create your first dashboard. The wizard takes about 30 seconds end-to-end.

## Manual install (no HACS)

1. Build the bundle locally: `npm install && npm run build`.
2. Copy `dist/smart-assistant-builder.js` to `<config>/www/smart-assistant-builder/smart-assistant-builder.js`.
3. Add the same `panel_custom` block to `configuration.yaml`, but use this `module_url`:

   ```yaml
   module_url: /local/smart-assistant-builder/smart-assistant-builder.js
   ```

4. Restart Home Assistant.

## Develop

```bash
npm install
npm run dev   # http://localhost:5173/dev.html with mocked HA fixture + localStorage
npm run build # produces dist/smart-assistant-builder.js
```

The dev shell uses an in-memory mock adapter with 5 areas and 14 real devices, plus 6 entries that should be filtered out (an automation, a script, a scene, a helper, a template sensor, a disabled bulb). Use it to verify the filter rules and iterate on the UI without restarting HA.

## What is hidden

The filter excludes anything that matches **any** of:

- Domain in `automation`, `script`, `scene`, `input_*`, `counter`, `timer`, `schedule`, `group`, `zone`, `person`, `sun`, `weather`.
- `entity_category` is `diagnostic` or `config`.
- `disabled_by` or `hidden_by` is set in the entity registry.
- State is `unavailable` or `unknown`.
- For `sensor` and `binary_sensor`: must be tied to a device with a manufacturer (filters out template / synthetic sensors).

If you ever need to see something that's hidden, a "Show all" toggle is on the roadmap.

## Project layout

```
src/
  panel.ts                 - top-level custom panel element
  ha/
    adapter.ts             - HassAdapter interface
    adapter.real.ts        - HA WebSocket + state adapter
    adapter.mock.ts        - dev fixture
    filter.ts              - real-device filter
    history.ts             - 24h history fetcher (mock for now)
  store/
    storage.ts             - storage interface + key
    storage.ha.ts          - HA frontend storage (real)
    storage.local.ts       - localStorage (dev)
    dashboards.ts          - dashboard / room / tile CRUD helpers
  wizard/
    wizard.ts              - Room -> Device -> Tile state machine
  components/
    dashboard-tile.ts      - the tile element
    bottom-sheet.ts        - reusable bottom sheet
    detail-sheet.ts        - long-press device detail
    sparkline.ts           - 24h SVG sparkline
  tiles/
    smart-defaults.ts      - per-family default attributes + primary action
  types.ts
  main.ts                  - entry that registers the custom element
hacs.json                  - HACS frontend metadata
vite.config.ts             - single ESM bundle output
```

## Roadmap

- v1: scaffold, mock, filter, wizard, tiles, detail sheet, multi-dashboard, drag-reorder, real HA integration, HACS publish.
- v1.x: real HA history (replace mock sparkline source), "Show all" toggle, per-tile size, bilingual (he + en) i18n.
- v2: scenes, energy, camera/doorbell, theme accent picker.

## License

MIT.
