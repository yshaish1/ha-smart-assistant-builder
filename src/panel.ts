import { LitElement, css, html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HassAdapter } from './ha/adapter.js';
import { RealHassAdapter, type HassLike } from './ha/adapter.real.js';
import type { Dashboard, ManagedDashboard } from './types.js';
import { DEFAULT_SETTINGS } from './types.js';
import { ManagedConfigStore } from './store/managed.js';
import { LocalConfigStorage } from './store/storage.local.js';
import { HaConfigStorage } from './store/storage.ha.js';
import {
  createDashboard,
  createResource,
  deleteDashboard as apiDeleteDashboard,
  getConfig,
  listDashboards,
  listResources,
  saveConfig,
  slugify,
  updateResource,
} from './lovelace/api.js';
import { generateLovelaceConfig, isSabManagedConfig } from './lovelace/generator.js';
import './wizard/wizard.js';

const RTL_LANGS = new Set(['he', 'ar', 'fa', 'ur']);
const PANEL_VERSION = '0.4.3';
const RESOURCE_URL = `/hacsfiles/ha-smart-assistant-builder/smart-assistant-builder.js?v=${PANEL_VERSION}`;

@customElement('smart-assistant-panel')
export class SmartAssistantPanel extends LitElement {
  /** Mock injection for the dev shell. */
  @property({ attribute: false }) adapter?: HassAdapter;
  /** HA injects this when registered as a custom panel. */
  @property({ attribute: false }) hass?: HassLike;
  @property({ type: Boolean }) narrow = false;
  @property({ attribute: false }) panel?: unknown;
  @property({ attribute: false }) route?: unknown;

  @state() private managed: ManagedDashboard[] = [];
  @state() private wizardOpen = false;
  @state() private editing: ManagedDashboard | null = null;
  @state() private error: string | null = null;
  @state() private saving = false;

  private store: ManagedConfigStore = new ManagedConfigStore(new LocalConfigStorage());
  private realAdapter?: RealHassAdapter;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.bootstrap();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.realAdapter?.dispose();
  }

  override updated(changed: Map<string, unknown>): void {
    if (changed.has('hass') && this.hass) {
      this.applyDirection(this.hass);
      if (!this.adapter) {
        if (!this.realAdapter) {
          this.realAdapter = new RealHassAdapter(this.hass);
          this.store.setStorage(new HaConfigStorage(this.hass));
          void this.realAdapter.loadRegistries().then(async () => {
            this.adapter = this.realAdapter;
            await this.loadManaged();
            void this.ensureResourceRegistered();
          });
        } else {
          this.realAdapter.setHass(this.hass);
        }
      }
    }
  }

  private applyDirection(hass: HassLike): void {
    const lang = ((hass as unknown as { language?: string; locale?: { language?: string } }).language
      ?? (hass as unknown as { locale?: { language?: string } }).locale?.language ?? 'en').slice(0, 2);
    const dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr';
    if (this.dir !== dir) this.dir = dir;
  }

  private async bootstrap(): Promise<void> {
    await this.loadManaged();
  }

  private async loadManaged(): Promise<void> {
    const cfg = await this.store.load();
    this.managed = cfg.dashboards.slice().sort((a, b) => a.title.localeCompare(b.title));
  }

  private openWizard(): void { this.editing = null; this.wizardOpen = true; this.error = null; }
  private editManaged(m: ManagedDashboard): void { this.editing = m; this.wizardOpen = true; this.error = null; }
  private closeWizard(): void { this.wizardOpen = false; this.editing = null; }

  private async onWizardDone(e: CustomEvent<{ dashboard: Dashboard }>): Promise<void> {
    if (!this.hass) {
      this.error = 'No Home Assistant connection.';
      return;
    }
    this.error = null;
    this.saving = true;
    const dashboard = e.detail.dashboard;
    const editing = this.editing;
    try {
      console.info('[SAB] saving dashboard', dashboard);
      const urlPath = editing?.urlPath ?? await this.uniqueUrlPath(dashboard.name);
      console.info('[SAB] resolved url_path', urlPath);
      const config = generateLovelaceConfig(dashboard);
      console.info('[SAB] generated lovelace config', config);

      if (!editing) {
        const created = await createDashboard(this.hass, {
          url_path: urlPath,
          title: dashboard.name,
          icon: 'mdi:home-heart',
          show_in_sidebar: true,
        });
        console.info('[SAB] dashboard created', created);
      }

      await saveConfig(this.hass, urlPath, config);
      console.info('[SAB] lovelace config saved for', urlPath);

      const now = Date.now();
      const managed: ManagedDashboard = {
        urlPath,
        title: dashboard.name,
        icon: 'mdi:home-heart',
        dashboard,
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
      };
      await this.store.upsert(managed);
      await this.loadManaged();
      this.wizardOpen = false;
      this.editing = null;
      this.saving = false;

      // Open the freshly created/updated dashboard in HA
      const navUrl = `/${urlPath}`;
      window.history.pushState(null, '', navUrl);
      window.dispatchEvent(new Event('location-changed'));
    } catch (err) {
      console.error('[SAB] save failed', err);
      const msg = err instanceof Error ? err.message : (err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err));
      this.error = msg;
      this.saving = false;
    }
  }

  private async uniqueUrlPath(title: string): Promise<string> {
    if (!this.hass) return slugify(title);
    const base = slugify(title);
    const existing = await listDashboards(this.hass);
    const taken = new Set(existing.map(d => d.url_path));
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base}-${i}`)) i += 1;
    return `${base}-${i}`;
  }

  private async deleteManaged(m: ManagedDashboard, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (!this.hass) return;
    if (!confirm(`Delete dashboard "${m.title}"? This removes it from the sidebar and deletes its config.`)) return;
    try {
      const list = await listDashboards(this.hass);
      const entry = list.find(d => d.url_path === m.urlPath);
      if (entry) await apiDeleteDashboard(this.hass, entry.id);
      await this.store.remove(m.urlPath);
      await this.loadManaged();
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      // done
    }
  }

  private openInSidebar(m: ManagedDashboard, ev: Event): void {
    ev.stopPropagation();
    window.history.pushState(null, '', `/${m.urlPath}`);
    window.dispatchEvent(new Event('location-changed'));
  }

  /** Make sure our JS is registered as a Lovelace resource so the
   * custom <sab-tile-card> element loads on every dashboard, not just inside
   * Smart panel. Idempotent: skips if already present, updates the URL if the
   * version changed. */
  private async ensureResourceRegistered(): Promise<void> {
    if (!this.hass) return;
    try {
      const list = await listResources(this.hass);
      const baseUrl = RESOURCE_URL.split('?')[0]!;
      const existing = list.find(r => (r.url ?? '').split('?')[0] === baseUrl);
      if (!existing) {
        console.info('[SAB] registering Lovelace resource', RESOURCE_URL);
        await createResource(this.hass, { res_type: 'module', url: RESOURCE_URL });
      } else if (existing.url !== RESOURCE_URL) {
        console.info('[SAB] updating Lovelace resource version to', RESOURCE_URL);
        await updateResource(this.hass, existing.id, { res_type: 'module', url: RESOURCE_URL });
      }
    } catch (err) {
      // Resource registration requires HA to be in storage mode. If it's in
      // YAML mode, this command errors. We just log and move on.
      console.info('[SAB] could not auto-register resource (likely YAML mode):', err);
    }
  }

  /** Best-effort: scan HA's existing dashboards for ones that look Smart-managed
   * but aren't in our store (e.g. after a backup/restore). Stitches them back in. */
  private async reconcileFromHa(): Promise<void> {
    if (!this.hass) return;
    try {
      const list = await listDashboards(this.hass);
      for (const d of list) {
        if (this.store.byUrlPath(d.url_path)) continue;
        const cfg = await getConfig(this.hass, d.url_path);
        if (cfg && isSabManagedConfig(cfg)) {
          await this.store.upsert({
            urlPath: d.url_path,
            title: d.title,
            icon: d.icon ?? 'mdi:home-heart',
            dashboard: { id: d.url_path, name: d.title, settings: { ...DEFAULT_SETTINGS }, rooms: [] },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      }
      await this.loadManaged();
    } finally {
      // done
    }
  }

  override render(): TemplateResult {
    if (!this.adapter) {
      return html`<div class="state">Connecting to Home Assistant…</div>`;
    }
    return html`
      <header>
        <div class="brand">
          <span class="dot"></span>
          <h1>Smart Assistant Builder</h1>
        </div>
        <div class="actions">
          <button class="ghost" @click=${() => void this.reconcileFromHa()} title="Sync with HA dashboards">↻</button>
          <button class="primary" @click=${this.openWizard}>+ New dashboard</button>
        </div>
      </header>

      <main>
        ${this.error ? html`<div class="err">${this.error}</div>` : ''}
        ${this.managed.length === 0 ? this.renderEmpty() : this.renderList()}
      </main>

      ${this.wizardOpen ? html`
        <sab-wizard
          .adapter=${this.adapter}
          .initialDashboard=${this.editing?.dashboard}
          .mode=${this.editing ? 'edit' : 'create'}
          .saveError=${this.error}
          ?saving=${this.saving}
          @wizard-done=${this.onWizardDone}
          @wizard-cancel=${this.closeWizard}
        ></sab-wizard>
      ` : ''}
    `;
  }

  private renderEmpty(): TemplateResult {
    return html`
      <div class="empty">
        <div class="empty-icon">🏠</div>
        <h2>Build your first smart dashboard</h2>
        <p>The wizard creates a real Home Assistant dashboard from your physical devices, ready to use in the sidebar.</p>
        <button class="primary big" @click=${this.openWizard}>Start the wizard</button>
      </div>
    `;
  }

  private renderList(): TemplateResult {
    return html`
      <div class="list">
        ${this.managed.map(m => html`
          <div class="card" @click=${() => this.editManaged(m)}>
            <div class="card-icon">🏠</div>
            <div class="card-body">
              <div class="card-title">${m.title}</div>
              <div class="card-meta">
                ${m.dashboard.rooms.length} room${m.dashboard.rooms.length === 1 ? '' : 's'} ·
                ${m.dashboard.rooms.reduce((n, r) => n + r.tiles.length, 0)} tile${m.dashboard.rooms.reduce((n, r) => n + r.tiles.length, 0) === 1 ? '' : 's'} ·
                /${m.urlPath}
              </div>
            </div>
            <div class="card-actions">
              <button class="ghost" @click=${(e: Event) => this.openInSidebar(m, e)} title="Open dashboard">Open</button>
              <button class="ghost" @click=${(e: Event) => { e.stopPropagation(); this.editManaged(m); }} title="Edit">Edit</button>
              <button class="ghost danger" @click=${(e: Event) => void this.deleteManaged(m, e)} title="Delete">Delete</button>
            </div>
          </div>
        `)}
      </div>
    `;
  }

  static override styles = css`
    :host {
      --sab-surface: var(--ha-card-background, var(--card-background-color, #fff));
      --sab-bg: var(--primary-background-color, #f5f5f5);
      --sab-text: var(--primary-text-color, #1a1a1a);
      --sab-muted: var(--secondary-text-color, #6b7280);
      --sab-divider: var(--divider-color, rgba(0,0,0,0.1));
      --sab-accent: var(--primary-color, #6366f1);
      --sab-on-accent: var(--text-primary-color, #fff);
      --sab-hover: var(--secondary-background-color, rgba(0,0,0,0.04));
      --sab-danger: var(--error-color, #ef4444);
      display: block;
      min-height: 100vh;
      color: var(--sab-text);
      background: var(--sab-bg);
      font-family: var(--ha-font-family-body, 'Inter', system-ui, sans-serif);
      -webkit-font-smoothing: antialiased;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: clamp(1rem, 2.5vw, 1.5rem) clamp(1.25rem, 4vw, 3rem);
      gap: 1rem;
      flex-wrap: wrap;
      background: var(--sab-surface);
      border-bottom: 1px solid var(--sab-divider);
    }
    .brand { display: flex; align-items: center; gap: 0.85rem; }
    .brand .dot {
      width: 10px; height: 10px; border-radius: 50%;
      background: var(--sab-accent);
      box-shadow: 0 0 16px color-mix(in srgb, var(--sab-accent) 60%, transparent);
    }
    h1 { font-size: clamp(1.05rem, 1.4vw, 1.25rem); font-weight: 700; letter-spacing: -0.02em; margin: 0; color: var(--sab-text); }

    .actions { display: flex; align-items: center; gap: 0.5rem; }

    main {
      padding: clamp(1.5rem, 3vw, 2.5rem) clamp(1.25rem, 4vw, 3rem) clamp(2rem, 5vw, 4rem);
      max-width: 1100px;
      margin: 0 auto;
    }

    .err {
      padding: 1rem 1.25rem;
      border-radius: 10px;
      background: color-mix(in srgb, var(--sab-danger) 10%, transparent);
      border: 1px solid color-mix(in srgb, var(--sab-danger) 40%, transparent);
      color: var(--sab-danger);
      margin-bottom: 1.5rem;
      font-size: 0.9rem;
    }

    .state {
      padding: 4rem 2rem;
      text-align: center;
      color: var(--sab-muted);
    }

    .empty {
      padding: 5rem 2rem 3rem;
      text-align: center;
      max-width: 520px;
      margin: 0 auto;
    }
    .empty-icon { font-size: 4rem; margin-bottom: 1rem; }
    .empty h2 { font-size: 1.5rem; font-weight: 700; margin: 0 0 0.5rem; letter-spacing: -0.02em; color: var(--sab-text); }
    .empty p { color: var(--sab-muted); margin: 0 0 1.75rem; line-height: 1.5; }

    .list { display: flex; flex-direction: column; gap: 0.75rem; }
    .card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem 1.25rem;
      border-radius: 14px;
      background: var(--sab-surface);
      border: 1px solid var(--sab-divider);
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .card:hover { border-color: var(--sab-accent); }
    .card-icon { font-size: 1.75rem; }
    .card-body { flex: 1; min-width: 0; }
    .card-title { font-size: 1rem; font-weight: 600; color: var(--sab-text); margin-bottom: 0.2rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .card-meta { font-size: 0.8rem; color: var(--sab-muted); }
    .card-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }

    button.primary {
      padding: 0.65rem 1.1rem;
      border-radius: 10px;
      border: 0;
      background: var(--sab-accent);
      color: var(--sab-on-accent);
      font-weight: 600;
      cursor: pointer;
      font-size: 0.9rem;
      font-family: inherit;
    }
    button.primary:hover { filter: brightness(0.95); }
    button.primary.big { padding: 0.85rem 1.75rem; font-size: 1rem; border-radius: 999px; }

    button.ghost {
      padding: 0.55rem 0.95rem;
      border-radius: 8px;
      border: 1px solid var(--sab-divider);
      background: transparent;
      color: var(--sab-text);
      cursor: pointer;
      font-size: 0.85rem;
      font-family: inherit;
    }
    button.ghost:hover { background: var(--sab-hover); }
    button.ghost.danger { color: var(--sab-danger); border-color: color-mix(in srgb, var(--sab-danger) 30%, transparent); }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'smart-assistant-panel': SmartAssistantPanel;
  }
}
