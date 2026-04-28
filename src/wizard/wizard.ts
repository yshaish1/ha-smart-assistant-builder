import { LitElement, css, html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HassAdapter } from '../ha/adapter.js';
import type { Dashboard, RealDevice, Room, Tile } from '../types.js';
import { groupByArea, listRealDevices } from '../ha/filter.js';
import { familyIcon, smartDefaultsFor } from '../tiles/smart-defaults.js';
import { uid } from '../store/dashboards.js';

type Step = 'rooms' | 'devices' | 'tiles';

interface DraftRoom {
  id: string;
  name: string;
  areaId?: string;
  selected: boolean;
}

@customElement('sab-wizard')
export class SabWizard extends LitElement {
  @property({ attribute: false }) adapter!: HassAdapter;
  @property({ attribute: false }) dashboard!: Dashboard;

  @state() private step: Step = 'rooms';
  @state() private rooms: DraftRoom[] = [];
  @state() private currentRoomIdx = 0;
  @state() private selectedDevices = new Map<string, Set<string>>();
  @state() private customizedAttrs = new Map<string, Set<string>>();

  override connectedCallback(): void {
    super.connectedCallback();
    this.initRooms();
  }

  private initRooms(): void {
    const areas = this.adapter.getAreaRegistry();
    const existing = new Map(this.dashboard.rooms.map(r => [r.areaId ?? `__${r.id}`, r]));
    const drafts: DraftRoom[] = areas.map(a => ({
      id: existing.get(a.area_id)?.id ?? uid(),
      name: existing.get(a.area_id)?.name ?? a.name,
      areaId: a.area_id,
      selected: existing.has(a.area_id),
    }));
    drafts.push({ id: uid(), name: 'Unassigned', selected: false });
    this.rooms = drafts;
  }

  private toggleRoom(idx: number): void {
    const next = this.rooms.slice();
    next[idx] = { ...next[idx]!, selected: !next[idx]!.selected };
    this.rooms = next;
  }

  private renameRoom(idx: number, name: string): void {
    const next = this.rooms.slice();
    next[idx] = { ...next[idx]!, name };
    this.rooms = next;
  }

  private addCustomRoom(): void {
    this.rooms = [...this.rooms.filter(r => r.name !== 'Unassigned'), { id: uid(), name: 'New Room', selected: true }, { id: uid(), name: 'Unassigned', selected: false }];
  }

  private get selectedRooms(): DraftRoom[] { return this.rooms.filter(r => r.selected); }

  private goToDevices(): void {
    if (this.selectedRooms.length === 0) return;
    this.step = 'devices';
    this.currentRoomIdx = 0;
  }

  private toggleDevice(roomId: string, entityId: string): void {
    const set = new Map(this.selectedDevices);
    const cur = new Set(set.get(roomId) ?? []);
    if (cur.has(entityId)) cur.delete(entityId); else cur.add(entityId);
    set.set(roomId, cur);
    this.selectedDevices = set;
  }

  private nextRoomOrTiles(): void {
    if (this.currentRoomIdx < this.selectedRooms.length - 1) {
      this.currentRoomIdx += 1;
    } else {
      this.step = 'tiles';
    }
  }

  private prevRoom(): void {
    if (this.currentRoomIdx > 0) this.currentRoomIdx -= 1;
    else this.step = 'rooms';
  }

  private toggleAttr(entityId: string, attr: string): void {
    const map = new Map(this.customizedAttrs);
    const cur = new Set(map.get(entityId) ?? []);
    if (cur.has(attr)) cur.delete(attr); else cur.add(attr);
    map.set(entityId, cur);
    this.customizedAttrs = map;
  }

  private finish(): void {
    const allDevices = listRealDevices(this.adapter);
    const byEntity = new Map(allDevices.map(d => [d.entityId, d]));
    const newRooms: Room[] = [];
    for (const draft of this.selectedRooms) {
      const entityIds = Array.from(this.selectedDevices.get(draft.id) ?? []);
      const tiles: Tile[] = entityIds.map(eid => {
        const dev = byEntity.get(eid)!;
        const def = smartDefaultsFor(dev.family);
        const customized = this.customizedAttrs.get(eid);
        return {
          id: uid(),
          entityId: eid,
          family: dev.family,
          attributes: customized ? Array.from(customized) : def.attributes,
          primaryAction: def.primaryAction,
          size: 'medium',
        };
      });
      newRooms.push({
        id: draft.id,
        name: draft.name,
        ...(draft.areaId ? { areaId: draft.areaId } : {}),
        tiles,
      });
    }

    const merged = mergeRooms(this.dashboard.rooms, newRooms);
    const updated: Dashboard = { ...this.dashboard, rooms: merged };
    this.dispatchEvent(new CustomEvent('wizard-done', { bubbles: true, composed: true, detail: { dashboard: updated } }));
  }

  private cancel(): void {
    this.dispatchEvent(new CustomEvent('wizard-cancel', { bubbles: true, composed: true }));
  }

  override render(): TemplateResult {
    return html`
      <div class="overlay">
        <div class="wizard">
          <header>
            <div class="step-dots">
              <span class="dot ${this.step === 'rooms' ? 'active' : ''}"></span>
              <span class="dot ${this.step === 'devices' ? 'active' : ''}"></span>
              <span class="dot ${this.step === 'tiles' ? 'active' : ''}"></span>
            </div>
            <button class="x" @click=${this.cancel}>×</button>
          </header>
          ${this.renderStep()}
        </div>
      </div>
    `;
  }

  private renderStep(): TemplateResult {
    if (this.step === 'rooms') return this.renderRooms();
    if (this.step === 'devices') return this.renderDevices();
    return this.renderTiles();
  }

  private renderRooms(): TemplateResult {
    return html`
      <h1>Pick rooms</h1>
      <p class="sub">We start from your Home Assistant Areas. Add or rename as you like.</p>
      <div class="rooms-grid">
        ${this.rooms.map((r, i) => html`
          <button
            class="room-pick ${r.selected ? 'selected' : ''}"
            @click=${() => this.toggleRoom(i)}
          >
            <input
              class="room-name"
              .value=${r.name}
              @click=${(e: Event) => e.stopPropagation()}
              @input=${(e: Event) => this.renameRoom(i, (e.target as HTMLInputElement).value)}
            />
            <span class="check">${r.selected ? '✓' : '+'}</span>
          </button>
        `)}
      </div>
      <button class="add" @click=${this.addCustomRoom}>+ Add custom room</button>
      <footer>
        <button class="ghost" @click=${this.cancel}>Cancel</button>
        <button class="primary" ?disabled=${this.selectedRooms.length === 0} @click=${this.goToDevices}>Next: Pick devices</button>
      </footer>
    `;
  }

  private renderDevices(): TemplateResult {
    const room = this.selectedRooms[this.currentRoomIdx];
    if (!room) return html``;
    const allDevices = listRealDevices(this.adapter);
    const byArea = groupByArea(allDevices);
    const candidates = room.areaId ? (byArea.get(room.areaId) ?? []) : (byArea.get(null) ?? []);
    const selected = this.selectedDevices.get(room.id) ?? new Set();

    return html`
      <h1>${room.name}</h1>
      <p class="sub">Pick the devices to show in this room. Room ${this.currentRoomIdx + 1} of ${this.selectedRooms.length}.</p>
      ${candidates.length === 0 ? html`<div class="empty-cands">No real devices in this area yet. Continue and assign devices later from the unassigned bucket.</div>` : ''}
      <div class="devs">
        ${candidates.map(d => html`
          <button
            class="dev ${selected.has(d.entityId) ? 'selected' : ''}"
            @click=${() => this.toggleDevice(room.id, d.entityId)}
          >
            <span class="dev-icon">${familyIcon(d.family)}</span>
            <div class="dev-meta">
              <div class="dev-name">${d.friendlyName}</div>
              <div class="dev-id">${d.entityId}</div>
            </div>
            <span class="check">${selected.has(d.entityId) ? '✓' : '+'}</span>
          </button>
        `)}
      </div>
      <footer>
        <button class="ghost" @click=${this.prevRoom}>Back</button>
        <button class="primary" @click=${this.nextRoomOrTiles}>
          ${this.currentRoomIdx < this.selectedRooms.length - 1 ? 'Next room' : 'Customize tiles'}
        </button>
      </footer>
    `;
  }

  private renderTiles(): TemplateResult {
    const allDevices = listRealDevices(this.adapter);
    const byEntity = new Map(allDevices.map(d => [d.entityId, d]));
    const picked: { roomName: string; device: RealDevice }[] = [];
    for (const r of this.selectedRooms) {
      const ids = this.selectedDevices.get(r.id) ?? new Set();
      for (const id of ids) {
        const d = byEntity.get(id);
        if (d) picked.push({ roomName: r.name, device: d });
      }
    }
    if (picked.length === 0) {
      return html`
        <h1>No devices selected</h1>
        <p class="sub">Go back and pick at least one device.</p>
        <footer>
          <button class="ghost" @click=${() => { this.step = 'devices'; this.currentRoomIdx = 0; }}>Back</button>
        </footer>
      `;
    }
    return html`
      <h1>Customize tiles</h1>
      <p class="sub">We picked smart defaults. Tap to override what shows on each tile.</p>
      <div class="tiles-list">
        ${picked.map(({ roomName, device }) => {
          const def = smartDefaultsFor(device.family);
          const allAttrs = Object.keys(device.attributes).filter(k => k !== 'friendly_name' && k !== 'supported_features' && k !== 'supported_color_modes');
          const customized = this.customizedAttrs.get(device.entityId);
          const active = customized ?? new Set(def.attributes);
          return html`
            <div class="tile-cust">
              <div class="tile-cust-h">
                <span class="dev-icon">${familyIcon(device.family)}</span>
                <div>
                  <div class="dev-name">${device.friendlyName}</div>
                  <div class="dev-id">${roomName}</div>
                </div>
              </div>
              <div class="attrs">
                ${allAttrs.map(a => html`
                  <button
                    class="attr ${active.has(a) ? 'on' : ''}"
                    @click=${() => this.toggleAttr(device.entityId, a)}
                  >${a}</button>
                `)}
              </div>
            </div>
          `;
        })}
      </div>
      <footer>
        <button class="ghost" @click=${() => { this.step = 'devices'; this.currentRoomIdx = 0; }}>Back</button>
        <button class="primary" @click=${this.finish}>Save dashboard</button>
      </footer>
    `;
  }

  static override styles = css`
    .overlay {
      position: fixed;
      inset: 0;
      z-index: 90;
      background: rgba(0,0,0,0.6);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .wizard {
      width: 100%;
      max-width: 720px;
      max-height: 90vh;
      overflow-y: auto;
      background: var(--card-background-color, #14141a);
      color: var(--primary-text-color, #f8fafc);
      border-radius: 24px;
      padding: 1.5rem 1.75rem 1.25rem;
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 20px 60px rgba(0,0,0,0.6);
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }
    .step-dots { display: flex; gap: 0.4rem; }
    .step-dots .dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: rgba(255,255,255,0.2);
      transition: background 0.15s ease, width 0.15s ease;
    }
    .step-dots .dot.active { background: #6366f1; width: 22px; border-radius: 999px; }
    .x {
      width: 32px; height: 32px; border-radius: 50%;
      border: 0; background: rgba(255,255,255,0.08); color: inherit;
      font-size: 1.2rem; cursor: pointer;
    }
    .x:hover { background: rgba(255,255,255,0.14); }

    h1 { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 0.4rem; }
    .sub { font-size: 0.95rem; color: var(--secondary-text-color, #94a3b8); margin: 0 0 1.25rem; }

    .rooms-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 0.65rem;
      margin-bottom: 1rem;
    }
    .room-pick {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.85rem 1rem;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.03);
      color: inherit;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease;
      gap: 0.5rem;
    }
    .room-pick.selected { background: rgba(99,102,241,0.2); border-color: rgba(99,102,241,0.6); }
    .room-pick:hover { background: rgba(255,255,255,0.06); }
    .room-name {
      flex: 1;
      background: transparent;
      border: 0;
      color: inherit;
      font-size: 0.95rem;
      font-weight: 600;
      outline: none;
      width: 100%;
    }
    .room-name:focus { background: rgba(0,0,0,0.2); border-radius: 6px; padding: 2px 6px; }
    .check {
      width: 24px; height: 24px;
      border-radius: 50%;
      background: rgba(255,255,255,0.08);
      display: inline-flex;
      align-items: center; justify-content: center;
      font-size: 0.85rem;
      flex-shrink: 0;
    }
    .room-pick.selected .check, .dev.selected .check { background: #6366f1; color: white; }

    .add {
      width: 100%;
      padding: 0.75rem;
      border: 1px dashed rgba(255,255,255,0.2);
      background: transparent;
      color: var(--secondary-text-color, #94a3b8);
      border-radius: 14px;
      cursor: pointer;
      font-size: 0.9rem;
      margin-bottom: 1rem;
    }
    .add:hover { border-color: rgba(99,102,241,0.6); color: #6366f1; }

    .devs { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
    .dev {
      display: flex; align-items: center; gap: 0.85rem;
      padding: 0.85rem 1rem;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.03);
      color: inherit;
      cursor: pointer;
      text-align: left;
    }
    .dev.selected { background: rgba(99,102,241,0.2); border-color: rgba(99,102,241,0.6); }
    .dev:hover { background: rgba(255,255,255,0.06); }
    .dev-icon { font-size: 1.4rem; }
    .dev-meta { flex: 1; min-width: 0; }
    .dev-name { font-weight: 600; font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dev-id { font-size: 0.75rem; color: var(--secondary-text-color, #94a3b8); font-family: ui-monospace, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .empty-cands {
      padding: 2rem;
      text-align: center;
      color: var(--secondary-text-color, #94a3b8);
      border: 1px dashed rgba(255,255,255,0.15);
      border-radius: 14px;
      margin-bottom: 1rem;
    }

    .tiles-list { display: flex; flex-direction: column; gap: 0.85rem; margin-bottom: 1rem; }
    .tile-cust {
      padding: 1rem;
      border-radius: 14px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
    }
    .tile-cust-h { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
    .attrs { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .attr {
      padding: 0.4rem 0.8rem;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.12);
      background: transparent;
      color: var(--secondary-text-color, #94a3b8);
      font-size: 0.75rem;
      cursor: pointer;
      font-family: ui-monospace, monospace;
    }
    .attr.on { background: #6366f1; color: white; border-color: #6366f1; }

    footer {
      position: sticky;
      bottom: 0;
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      padding-top: 1rem;
      margin-top: auto;
      background: linear-gradient(to top, var(--card-background-color, #14141a) 70%, transparent);
    }
    button.primary {
      padding: 0.85rem 1.5rem;
      border-radius: 12px;
      border: 0;
      background: #6366f1;
      color: white;
      font-weight: 600;
      cursor: pointer;
      font-size: 0.95rem;
    }
    button.primary:hover { background: #4f46e5; }
    button.primary[disabled] { opacity: 0.5; cursor: not-allowed; }
    button.ghost {
      padding: 0.85rem 1.5rem;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.12);
      background: transparent;
      color: inherit;
      cursor: pointer;
      font-size: 0.95rem;
    }
    button.ghost:hover { background: rgba(255,255,255,0.06); }
  `;
}

function mergeRooms(existing: Room[], incoming: Room[]): Room[] {
  const map = new Map(existing.map(r => [r.id, r]));
  for (const r of incoming) {
    const prev = map.get(r.id);
    if (!prev) {
      map.set(r.id, r);
    } else {
      const existingTileIds = new Set(prev.tiles.map(t => t.entityId));
      const merged = [...prev.tiles, ...r.tiles.filter(t => !existingTileIds.has(t.entityId))];
      map.set(r.id, { ...prev, name: r.name, tiles: merged });
    }
  }
  return Array.from(map.values());
}

declare global {
  interface HTMLElementTagNameMap {
    'sab-wizard': SabWizard;
  }
}
