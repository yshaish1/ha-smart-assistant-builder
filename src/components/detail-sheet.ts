import { LitElement, css, html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { RealDevice } from '../types.js';
import type { HassAdapter } from '../ha/adapter.js';
import type { HistoryPoint, HistorySource } from '../ha/history.js';
import { familyIcon, familyLabel, isOnState } from '../tiles/smart-defaults.js';
import './sparkline.js';
import './bottom-sheet.js';

@customElement('sab-detail-sheet')
export class SabDetailSheet extends LitElement {
  @property({ attribute: false }) device?: RealDevice;
  @property({ attribute: false }) adapter?: HassAdapter;
  @property({ attribute: false }) history?: HistorySource;
  @property({ type: Boolean }) open = false;

  @state() private points: HistoryPoint[] = [];

  override updated(changed: Map<string, unknown>): void {
    if ((changed.has('device') || changed.has('open')) && this.open && this.device && this.history) {
      this.loadHistory();
    }
  }

  private async loadHistory(): Promise<void> {
    if (!this.device || !this.history) return;
    if (this.device.family !== 'sensor' && this.device.family !== 'climate') {
      this.points = [];
      return;
    }
    this.points = await this.history.fetchHistory(this.device.entityId, 24);
  }

  private close = (): void => {
    this.dispatchEvent(new CustomEvent('detail-close', { bubbles: true, composed: true }));
  };

  private async toggle(): Promise<void> {
    if (!this.adapter || !this.device) return;
    const d = this.device;
    const data = { entity_id: d.entityId };
    switch (d.family) {
      case 'light':
      case 'switch':
      case 'fan':
        await this.adapter.callService(d.family, 'toggle', data);
        break;
      case 'lock':
        await this.adapter.callService('lock', d.state === 'locked' ? 'unlock' : 'lock', data);
        break;
      case 'cover':
        await this.adapter.callService('cover', d.state === 'closed' ? 'open_cover' : 'close_cover', data);
        break;
      case 'media':
        await this.adapter.callService('media_player', 'media_play_pause', data);
        break;
    }
  }

  override render(): TemplateResult {
    if (!this.device) {
      return html`<sab-bottom-sheet ?open=${this.open} @sheet-close=${this.close}></sab-bottom-sheet>`;
    }
    const d = this.device;
    const on = isOnState(d.state);
    const showHistory = (d.family === 'sensor' || d.family === 'climate') && this.points.length > 0;
    const togglable = ['light', 'switch', 'fan', 'lock', 'cover', 'media'].includes(d.family);

    const attrs = Object.entries(d.attributes)
      .filter(([k]) => k !== 'friendly_name' && k !== 'icon' && k !== 'supported_color_modes' && k !== 'supported_features')
      .filter(([, v]) => v != null && v !== '');

    return html`
      <sab-bottom-sheet ?open=${this.open} @sheet-close=${this.close}>
        <header>
          <div class="title">
            <span class="icon">${familyIcon(d.family)}</span>
            <div>
              <div class="name">${d.friendlyName}</div>
              <div class="kind">${familyLabel(d.family)} · ${d.state}</div>
            </div>
          </div>
          <button class="x" @click=${this.close} aria-label="Close">×</button>
        </header>

        ${togglable ? html`
          <button class="primary ${on ? 'on' : ''}" @click=${this.toggle}>
            ${primaryLabel(d, on)}
          </button>
        ` : ''}

        ${showHistory ? html`
          <section class="hist">
            <div class="label">Last 24 hours</div>
            <sab-sparkline .points=${this.points} .width=${600} .height=${80} style="color: var(--accent, #6366f1); width: 100%;"></sab-sparkline>
          </section>
        ` : ''}

        <section class="attrs">
          <div class="label">Attributes</div>
          <dl>
            ${attrs.map(([k, v]) => html`
              <div class="row">
                <dt>${k}</dt>
                <dd>${formatVal(v)}</dd>
              </div>
            `)}
          </dl>
        </section>

        <div class="entity-id">${d.entityId}</div>
      </sab-bottom-sheet>
    `;
  }

  static override styles = css`
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1.25rem;
    }
    .title { display: flex; align-items: center; gap: 0.85rem; }
    .icon { font-size: 1.75rem; }
    .name { font-size: 1.15rem; font-weight: 700; letter-spacing: -0.01em; }
    .kind { font-size: 0.85rem; color: var(--secondary-text-color, #94a3b8); margin-top: 0.15rem; }

    .x {
      width: 32px; height: 32px;
      border: 0;
      border-radius: 50%;
      background: rgba(255,255,255,0.08);
      color: inherit;
      font-size: 1.2rem;
      cursor: pointer;
    }
    .x:hover { background: rgba(255,255,255,0.14); }

    .primary {
      width: 100%;
      padding: 1rem;
      border: 0;
      border-radius: 14px;
      background: rgba(255,255,255,0.08);
      color: inherit;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      margin-bottom: 1.25rem;
      transition: background 0.15s ease;
    }
    .primary:hover { background: rgba(255,255,255,0.12); }
    .primary.on { background: linear-gradient(140deg, rgba(255,214,128,0.95), rgba(255,168,77,0.85)); color: #1a1206; }

    .label {
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--secondary-text-color, #94a3b8);
      margin-bottom: 0.5rem;
    }

    .hist { margin-bottom: 1.25rem; }
    .hist sab-sparkline { display: block; }

    .attrs dl { margin: 0; padding: 0; }
    .attrs .row {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.6rem 0;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .attrs dt { font-size: 0.85rem; color: var(--secondary-text-color, #94a3b8); }
    .attrs dd { margin: 0; font-size: 0.85rem; font-family: ui-monospace, monospace; text-align: right; word-break: break-all; }

    .entity-id {
      margin-top: 1rem;
      font-size: 0.75rem;
      font-family: ui-monospace, monospace;
      color: var(--secondary-text-color, #94a3b8);
      text-align: center;
      opacity: 0.6;
    }
  `;
}

function primaryLabel(d: RealDevice, on: boolean): string {
  switch (d.family) {
    case 'light':
    case 'switch':
    case 'fan': return on ? 'Turn off' : 'Turn on';
    case 'lock': return d.state === 'locked' ? 'Unlock' : 'Lock';
    case 'cover': return d.state === 'closed' ? 'Open' : 'Close';
    case 'media': return on ? 'Pause' : 'Play';
    default: return on ? 'Off' : 'On';
  }
}

function formatVal(v: unknown): string {
  if (Array.isArray(v)) return `[${v.join(', ')}]`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

declare global {
  interface HTMLElementTagNameMap {
    'sab-detail-sheet': SabDetailSheet;
  }
}
