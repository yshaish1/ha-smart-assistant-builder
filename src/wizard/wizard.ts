import { LitElement, css, html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HassAdapter } from '../ha/adapter.js';
import type { Dashboard, RealDevice, Room, Tile } from '../types.js';
import { groupByArea, listRealDevices } from '../ha/filter.js';
import { familyIcon, smartDefaultsFor } from '../tiles/smart-defaults.js';

type Step = 'rooms' | 'devices' | 'tiles';

interface DraftRoom {
  id: string;
  name: string;
  areaId?: string;
  selected: boolean;
}

let _uidCounter = 0;
function uid(): string {
  return `${Date.now().toString(36)}${(_uidCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

@customElement('sab-wizard')
export class SabWizard extends LitElement {
  @property({ attribute: false }) adapter!: HassAdapter;
  @property({ attribute: false }) initialDashboard?: Dashboard;
  @property({ type: String }) mode: 'create' | 'edit' = 'create';

  @state() private dashboardName = 'Smart Home';
  @state() private step: Step = 'rooms';
  @state() private rooms: DraftRoom[] = [];
  @state() private currentRoomIdx = 0;
  @state() private selectedDevices = new Map<string, Set<string>>();
  @state() private customizedAttrs = new Map<string, Set<string>>();

  override connectedCallback(): void {
    super.connectedCallback();
    this.initFromState();
  }

  private initFromState(): void {
    const areas = this.adapter.getAreaRegistry();
    const initial = this.initialDashboard;
    if (initial) {
      this.dashboardName = initial.name;
      const drafts: DraftRoom[] = areas.map(a => {
        const existing = initial.rooms.find(r => r.areaId === a.area_id);
        return {
          id: existing?.id ?? uid(),
          name: existing?.name ?? a.name,
          areaId: a.area_id,
          selected: !!existing,
        };
      });
      const customRooms = initial.rooms.filter(r => !r.areaId);
      for (const r of customRooms) drafts.push({ id: r.id, name: r.name, selected: true });
      drafts.push({ id: uid(), name: 'Unassigned', selected: !!initial.rooms.find(r => r.id === '__unassigned') });
      this.rooms = drafts;
      const sel = new Map<string, Set<string>>();
      const cust = new Map<string, Set<string>>();
      for (const r of initial.rooms) {
        sel.set(r.id, new Set(r.tiles.map(t => t.entityId)));
        for (const t of r.tiles) cust.set(t.entityId, new Set(t.attributes));
      }
      this.selectedDevices = sel;
      this.customizedAttrs = cust;
    } else {
      const drafts: DraftRoom[] = areas.map(a => ({ id: uid(), name: a.name, areaId: a.area_id, selected: true }));
      drafts.push({ id: uid(), name: 'Unassigned', selected: false });
      this.rooms = drafts;
    }
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
    if (this.currentRoomIdx < this.selectedRooms.length - 1) this.currentRoomIdx += 1;
    else this.step = 'tiles';
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
    const dashboard: Dashboard = {
      id: this.initialDashboard?.id ?? uid(),
      name: this.dashboardName.trim() || 'Smart Home',
      rooms: newRooms.filter(r => r.tiles.length > 0),
    };
    this.dispatchEvent(new CustomEvent('wizard-done', { bubbles: true, composed: true, detail: { dashboard } }));
  }

  private cancel(): void {
    this.dispatchEvent(new CustomEvent('wizard-cancel', { bubbles: true, composed: true }));
  }

  override render(): TemplateResult {
    return html`
      <div class="overlay" @click=${this.cancel}>
        <div class="wizard" @click=${(e: Event) => e.stopPropagation()}>
          <header>
            <div class="step-dots">
              <span class="dot ${this.step === 'rooms' ? 'active' : ''}"></span>
              <span class="dot ${this.step === 'devices' ? 'active' : ''}"></span>
              <span class="dot ${this.step === 'tiles' ? 'active' : ''}"></span>
            </div>
            <button class="x" @click=${this.cancel} aria-label="Close">×</button>
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
      <h1>${this.mode === 'edit' ? 'Edit dashboard' : 'New dashboard'}</h1>
      <p class="sub">Name your dashboard, then pick rooms. Areas come from Home Assistant.</p>
      <label class="name-row">
        <span class="label">Dashboard name</span>
        <input
          class="name-input"
          .value=${this.dashboardName}
          @input=${(e: Event) => { this.dashboardName = (e.target as HTMLInputElement).value; }}
          placeholder="Smart Home"
        />
      </label>
      <div class="section-title">Rooms</div>
      <div class="rooms-grid">
        ${this.rooms.map((r, i) => html`
          <button class="room-pick ${r.selected ? 'selected' : ''}" @click=${() => this.toggleRoom(i)}>
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
        <button class="primary" ?disabled=${this.selectedRooms.length === 0 || !this.dashboardName.trim()} @click=${this.goToDevices}>Next: Pick devices</button>
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
      <p class="sub">Pick devices for this room. Room ${this.currentRoomIdx + 1} of ${this.selectedRooms.length}.</p>
      ${candidates.length === 0 ? html`<div class="empty-cands">No real devices in this area. You can continue and assign devices later.</div>` : ''}
      <div class="devs">
        ${candidates.map(d => html`
          <button class="dev ${selected.has(d.entityId) ? 'selected' : ''}" @click=${() => this.toggleDevice(room.id, d.entityId)}>
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
      <p class="sub">Smart defaults are pre-selected. Tap to add or remove attributes.</p>
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
                  <button class="attr ${active.has(a) ? 'on' : ''}" @click=${() => this.toggleAttr(device.entityId, a)}>${a}</button>
                `)}
              </div>
            </div>
          `;
        })}
      </div>
      <footer>
        <button class="ghost" @click=${() => { this.step = 'devices'; this.currentRoomIdx = 0; }}>Back</button>
        <button class="primary" @click=${this.finish}>${this.mode === 'edit' ? 'Save changes' : 'Create dashboard'}</button>
      </footer>
    `;
  }

  static override styles = css`
    :host {
      --sab-surface: var(--ha-card-background, var(--card-background-color, #fff));
      --sab-text: var(--primary-text-color, #1a1a1a);
      --sab-muted: var(--secondary-text-color, #6b7280);
      --sab-divider: var(--divider-color, rgba(0,0,0,0.1));
      --sab-accent: var(--primary-color, #6366f1);
      --sab-on-accent: var(--text-primary-color, #fff);
      --sab-hover: var(--secondary-background-color, rgba(0,0,0,0.04));
      font-family: var(--ha-font-family-body, 'Inter', system-ui, sans-serif);
      color: var(--sab-text);
    }

    .overlay {
      position: fixed;
      inset: 0;
      z-index: 90;
      background: rgba(0,0,0,0.5);
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
      background: var(--sab-surface);
      color: var(--sab-text);
      border-radius: 24px;
      padding: 1.5rem 1.75rem 1.25rem;
      border: 1px solid var(--sab-divider);
      box-shadow: 0 20px 60px rgba(0,0,0,0.25);
      display: flex;
      flex-direction: column;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
    }
    .step-dots { display: flex; gap: 0.4rem; }
    .step-dots .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--sab-divider);
      transition: background 0.15s ease, width 0.15s ease;
    }
    .step-dots .dot.active { background: var(--sab-accent); width: 24px; border-radius: 999px; }
    .x {
      width: 32px; height: 32px; border-radius: 50%;
      border: 0; background: var(--sab-hover); color: var(--sab-text);
      font-size: 1.2rem; cursor: pointer;
    }
    .x:hover { background: var(--sab-divider); }

    h1 { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 0.4rem; color: var(--sab-text); }
    .sub { font-size: 0.95rem; color: var(--sab-muted); margin: 0 0 1.25rem; }

    .name-row { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 1.25rem; }
    .label { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--sab-muted); }
    .name-input {
      padding: 0.65rem 0.85rem;
      border-radius: 10px;
      border: 1px solid var(--sab-divider);
      background: var(--sab-hover);
      color: var(--sab-text);
      font-size: 0.95rem;
      outline: none;
      font-family: inherit;
    }
    .name-input:focus { border-color: var(--sab-accent); }

    .section-title { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--sab-muted); margin-bottom: 0.5rem; }

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
      border: 1px solid var(--sab-divider);
      background: var(--sab-hover);
      color: var(--sab-text);
      cursor: pointer;
      gap: 0.5rem;
      font-family: inherit;
    }
    .room-pick:hover { background: var(--sab-divider); }
    .room-pick.selected { background: color-mix(in srgb, var(--sab-accent) 15%, transparent); border-color: var(--sab-accent); }
    .room-name {
      flex: 1;
      background: transparent;
      border: 0;
      color: var(--sab-text);
      font-size: 0.95rem;
      font-weight: 600;
      outline: none;
      width: 100%;
      font-family: inherit;
    }
    .check {
      width: 26px; height: 26px;
      border-radius: 50%;
      background: var(--sab-divider);
      color: var(--sab-text);
      display: inline-flex;
      align-items: center; justify-content: center;
      font-size: 0.85rem;
      flex-shrink: 0;
    }
    .room-pick.selected .check, .dev.selected .check { background: var(--sab-accent); color: var(--sab-on-accent); }

    .add {
      width: 100%;
      padding: 0.75rem;
      border: 1px dashed var(--sab-divider);
      background: transparent;
      color: var(--sab-muted);
      border-radius: 14px;
      cursor: pointer;
      font-size: 0.9rem;
      margin-bottom: 1rem;
      font-family: inherit;
    }
    .add:hover { border-color: var(--sab-accent); color: var(--sab-accent); }

    .devs { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
    .dev {
      display: flex; align-items: center; gap: 0.85rem;
      padding: 0.85rem 1rem;
      border-radius: 14px;
      border: 1px solid var(--sab-divider);
      background: var(--sab-hover);
      color: var(--sab-text);
      cursor: pointer;
      text-align: start;
      font-family: inherit;
    }
    .dev:hover { background: var(--sab-divider); }
    .dev.selected { background: color-mix(in srgb, var(--sab-accent) 15%, transparent); border-color: var(--sab-accent); }
    .dev-icon { font-size: 1.4rem; }
    .dev-meta { flex: 1; min-width: 0; }
    .dev-name { font-weight: 600; font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--sab-text); }
    .dev-id { font-size: 0.75rem; color: var(--sab-muted); font-family: ui-monospace, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .empty-cands {
      padding: 2rem;
      text-align: center;
      color: var(--sab-muted);
      border: 1px dashed var(--sab-divider);
      border-radius: 14px;
      margin-bottom: 1rem;
    }

    .tiles-list { display: flex; flex-direction: column; gap: 0.85rem; margin-bottom: 1rem; }
    .tile-cust {
      padding: 1rem;
      border-radius: 14px;
      background: var(--sab-hover);
      border: 1px solid var(--sab-divider);
    }
    .tile-cust-h { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
    .attrs { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .attr {
      padding: 0.4rem 0.8rem;
      border-radius: 999px;
      border: 1px solid var(--sab-divider);
      background: transparent;
      color: var(--sab-muted);
      font-size: 0.75rem;
      cursor: pointer;
      font-family: ui-monospace, monospace;
    }
    .attr.on { background: var(--sab-accent); color: var(--sab-on-accent); border-color: var(--sab-accent); }

    footer {
      position: sticky;
      bottom: 0;
      display: flex;
      justify-content: space-between;
      gap: 0.75rem;
      padding-top: 1rem;
      margin-top: auto;
      background: linear-gradient(to top, var(--sab-surface) 70%, transparent);
    }
    button.primary {
      padding: 0.75rem 1.5rem;
      border-radius: 10px;
      border: 0;
      background: var(--sab-accent);
      color: var(--sab-on-accent);
      font-weight: 600;
      cursor: pointer;
      font-size: 0.95rem;
      font-family: inherit;
    }
    button.primary:hover { filter: brightness(0.95); }
    button.primary[disabled] { opacity: 0.5; cursor: not-allowed; }
    button.ghost {
      padding: 0.75rem 1.5rem;
      border-radius: 10px;
      border: 1px solid var(--sab-divider);
      background: transparent;
      color: var(--sab-text);
      cursor: pointer;
      font-size: 0.95rem;
      font-family: inherit;
    }
    button.ghost:hover { background: var(--sab-hover); }

    :host([dir="rtl"]) .dev-id,
    :host([dir="rtl"]) .name-input,
    :host([dir="rtl"]) .room-name { direction: ltr; text-align: end; unicode-bidi: plaintext; }
    :host([dir="rtl"]) .dev { text-align: start; }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'sab-wizard': SabWizard;
  }
}
