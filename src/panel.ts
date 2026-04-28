import { LitElement, css, html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HassAdapter } from './ha/adapter.js';
import { RealHassAdapter, type HassLike } from './ha/adapter.real.js';
import { listRealDevices } from './ha/filter.js';
import { MockHistorySource, type HistorySource } from './ha/history.js';
import type { Dashboard, RealDevice, StoredConfig, Tile } from './types.js';
import {
  addDashboard,
  deleteDashboard,
  deleteTile,
  emptyConfig,
  getActive,
  moveTile,
  renameDashboard,
  replaceDashboard,
  setActive,
} from './store/dashboards.js';
import type { ConfigStorage } from './store/storage.js';
import { LocalConfigStorage } from './store/storage.local.js';
import { HaConfigStorage } from './store/storage.ha.js';
import './components/dashboard-tile.js';
import './components/detail-sheet.js';
import './components/sparkline.js';
import './wizard/wizard.js';

@customElement('smart-assistant-panel')
export class SmartAssistantPanel extends LitElement {
  /** Mock injection (used by dev shell). */
  @property({ attribute: false }) adapter?: HassAdapter;
  /** HA injects this when registered as a custom panel. */
  @property({ attribute: false }) hass?: HassLike;
  /** HA also passes these. */
  @property({ type: Boolean }) narrow = false;
  @property({ attribute: false }) panel?: unknown;
  @property({ attribute: false }) route?: unknown;

  @state() private config: StoredConfig | null = null;
  @state() private devices: RealDevice[] = [];
  @state() private editMode = false;
  @state() private wizardOpen = false;
  @state() private detailDevice: RealDevice | null = null;
  @state() private renamingDashboard = false;

  private storage: ConfigStorage = new LocalConfigStorage();
  private historySource: HistorySource = new MockHistorySource();
  private realAdapter?: RealHassAdapter;
  private unsubscribe?: () => void;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.bootstrap();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsubscribe?.();
    this.realAdapter?.dispose();
  }

  override updated(changed: Map<string, unknown>): void {
    if (changed.has('hass') && this.hass && !this.adapter) {
      if (!this.realAdapter) {
        this.realAdapter = new RealHassAdapter(this.hass);
        this.storage = new HaConfigStorage(this.hass);
        void this.realAdapter.loadRegistries().then(() => {
          this.adapter = this.realAdapter;
          this.attachAdapter();
          void this.reloadConfig();
          this.refresh();
        });
      } else {
        this.realAdapter.setHass(this.hass);
      }
    }
    if (changed.has('adapter')) {
      this.attachAdapter();
      this.refresh();
    }
  }

  private async bootstrap(): Promise<void> {
    await this.reloadConfig();
    if (this.adapter) {
      this.attachAdapter();
      this.refresh();
    }
  }

  private async reloadConfig(): Promise<void> {
    let cfg = await this.storage.load();
    if (!cfg) {
      cfg = emptyConfig();
      await this.storage.save(cfg);
    }
    this.config = cfg;
  }

  private attachAdapter(): void {
    this.unsubscribe?.();
    if (!this.adapter) return;
    this.unsubscribe = this.adapter.subscribe(() => this.refresh());
  }

  private refresh(): void {
    if (!this.adapter) { this.devices = []; return; }
    this.devices = listRealDevices(this.adapter);
  }

  private async saveConfig(next: StoredConfig): Promise<void> {
    this.config = next;
    await this.storage.save(next);
  }

  private get active(): Dashboard | null {
    return this.config ? getActive(this.config) : null;
  }

  private deviceFor(entityId: string): RealDevice | undefined {
    return this.devices.find(d => d.entityId === entityId);
  }

  private async onTilePrimary(tile: Tile): Promise<void> {
    if (!this.adapter) return;
    const d = this.deviceFor(tile.entityId);
    if (!d) return;
    const data = { entity_id: d.entityId };
    switch (d.family) {
      case 'light':
      case 'switch':
      case 'fan':
        await this.adapter.callService(d.family, 'toggle', data); break;
      case 'lock':
        await this.adapter.callService('lock', d.state === 'locked' ? 'unlock' : 'lock', data); break;
      case 'cover':
        await this.adapter.callService('cover', d.state === 'closed' ? 'open_cover' : 'close_cover', data); break;
      case 'media':
        await this.adapter.callService('media_player', 'media_play_pause', data); break;
      case 'climate':
      case 'vacuum':
      case 'sensor':
      case 'binary_sensor':
        // tap on read-only / multi-state opens the detail sheet
        this.detailDevice = d; break;
    }
  }

  private async onTileSlider(tile: Tile, value: number): Promise<void> {
    if (!this.adapter) return;
    const d = this.deviceFor(tile.entityId);
    if (!d) return;
    if (d.family === 'light') {
      const brightness = Math.round((value / 100) * 255);
      await this.adapter.callService('light', 'turn_on', { entity_id: d.entityId, brightness });
    } else if (d.family === 'fan') {
      await this.adapter.callService('fan', 'set_percentage', { entity_id: d.entityId, percentage: Math.round(value) });
    } else if (d.family === 'cover') {
      await this.adapter.callService('cover', 'set_cover_position', { entity_id: d.entityId, position: Math.round(value) });
    }
  }

  private onTileLongPress(tile: Tile): void {
    const d = this.deviceFor(tile.entityId);
    if (d) this.detailDevice = d;
  }

  private async onTileDelete(tile: Tile): Promise<void> {
    if (!this.config || !this.active) return;
    const room = this.active.rooms.find(r => r.tiles.some(t => t.id === tile.id));
    if (!room) return;
    const next = deleteTile(this.active, room.id, tile.id);
    await this.saveConfig(replaceDashboard(this.config, next));
  }

  // drag-and-drop reorder
  private dragSourceRoom: string | null = null;
  private dragSourceIdx = -1;

  private onTileDragStart(roomId: string, idx: number, e: DragEvent): void {
    if (!this.editMode) return;
    this.dragSourceRoom = roomId;
    this.dragSourceIdx = idx;
    e.dataTransfer?.setData('text/plain', `${roomId}:${idx}`);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  private onTileDragOver(e: DragEvent): void {
    if (!this.editMode) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  private async onTileDrop(roomId: string, idx: number, e: DragEvent): Promise<void> {
    if (!this.editMode || !this.config || !this.active) return;
    e.preventDefault();
    if (this.dragSourceRoom !== roomId || this.dragSourceIdx < 0) return;
    if (this.dragSourceIdx === idx) return;
    const next = moveTile(this.active, roomId, this.dragSourceIdx, idx);
    await this.saveConfig(replaceDashboard(this.config, next));
    this.dragSourceRoom = null;
    this.dragSourceIdx = -1;
  }

  private toggleEdit(): void { this.editMode = !this.editMode; this.renamingDashboard = false; }

  private openWizard(): void { this.wizardOpen = true; }
  private closeWizard(): void { this.wizardOpen = false; }

  private async onWizardDone(e: CustomEvent<{ dashboard: Dashboard }>): Promise<void> {
    if (!this.config) return;
    await this.saveConfig(replaceDashboard(this.config, e.detail.dashboard));
    this.wizardOpen = false;
  }

  private async addDashboardClick(): Promise<void> {
    if (!this.config) return;
    const name = prompt('Name for new dashboard:', 'New Dashboard');
    if (!name) return;
    await this.saveConfig(addDashboard(this.config, name));
  }

  private async switchDashboard(id: string): Promise<void> {
    if (!this.config) return;
    await this.saveConfig(setActive(this.config, id));
  }

  private async deleteCurrentDashboard(): Promise<void> {
    if (!this.config || !this.active) return;
    if (this.config.dashboards.length === 1) return;
    if (!confirm(`Delete dashboard "${this.active.name}"?`)) return;
    await this.saveConfig(deleteDashboard(this.config, this.active.id));
  }

  private async renameCurrentDashboard(name: string): Promise<void> {
    if (!this.config || !this.active) return;
    await this.saveConfig(renameDashboard(this.config, this.active.id, name));
  }

  override render(): TemplateResult {
    if (!this.config) {
      return html`<div class="loading">Loading...</div>`;
    }
    if (!this.adapter) {
      return html`<div class="loading">Connecting to Home Assistant...</div>`;
    }
    const dash = this.active!;
    const isEmpty = dash.rooms.length === 0;

    return html`
      <header>
        <div class="dashboards">
          ${this.config.dashboards.map(d => html`
            <button class="tab ${d.id === dash.id ? 'active' : ''}" @click=${() => this.switchDashboard(d.id)}>${d.name}</button>
          `)}
          <button class="tab add" @click=${this.addDashboardClick} title="New dashboard">+</button>
        </div>
        <div class="actions">
          <span class="count">${this.devices.length} real devices</span>
          <button class="icon-btn" @click=${this.openWizard} title="Add to dashboard">+</button>
          <button class="icon-btn ${this.editMode ? 'on' : ''}" @click=${this.toggleEdit} title="Edit mode">✎</button>
        </div>
      </header>

      ${this.editMode ? html`
        <div class="edit-bar">
          ${this.renamingDashboard ? html`
            <input
              class="rename-input"
              .value=${dash.name}
              @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') { this.renameCurrentDashboard((e.target as HTMLInputElement).value); this.renamingDashboard = false; } }}
              @blur=${(e: FocusEvent) => { this.renameCurrentDashboard((e.target as HTMLInputElement).value); this.renamingDashboard = false; }}
            />
          ` : html`
            <button class="ghost" @click=${() => { this.renamingDashboard = true; }}>Rename "${dash.name}"</button>
          `}
          <button class="ghost danger" @click=${this.deleteCurrentDashboard} ?disabled=${this.config.dashboards.length === 1}>Delete dashboard</button>
        </div>
      ` : ''}

      <main>
        ${isEmpty ? this.renderEmptyState() : this.renderDashboard(dash)}
      </main>

      ${this.wizardOpen ? html`
        <sab-wizard
          .adapter=${this.adapter}
          .dashboard=${dash}
          @wizard-done=${this.onWizardDone}
          @wizard-cancel=${this.closeWizard}
        ></sab-wizard>
      ` : ''}

      <sab-detail-sheet
        .device=${this.detailDevice}
        .adapter=${this.adapter}
        .history=${this.historySource}
        ?open=${!!this.detailDevice}
        @detail-close=${() => { this.detailDevice = null; }}
      ></sab-detail-sheet>
    `;
  }

  private renderEmptyState(): TemplateResult {
    return html`
      <div class="empty">
        <div class="empty-icon">🏠</div>
        <h2>No tiles yet.</h2>
        <p>Build your first room with the wizard. We'll only show your real devices.</p>
        <button class="primary" @click=${this.openWizard}>Create your dashboard</button>
      </div>
    `;
  }

  private renderDashboard(dash: Dashboard): TemplateResult {
    return html`
      ${dash.rooms.map(room => html`
        <section class="room">
          <h2>${room.name}</h2>
          <div class="grid">
            ${room.tiles.map((tile, idx) => {
              const dev = this.deviceFor(tile.entityId);
              if (!dev) {
                return html`
                  <div class="tile-missing" title=${tile.entityId}>
                    <div class="missing-icon">⚠</div>
                    <div class="missing-name">${tile.entityId}</div>
                    <div class="missing-state">Unavailable</div>
                  </div>
                `;
              }
              return html`
                <div
                  class="tile-wrap"
                  draggable=${this.editMode ? 'true' : 'false'}
                  @dragstart=${(e: DragEvent) => this.onTileDragStart(room.id, idx, e)}
                  @dragover=${this.onTileDragOver}
                  @drop=${(e: DragEvent) => this.onTileDrop(room.id, idx, e)}
                >
                  <sab-tile
                    .tile=${tile}
                    .device=${dev}
                    ?editMode=${this.editMode}
                    @tile-tap=${(e: CustomEvent<{ tile: Tile }>) => this.onTilePrimary(e.detail.tile)}
                    @tile-long-press=${(e: CustomEvent<{ tile: Tile }>) => this.onTileLongPress(e.detail.tile)}
                    @tile-slider=${(e: CustomEvent<{ tile: Tile; value: number }>) => this.onTileSlider(e.detail.tile, e.detail.value)}
                    @tile-delete=${(e: CustomEvent<{ tile: Tile }>) => this.onTileDelete(e.detail.tile)}
                  ></sab-tile>
                </div>
              `;
            })}
            ${this.editMode ? html`
              <button class="add-tile" @click=${this.openWizard}>+</button>
            ` : ''}
          </div>
        </section>
      `)}
    `;
  }

  static override styles = css`
    :host {
      display: block;
      min-height: 100vh;
      color: var(--primary-text-color, #f8fafc);
      background:
        radial-gradient(circle at 20% 0%, rgba(99,102,241,0.15), transparent 40%),
        radial-gradient(circle at 80% 100%, rgba(99,102,241,0.08), transparent 40%),
        var(--primary-background-color, #0a0a0a);
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: clamp(1rem, 2.5vw, 1.5rem) clamp(1.25rem, 4vw, 3rem);
      gap: 1rem;
      flex-wrap: wrap;
      position: sticky;
      top: 0;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      background: rgba(10,10,10,0.6);
      z-index: 5;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .dashboards { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .tab {
      padding: 0.5rem 0.95rem;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.1);
      background: transparent;
      color: var(--secondary-text-color, #94a3b8);
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 500;
    }
    .tab:hover { background: rgba(255,255,255,0.05); }
    .tab.active { background: #6366f1; color: white; border-color: #6366f1; }
    .tab.add { width: 36px; padding: 0.5rem 0; text-align: center; font-size: 1.1rem; line-height: 1; color: var(--secondary-text-color, #94a3b8); }

    .actions { display: flex; align-items: center; gap: 0.6rem; }
    .count { font-size: 0.8rem; color: var(--secondary-text-color, #94a3b8); }
    .icon-btn {
      width: 36px; height: 36px;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.1);
      background: transparent;
      color: var(--primary-text-color, #f8fafc);
      cursor: pointer;
      font-size: 1rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .icon-btn:hover { background: rgba(255,255,255,0.06); }
    .icon-btn.on { background: #6366f1; color: white; border-color: #6366f1; }

    .edit-bar {
      display: flex;
      gap: 0.5rem;
      padding: 0.75rem clamp(1.25rem, 4vw, 3rem);
      background: rgba(99,102,241,0.06);
      border-bottom: 1px solid rgba(99,102,241,0.15);
      align-items: center;
    }
    .ghost {
      padding: 0.5rem 0.95rem;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.12);
      background: transparent;
      color: inherit;
      cursor: pointer;
      font-size: 0.85rem;
    }
    .ghost:hover { background: rgba(255,255,255,0.05); }
    .ghost.danger { color: #ef4444; border-color: rgba(239,68,68,0.3); }
    .ghost[disabled] { opacity: 0.5; cursor: not-allowed; }
    .rename-input {
      padding: 0.5rem 0.95rem;
      border-radius: 8px;
      border: 1px solid rgba(99,102,241,0.5);
      background: rgba(0,0,0,0.3);
      color: inherit;
      font-size: 0.95rem;
      outline: none;
    }

    main {
      padding: clamp(1.5rem, 3vw, 2.5rem) clamp(1.25rem, 4vw, 3rem) clamp(2rem, 5vw, 4rem);
      max-width: 1400px;
      margin: 0 auto;
    }

    .room { margin-bottom: 2.5rem; }
    .room h2 {
      font-size: 1.1rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      margin: 0 0 1rem 0.25rem;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 0.85rem;
    }

    .tile-wrap { position: relative; }
    .tile-wrap[draggable="true"] { cursor: grab; }

    .tile-missing {
      padding: 1rem 1.15rem;
      min-height: 116px;
      border-radius: 18px;
      background: rgba(239,68,68,0.05);
      border: 1px dashed rgba(239,68,68,0.3);
      color: #fca5a5;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .missing-icon { font-size: 1.5rem; }
    .missing-name { font-size: 0.85rem; font-family: ui-monospace, monospace; }
    .missing-state { font-size: 0.75rem; opacity: 0.7; }

    .add-tile {
      min-height: 116px;
      border-radius: 18px;
      border: 2px dashed rgba(255,255,255,0.15);
      background: transparent;
      color: var(--secondary-text-color, #94a3b8);
      cursor: pointer;
      font-size: 1.5rem;
    }
    .add-tile:hover { border-color: rgba(99,102,241,0.6); color: #6366f1; }

    .empty {
      padding: 5rem 2rem;
      text-align: center;
      max-width: 500px;
      margin: 0 auto;
    }
    .empty-icon { font-size: 4rem; margin-bottom: 1.25rem; }
    .empty h2 { font-size: 1.5rem; font-weight: 700; margin: 0 0 0.5rem; letter-spacing: -0.02em; }
    .empty p { color: var(--secondary-text-color, #94a3b8); margin: 0 0 1.75rem; line-height: 1.5; }
    .empty button.primary {
      padding: 0.85rem 1.75rem;
      border-radius: 999px;
      border: 0;
      background: #6366f1;
      color: white;
      font-weight: 600;
      cursor: pointer;
      font-size: 0.95rem;
    }
    .empty button.primary:hover { background: #4f46e5; }

    .loading {
      padding: 4rem 2rem;
      text-align: center;
      color: var(--secondary-text-color, #94a3b8);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'smart-assistant-panel': SmartAssistantPanel;
  }
}
