import { LitElement, css, html, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HassAdapter } from '../ha/adapter.js';
import type { AttributeBinding, AttributeRender, Dashboard, DashboardSettings, DeviceFamily, IconStyle, RealDevice, Room, Tile, TileSize } from '../types.js';
import { DEFAULT_SETTINGS } from '../types.js';
import { groupByArea, listRealDevices } from '../ha/filter.js';
import { NOISE_ATTRS, availableRendersFor, familyEmoji, smartDefaultsFor, suggestRender } from '../tiles/smart-defaults.js';
import '../cards/tile-card.js';
import type { HassLike } from '../ha/adapter.real.js';
import type { HassEntity } from '../types.js';

type Step = 'settings' | 'rooms' | 'devices' | 'tiles';

interface DraftRoom { id: string; name: string; areaId?: string; selected: boolean }

let _uidCounter = 0;
function uid(): string {
  return `${Date.now().toString(36)}${(_uidCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

@customElement('sab-wizard')
export class SabWizard extends LitElement {
  @property({ attribute: false }) adapter!: HassAdapter;
  @property({ attribute: false }) initialDashboard?: Dashboard;
  @property({ type: String }) mode: 'create' | 'edit' = 'create';
  @property({ type: String }) saveError: string | null = null;
  @property({ type: Boolean }) saving = false;

  @state() private dashboardName = 'Smart Home';
  @state() private settings: DashboardSettings = { ...DEFAULT_SETTINGS };
  @state() private step: Step = 'settings';
  @state() private rooms: DraftRoom[] = [];
  @state() private currentRoomIdx = 0;
  @state() private selectedDevices = new Map<string, Set<string>>();
  @state() private tileOverrides = new Map<string, TileOverrides>();
  @state() private dirty = false;
  @state() private confirmDiscard = false;

  private boundBeforeUnload?: (e: BeforeUnloadEvent) => void;

  override connectedCallback(): void {
    super.connectedCallback();
    this.initFromState();
    this.boundBeforeUnload = (e: BeforeUnloadEvent) => {
      if (this.dirty && !this.saving) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', this.boundBeforeUnload);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.boundBeforeUnload) window.removeEventListener('beforeunload', this.boundBeforeUnload);
  }

  private markDirty(): void { if (!this.dirty) this.dirty = true; }

  private initFromState(): void {
    const areas = this.adapter.getAreaRegistry();
    const initial = this.initialDashboard;
    if (initial) {
      this.dashboardName = initial.name;
      this.settings = { ...DEFAULT_SETTINGS, ...initial.settings };
      const drafts: DraftRoom[] = areas.map(a => {
        const existing = initial.rooms.find(r => r.areaId === a.area_id);
        return { id: existing?.id ?? uid(), name: existing?.name ?? a.name, areaId: a.area_id, selected: !!existing };
      });
      const customRooms = initial.rooms.filter(r => !r.areaId);
      for (const r of customRooms) drafts.push({ id: r.id, name: r.name, selected: true });
      drafts.push({ id: uid(), name: 'Unassigned', selected: false });
      this.rooms = drafts;
      const sel = new Map<string, Set<string>>();
      const overrides = new Map<string, TileOverrides>();
      for (const r of initial.rooms) {
        sel.set(r.id, new Set(r.tiles.map(t => t.entityId)));
        for (const t of r.tiles) overrides.set(t.entityId, {
          size: t.size,
          customName: t.customName ?? '',
          customIcon: t.customIcon ?? '',
          colorOverride: t.colorOverride ?? '',
          bindings: t.bindings.slice(),
        });
      }
      this.selectedDevices = sel;
      this.tileOverrides = overrides;
    } else {
      const drafts: DraftRoom[] = areas.map(a => ({ id: uid(), name: a.name, areaId: a.area_id, selected: true }));
      drafts.push({ id: uid(), name: 'Unassigned', selected: false });
      this.rooms = drafts;
    }
  }

  private setSetting<K extends keyof DashboardSettings>(key: K, value: DashboardSettings[K]): void {
    this.settings = { ...this.settings, [key]: value };
    this.markDirty();
  }

  private toggleRoom(idx: number): void {
    const next = this.rooms.slice(); next[idx] = { ...next[idx]!, selected: !next[idx]!.selected };
    this.rooms = next;
    this.markDirty();
  }
  private renameRoom(idx: number, name: string): void {
    const next = this.rooms.slice(); next[idx] = { ...next[idx]!, name }; this.rooms = next;
    this.markDirty();
  }
  private addCustomRoom(): void {
    this.rooms = [...this.rooms.filter(r => r.name !== 'Unassigned'), { id: uid(), name: 'New Room', selected: true }, { id: uid(), name: 'Unassigned', selected: false }];
    this.markDirty();
  }

  private get selectedRooms(): DraftRoom[] { return this.rooms.filter(r => r.selected); }

  private toggleDevice(roomId: string, entityId: string): void {
    const set = new Map(this.selectedDevices);
    const cur = new Set(set.get(roomId) ?? []);
    if (cur.has(entityId)) cur.delete(entityId); else {
      // Remove from any other room first - a tile can only be in one room
      for (const [otherId, others] of set) {
        if (otherId !== roomId && others.has(entityId)) {
          const next = new Set(others); next.delete(entityId);
          set.set(otherId, next);
        }
      }
      cur.add(entityId);
    }
    set.set(roomId, cur);
    this.selectedDevices = set;
    this.markDirty();
  }

  private nextRoomOrTiles(): void {
    if (this.currentRoomIdx < this.selectedRooms.length - 1) this.currentRoomIdx += 1;
    else this.step = 'tiles';
  }
  private prevRoom(): void {
    if (this.currentRoomIdx > 0) this.currentRoomIdx -= 1;
    else this.step = 'rooms';
  }

  private getOverrides(entityId: string, defaults: ReturnType<typeof smartDefaultsFor>): TileOverrides {
    return this.tileOverrides.get(entityId) ?? {
      size: defaults.size,
      customName: '',
      customIcon: '',
      colorOverride: '',
      bindings: defaults.bindings.slice(),
    };
  }

  private setOverride(entityId: string, patch: Partial<TileOverrides>): void {
    const map = new Map(this.tileOverrides);
    const cur = map.get(entityId) ?? this.getOverrides(entityId, smartDefaultsFor('switch'));
    map.set(entityId, { ...cur, ...patch });
    this.tileOverrides = map;
    this.markDirty();
  }

  private toggleBinding(entityId: string, attribute: string, render: AttributeRender | null, currentBindings: AttributeBinding[]): void {
    const idx = currentBindings.findIndex(b => b.attribute === attribute);
    let next: AttributeBinding[];
    if (render === null) {
      next = idx === -1 ? currentBindings : currentBindings.filter((_, i) => i !== idx);
    } else if (idx === -1) {
      next = [...currentBindings, { attribute, render }];
    } else {
      next = currentBindings.slice();
      next[idx] = { ...next[idx]!, render };
    }
    this.setOverride(entityId, { bindings: next });
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
        const ov = this.getOverrides(eid, def);
        return {
          id: uid(),
          entityId: eid,
          family: dev.family,
          size: ov.size,
          primaryAction: def.primaryAction,
          bindings: ov.bindings,
          ...(ov.customName ? { customName: ov.customName } : {}),
          ...(ov.customIcon ? { customIcon: ov.customIcon } : {}),
          ...(ov.colorOverride ? { colorOverride: ov.colorOverride } : {}),
        };
      });
      if (tiles.length > 0) newRooms.push({
        id: draft.id, name: draft.name,
        ...(draft.areaId ? { areaId: draft.areaId } : {}),
        tiles,
      });
    }
    const dashboard: Dashboard = {
      id: this.initialDashboard?.id ?? uid(),
      name: this.dashboardName.trim() || 'Smart Home',
      settings: this.settings,
      rooms: newRooms,
    };
    this.dirty = false;
    this.dispatchEvent(new CustomEvent('wizard-done', { bubbles: true, composed: true, detail: { dashboard } }));
  }

  private cancel(): void {
    this.dirty = false;
    this.dispatchEvent(new CustomEvent('wizard-cancel', { bubbles: true, composed: true }));
  }

  private requestClose(): void {
    if (this.saving) return;
    if (this.dirty) {
      this.confirmDiscard = true;
    } else {
      this.cancel();
    }
  }
  private confirmDiscardYes = (): void => { this.confirmDiscard = false; this.cancel(); };
  private confirmDiscardNo = (): void => { this.confirmDiscard = false; };

  override render(): TemplateResult {
    return html`
      <div class="overlay">
        <div class="wizard">
          <header>
            <div class="step-dots">
              <span class="dot ${this.step === 'settings' ? 'active' : ''}"></span>
              <span class="dot ${this.step === 'rooms' ? 'active' : ''}"></span>
              <span class="dot ${this.step === 'devices' ? 'active' : ''}"></span>
              <span class="dot ${this.step === 'tiles' ? 'active' : ''}"></span>
            </div>
            ${this.dirty ? html`<span class="dirty-badge" title="Unsaved changes">●</span>` : ''}
            <button class="x" @click=${this.requestClose} aria-label="Close">×</button>
          </header>
          ${this.saveError ? html`<div class="save-error"><strong>Could not save:</strong> ${this.saveError}</div>` : ''}
          ${this.renderStep()}
        </div>
        ${this.confirmDiscard ? html`
          <div class="confirm-overlay">
            <div class="confirm-box">
              <h2>Discard changes?</h2>
              <p>Your edits in this wizard haven't been saved yet. Closing now will lose them.</p>
              <div class="confirm-actions">
                <button class="ghost" @click=${this.confirmDiscardNo}>Keep editing</button>
                <button class="primary danger" @click=${this.confirmDiscardYes}>Discard</button>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderStep(): TemplateResult {
    if (this.step === 'settings') return this.renderSettings();
    if (this.step === 'rooms') return this.renderRooms();
    if (this.step === 'devices') return this.renderDevices();
    return this.renderTiles();
  }

  private renderSettings(): TemplateResult {
    const s = this.settings;
    return html`
      <h1>${this.mode === 'edit' ? 'Edit dashboard' : 'New dashboard'}</h1>
      <p class="sub">Name your dashboard and pick a layout. You can change everything later.</p>

      <label class="field">
        <span class="label">Dashboard name</span>
        <input class="input" .value=${this.dashboardName} @input=${(e: Event) => { this.dashboardName = (e.target as HTMLInputElement).value; this.markDirty(); }} placeholder="Smart Home" />
      </label>

      <div class="field">
        <span class="label">Layout</span>
        <div class="row">
          <div class="seg">
            <span class="seg-l">Max columns</span>
            ${[1, 2, 3, 4].map(n => html`
              <button class="chip ${s.maxColumns === n ? 'on' : ''}" @click=${() => this.setSetting('maxColumns', n as 1|2|3|4)}>${n}</button>
            `)}
          </div>
        </div>
        <div class="row">
          <div class="seg">
            <span class="seg-l">Density</span>
            ${(['compact','comfortable','spacious'] as const).map(d => html`
              <button class="chip ${s.density === d ? 'on' : ''}" @click=${() => this.setSetting('density', d)}>${d}</button>
            `)}
          </div>
        </div>
      </div>

      <label class="field">
        <span class="label">Accent color</span>
        <div class="row inline">
          <input class="color-input" type="color" .value=${s.accentColor} @input=${(e: Event) => this.setSetting('accentColor', (e.target as HTMLInputElement).value)} />
          <code class="hex">${s.accentColor}</code>
          <button class="ghost small" @click=${() => this.setSetting('accentColor', '#6366f1')}>Reset</button>
        </div>
      </label>

      <div class="field">
        <span class="label">Icon style</span>
        <div class="seg">
          ${(['emoji','mdi','off'] as IconStyle[]).map(v => html`
            <button class="chip ${s.iconStyle === v ? 'on' : ''}" @click=${() => this.setSetting('iconStyle', v)}>${v}</button>
          `)}
        </div>
      </div>

      <div class="field">
        <span class="label">Background</span>
        <div class="seg">
          ${(['solid','gradient','image'] as const).map(t => html`
            <button class="chip ${s.background.type === t ? 'on' : ''}" @click=${() => this.setBackgroundType(t)}>${t}</button>
          `)}
        </div>
        ${this.renderBackgroundFields()}
      </div>

      <footer>
        <button class="ghost" @click=${this.requestClose}>Cancel</button>
        <button class="primary" ?disabled=${!this.dashboardName.trim()} @click=${() => { this.step = 'rooms'; }}>Next: Rooms</button>
      </footer>
    `;
  }

  private setBackgroundType(t: 'solid' | 'gradient' | 'image'): void {
    if (t === 'solid') this.setSetting('background', { type: 'solid', color: '' });
    else if (t === 'gradient') this.setSetting('background', { type: 'gradient', from: '#e0e7ff', to: '#fafafa' });
    else this.setSetting('background', { type: 'image', url: '' });
  }

  private renderBackgroundFields(): TemplateResult | typeof nothing {
    const bg = this.settings.background;
    if (bg.type === 'solid') {
      return html`
        <div class="row inline">
          <input class="color-input" type="color" .value=${bg.color || '#ffffff'} @input=${(e: Event) => this.setSetting('background', { type: 'solid', color: (e.target as HTMLInputElement).value })} />
          <code class="hex">${bg.color || 'theme default'}</code>
          <button class="ghost small" @click=${() => this.setSetting('background', { type: 'solid', color: '' })}>Use theme default</button>
        </div>
      `;
    }
    if (bg.type === 'gradient') {
      return html`
        <div class="row inline">
          <input class="color-input" type="color" .value=${bg.from} @input=${(e: Event) => this.setSetting('background', { ...bg, from: (e.target as HTMLInputElement).value })} />
          <span class="hex">→</span>
          <input class="color-input" type="color" .value=${bg.to} @input=${(e: Event) => this.setSetting('background', { ...bg, to: (e.target as HTMLInputElement).value })} />
        </div>
      `;
    }
    return html`
      <input class="input" type="url" placeholder="https://..." .value=${bg.url} @input=${(e: Event) => this.setSetting('background', { type: 'image', url: (e.target as HTMLInputElement).value })} />
    `;
  }

  private renderRooms(): TemplateResult {
    return html`
      <h1>Rooms</h1>
      <p class="sub">Pick which rooms appear on this dashboard. Areas come from Home Assistant.</p>
      <div class="rooms-grid">
        ${this.rooms.map((r, i) => html`
          <button class="room-pick ${r.selected ? 'selected' : ''}" @click=${() => this.toggleRoom(i)}>
            <input class="room-name" .value=${r.name} @click=${(e: Event) => e.stopPropagation()} @input=${(e: Event) => this.renameRoom(i, (e.target as HTMLInputElement).value)} />
            <span class="check">${r.selected ? '✓' : '+'}</span>
          </button>
        `)}
      </div>
      <button class="add" @click=${this.addCustomRoom}>+ Add custom room</button>
      <footer>
        <button class="ghost" @click=${() => { this.step = 'settings'; }}>Back</button>
        <button class="primary" ?disabled=${this.selectedRooms.length === 0} @click=${() => { this.step = 'devices'; this.currentRoomIdx = 0; }}>Next: Devices</button>
      </footer>
    `;
  }

  private renderDevices(): TemplateResult {
    const room = this.selectedRooms[this.currentRoomIdx];
    if (!room) return html``;
    const allDevices = listRealDevices(this.adapter);
    const byArea = groupByArea(allDevices);
    const inArea = room.areaId ? new Set((byArea.get(room.areaId) ?? []).map(d => d.entityId)) : new Set<string>();
    const selected = this.selectedDevices.get(room.id) ?? new Set();
    const otherRoomMap = new Map<string, string>();
    for (const r of this.selectedRooms) {
      if (r.id === room.id) continue;
      const ids = this.selectedDevices.get(r.id) ?? new Set();
      for (const id of ids) otherRoomMap.set(id, r.name);
    }
    const sorted = [...allDevices].sort((a, b) => {
      const ai = inArea.has(a.entityId) ? 0 : 1;
      const bi = inArea.has(b.entityId) ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return a.friendlyName.localeCompare(b.friendlyName);
    });

    return html`
      <h1>${room.name}</h1>
      <p class="sub">Pick devices for this room. Devices in this area are listed first. Room ${this.currentRoomIdx + 1} of ${this.selectedRooms.length}.</p>
      <div class="devs">
        ${sorted.map(d => {
          const isSelected = selected.has(d.entityId);
          const inThisArea = inArea.has(d.entityId);
          const otherRoom = otherRoomMap.get(d.entityId);
          return html`
            <button class="dev ${isSelected ? 'selected' : ''}" @click=${() => this.toggleDevice(room.id, d.entityId)}>
              <span class="dev-icon">${familyEmoji(d.family)}</span>
              <div class="dev-meta">
                <div class="dev-name">${d.friendlyName}</div>
                <div class="dev-id">${d.entityId}</div>
              </div>
              ${inThisArea ? html`<span class="tag in-area">in this area</span>` : ''}
              ${otherRoom ? html`<span class="tag other">in ${otherRoom}</span>` : ''}
              <span class="check">${isSelected ? '✓' : '+'}</span>
            </button>
          `;
        })}
        ${sorted.length === 0 ? html`<div class="empty-cands">No real devices found.</div>` : ''}
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
      <p class="sub">For each device, pick a size and choose how each attribute is displayed.</p>
      <div class="tiles-list">
        ${picked.map(({ roomName, device }) => this.renderTileEditor(roomName, device))}
      </div>
      <footer>
        <button class="ghost" @click=${() => { this.step = 'devices'; this.currentRoomIdx = 0; }} ?disabled=${this.saving}>Back</button>
        <button class="primary" @click=${this.finish} ?disabled=${this.saving}>
          ${this.saving ? 'Saving…' : (this.mode === 'edit' ? 'Save changes' : 'Create dashboard')}
        </button>
      </footer>
    `;
  }

  private get hassLike(): HassLike {
    const states: Record<string, HassEntity> = {};
    for (const s of this.adapter.getStates()) states[s.entity_id] = s;
    return {
      states,
      connection: {
        sendMessagePromise: async () => ({} as never),
        subscribeMessage: async () => () => {},
      },
      callService: async () => {},
    };
  }

  private previewConfigFor(device: RealDevice, ov: TileOverrides) {
    const def = smartDefaultsFor(device.family);
    return {
      type: 'custom:sab-tile-card',
      entity: device.entityId,
      family: device.family,
      primaryAction: def.primaryAction,
      bindings: ov.bindings,
      settings: this.settings,
      ...(ov.customName ? { name: ov.customName } : {}),
      ...(ov.customIcon ? { icon: ov.customIcon } : {}),
      ...(ov.colorOverride ? { colorOverride: ov.colorOverride } : {}),
    };
  }

  private renderTileEditor(roomName: string, device: RealDevice): TemplateResult {
    const def = smartDefaultsFor(device.family);
    const ov = this.getOverrides(device.entityId, def);
    const allAttrs = Object.keys(device.attributes).filter(k => !NOISE_ATTRS.has(k));
    const previewConfig = this.previewConfigFor(device, ov);

    return html`
      <div class="tile-cust">
        <div class="tile-cust-h">
          <span class="dev-icon">${familyEmoji(device.family)}</span>
          <div class="dev-h-meta">
            <div class="dev-name">${ov.customName || device.friendlyName}</div>
            <div class="dev-id">${roomName} · ${device.entityId}</div>
          </div>
          <div class="preview" aria-label="Live preview">
            <sab-tile-card .hass=${this.hassLike} .config=${previewConfig}></sab-tile-card>
          </div>
        </div>

        <div class="cust-row">
          <span class="cust-l">Size</span>
          <div class="seg">
            ${(['small','medium','large'] as TileSize[]).map(s => html`
              <button class="chip ${ov.size === s ? 'on' : ''}" @click=${() => this.setOverride(device.entityId, { size: s })}>${s}</button>
            `)}
          </div>
        </div>

        <div class="cust-row">
          <span class="cust-l">Custom name</span>
          <input class="input small" .value=${ov.customName} placeholder=${device.friendlyName}
            @input=${(e: Event) => this.setOverride(device.entityId, { customName: (e.target as HTMLInputElement).value })} />
        </div>

        <div class="cust-row">
          <span class="cust-l">Custom icon</span>
          <input class="input small mono" .value=${ov.customIcon} placeholder="mdi:home or 🏠"
            @input=${(e: Event) => this.setOverride(device.entityId, { customIcon: (e.target as HTMLInputElement).value })} />
        </div>

        <div class="cust-row">
          <span class="cust-l">Color override</span>
          <div class="row inline">
            <input class="color-input" type="color" .value=${ov.colorOverride || this.settings.accentColor}
              @input=${(e: Event) => this.setOverride(device.entityId, { colorOverride: (e.target as HTMLInputElement).value })} />
            <button class="ghost small" @click=${() => this.setOverride(device.entityId, { colorOverride: '' })}>Use accent</button>
          </div>
        </div>

        <div class="bindings">
          <div class="cust-l small">Attributes</div>
          ${this.renderAttributeRow(device.entityId, 'state', ov.bindings, availableRendersFor('state', device.state), defaultBindingForFamily(device.family))}
          ${allAttrs.map(a => {
            const value = device.attributes[a];
            const modes = availableRendersFor(a, value);
            const suggested = suggestRender(a, value);
            return this.renderAttributeRow(device.entityId, a, ov.bindings, modes, suggested);
          })}
        </div>
      </div>
    `;
  }

  private renderAttributeRow(entityId: string, attr: string, bindings: AttributeBinding[], modes: AttributeRender[], suggested: AttributeRender): TemplateResult {
    const current = bindings.find(b => b.attribute === attr);
    return html`
      <div class="bind-row">
        <code class="bind-attr">${attr}</code>
        <div class="seg small">
          ${modes.map(m => html`
            <button class="chip ${current?.render === m ? 'on' : ''} ${!current && m === suggested ? 'suggested' : ''}"
              @click=${() => this.toggleBinding(entityId, attr, m, bindings)}>${m}</button>
          `)}
          <button class="chip ${!current ? 'on' : ''}"
            @click=${() => this.toggleBinding(entityId, attr, null, bindings)}>off</button>
        </div>
      </div>
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
      max-width: 760px;
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

    .save-error {
      padding: 0.85rem 1rem;
      border-radius: 10px;
      background: color-mix(in srgb, var(--error-color, #ef4444) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--error-color, #ef4444) 50%, transparent);
      color: var(--error-color, #ef4444);
      margin-bottom: 1rem;
      font-size: 0.85rem;
      line-height: 1.4;
      word-break: break-word;
    }

    .field { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 1.1rem; }
    .label { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--sab-muted); }
    .input {
      padding: 0.65rem 0.85rem;
      border-radius: 10px;
      border: 1px solid var(--sab-divider);
      background: var(--sab-hover);
      color: var(--sab-text);
      font-size: 0.95rem;
      outline: none;
      font-family: inherit;
    }
    .input.small { padding: 0.45rem 0.65rem; font-size: 0.85rem; }
    .input.mono { font-family: ui-monospace, monospace; }
    .input:focus { border-color: var(--sab-accent); }

    .row { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
    .row.inline { gap: 0.5rem; }

    .seg { display: inline-flex; gap: 0.3rem; align-items: center; flex-wrap: wrap; }
    .seg-l { font-size: 0.8rem; color: var(--sab-muted); margin-right: 0.5rem; }
    .seg.small .chip { font-size: 0.7rem; padding: 0.25rem 0.55rem; }

    .chip {
      padding: 0.4rem 0.8rem;
      border-radius: 999px;
      border: 1px solid var(--sab-divider);
      background: transparent;
      color: var(--sab-muted);
      font-size: 0.8rem;
      cursor: pointer;
      font-family: inherit;
      text-transform: capitalize;
    }
    .chip:hover { background: var(--sab-hover); }
    .chip.on { background: var(--sab-accent); color: var(--sab-on-accent); border-color: var(--sab-accent); }
    .chip.suggested { border-style: dashed; }

    .color-input { width: 36px; height: 36px; border: 1px solid var(--sab-divider); border-radius: 8px; cursor: pointer; padding: 0; background: none; }
    .hex { font-family: ui-monospace, monospace; font-size: 0.8rem; color: var(--sab-muted); }

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
    .room-name { flex: 1; background: transparent; border: 0; color: var(--sab-text); font-size: 0.95rem; font-weight: 600; outline: none; width: 100%; font-family: inherit; }
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

    .tag {
      font-size: 0.7rem;
      padding: 0.15rem 0.55rem;
      border-radius: 999px;
      background: var(--sab-divider);
      color: var(--sab-muted);
      flex-shrink: 0;
    }
    .tag.in-area { background: color-mix(in srgb, var(--sab-accent) 18%, transparent); color: var(--sab-accent); }
    .tag.other { background: color-mix(in srgb, var(--error-color, #ef4444) 14%, transparent); color: var(--error-color, #ef4444); }

    .empty-cands {
      padding: 2rem;
      text-align: center;
      color: var(--sab-muted);
      border: 1px dashed var(--sab-divider);
      border-radius: 14px;
    }

    .tiles-list { display: flex; flex-direction: column; gap: 0.85rem; margin-bottom: 1rem; }
    .tile-cust {
      padding: 1rem;
      border-radius: 14px;
      background: var(--sab-hover);
      border: 1px solid var(--sab-divider);
    }
    .tile-cust-h { display: flex; align-items: flex-start; gap: 0.75rem; margin-bottom: 0.85rem; }
    .dev-h-meta { flex: 1; min-width: 0; padding-top: 0.2rem; }
    .preview {
      width: clamp(160px, 30%, 240px);
      flex-shrink: 0;
      pointer-events: none;
    }
    .preview sab-tile-card { display: block; width: 100%; }
    @media (max-width: 600px) {
      .tile-cust-h { flex-direction: column; }
      .preview { width: 100%; }
    }
    .cust-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
    .cust-l { font-size: 0.75rem; color: var(--sab-muted); min-width: 110px; }
    .cust-l.small { min-width: auto; }

    .bindings { margin-top: 0.85rem; border-top: 1px solid var(--sab-divider); padding-top: 0.85rem; }
    .bind-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.4rem 0;
      border-bottom: 1px solid color-mix(in srgb, var(--sab-divider) 50%, transparent);
    }
    .bind-row:last-child { border-bottom: 0; }
    .bind-attr {
      flex: 0 0 35%;
      font-family: ui-monospace, monospace;
      font-size: 0.8rem;
      color: var(--sab-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

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
    button.ghost.small { padding: 0.4rem 0.75rem; font-size: 0.8rem; }
    button.ghost:hover { background: var(--sab-hover); }

    :host([dir="rtl"]) .dev-id, :host([dir="rtl"]) .input.mono, :host([dir="rtl"]) .room-name { direction: ltr; text-align: end; unicode-bidi: plaintext; }
    :host([dir="rtl"]) .dev { text-align: start; }

    .dirty-badge {
      color: var(--warning-color, #f59e0b);
      font-size: 0.85rem;
      margin-inline-start: auto;
      margin-inline-end: 0.6rem;
      animation: dirty-pulse 1.4s ease-in-out infinite;
    }
    @keyframes dirty-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .confirm-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.55);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      z-index: 1;
    }
    .confirm-box {
      background: var(--sab-surface);
      color: var(--sab-text);
      border: 1px solid var(--sab-divider);
      border-radius: 18px;
      padding: 1.5rem;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.4);
    }
    .confirm-box h2 { font-size: 1.15rem; font-weight: 700; margin: 0 0 0.4rem; letter-spacing: -0.02em; }
    .confirm-box p { font-size: 0.9rem; color: var(--sab-muted); margin: 0 0 1.25rem; line-height: 1.5; }
    .confirm-actions { display: flex; justify-content: flex-end; gap: 0.6rem; }
    .confirm-actions .primary.danger {
      background: var(--error-color, #ef4444);
      color: #fff;
    }
  `;
}

interface TileOverrides {
  size: TileSize;
  customName: string;
  customIcon: string;
  colorOverride: string;
  bindings: AttributeBinding[];
}

function defaultBindingForFamily(family: DeviceFamily): AttributeRender {
  if (family === 'sensor') return 'sparkline';
  return 'text';
}

declare global { interface HTMLElementTagNameMap { 'sab-wizard': SabWizard } }
