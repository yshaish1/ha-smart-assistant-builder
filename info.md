# Smart Assistant Builder

Apple Home-style HA panel that builds dashboards from your real physical devices only. Three-step wizard (Room -> Device -> Tile), smart attribute defaults, long-press detail sheet with 24h sparkline, and multi-dashboard support. Multi-dashboard, drag-to-reorder, dark + light theme.

## After install

Add this to your `configuration.yaml`:

```yaml
panel_custom:
  - name: smart-assistant-panel
    sidebar_title: Smart
    sidebar_icon: mdi:home-heart
    url_path: smart-builder
    module_url: /hacsfiles/ha-smart-assistant-builder/smart-assistant-builder.js
```

Restart Home Assistant. Open the new "Smart" entry from the sidebar.
