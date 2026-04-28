import { LitElement, css, html, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { RealDevice, Tile } from '../types.js';
import { familyIcon, isOnState } from '../tiles/smart-defaults.js';

@customElement('sab-tile')
export class SabTile extends LitElement {
  @property({ attribute: false }) tile!: Tile;
  @property({ attribute: false }) device!: RealDevice;
  @property({ type: Boolean }) editMode = false;

  private pressTimer: number | undefined;
  private longPressed = false;

  private startPress = (e: PointerEvent): void => {
    if (this.editMode) return;
    this.longPressed = false;
    this.pressTimer = window.setTimeout(() => {
      this.longPressed = true;
      this.dispatchEvent(new CustomEvent('tile-long-press', { bubbles: true, composed: true, detail: { tile: this.tile } }));
    }, 380);
    void e;
  };

  private endPress = (e: PointerEvent): void => {
    if (this.pressTimer != null) {
      clearTimeout(this.pressTimer);
      this.pressTimer = undefined;
    }
    if (this.longPressed) { this.longPressed = false; return; }
    if (this.editMode) {
      this.dispatchEvent(new CustomEvent('tile-edit-tap', { bubbles: true, composed: true, detail: { tile: this.tile } }));
      return;
    }
    this.dispatchEvent(new CustomEvent('tile-tap', { bubbles: true, composed: true, detail: { tile: this.tile } }));
    void e;
  };

  private onSlider = (e: Event): void => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    this.dispatchEvent(new CustomEvent('tile-slider', { bubbles: true, composed: true, detail: { tile: this.tile, value } }));
  };

  private onDelete = (e: Event): void => {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('tile-delete', { bubbles: true, composed: true, detail: { tile: this.tile } }));
  };

  override render(): TemplateResult {
    const d = this.device;
    const on = isOnState(d.state);
    const showSlider = !this.editMode && (
      (d.family === 'light' && (d.attributes['brightness'] != null)) ||
      (d.family === 'fan' && d.attributes['percentage'] != null) ||
      (d.family === 'cover' && d.attributes['current_position'] != null)
    );
    const sliderValue = sliderValueFor(d);

    return html`
      <div
        class="tile ${on ? 'on' : 'off'} family-${d.family} ${this.editMode ? 'edit' : ''}"
        @pointerdown=${this.startPress}
        @pointerup=${this.endPress}
        @pointerleave=${() => { if (this.pressTimer != null) { clearTimeout(this.pressTimer); this.pressTimer = undefined; } }}
        @pointercancel=${() => { if (this.pressTimer != null) { clearTimeout(this.pressTimer); this.pressTimer = undefined; } }}
        title=${d.entityId}
      >
        ${this.editMode ? html`<button class="del" @click=${this.onDelete} aria-label="Remove tile">×</button>` : ''}
        <div class="icon">${familyIcon(d.family)}</div>
        <div class="name">${d.friendlyName}</div>
        <div class="state">${formatState(d)}</div>
        ${showSlider ? html`
          <input
            class="slider"
            type="range"
            min="0"
            max="100"
            .value=${String(sliderValue)}
            @input=${this.onSlider}
            @click=${(e: Event) => e.stopPropagation()}
            @pointerdown=${(e: Event) => e.stopPropagation()}
          />
        ` : ''}
      </div>
    `;
  }

  static override styles = css`
    :host { display: block; }

    .tile {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      padding: 1rem 1.15rem;
      min-height: 116px;
      border-radius: 18px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      transition: background 0.15s ease, border-color 0.15s ease, transform 0.05s ease, box-shadow 0.15s ease;
      color: var(--primary-text-color, #f8fafc);
    }
    .tile:hover { background: rgba(255,255,255,0.07); }
    .tile:active { transform: scale(0.98); }

    .tile.on { background: linear-gradient(140deg, rgba(255,214,128,0.95), rgba(255,168,77,0.85)); border-color: rgba(255,214,128,0.5); color: #1a1206; }
    .tile.on.family-lock,
    .tile.on.family-cover { background: linear-gradient(140deg, rgba(99,102,241,0.95), rgba(79,70,229,0.85)); border-color: rgba(99,102,241,0.5); color: #fff; }
    .tile.on.family-climate,
    .tile.on.family-fan,
    .tile.on.family-media,
    .tile.on.family-vacuum { background: linear-gradient(140deg, rgba(34,197,94,0.95), rgba(21,128,61,0.85)); border-color: rgba(34,197,94,0.5); color: #fff; }

    .tile.edit { animation: jiggle 0.6s infinite; cursor: grab; }
    @keyframes jiggle {
      0%, 100% { transform: rotate(-0.6deg); }
      50% { transform: rotate(0.6deg); }
    }

    .icon { font-size: 1.5rem; line-height: 1; margin-bottom: 0.35rem; }
    .name { font-size: 0.95rem; font-weight: 600; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .state { font-size: 0.8rem; opacity: 0.8; }

    .slider {
      margin-top: 0.5rem;
      width: 100%;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: rgba(0,0,0,0.18);
      border-radius: 999px;
      outline: none;
      cursor: pointer;
    }
    .tile.on .slider { background: rgba(0,0,0,0.2); }
    .slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 14px; height: 14px;
      border-radius: 50%;
      background: currentColor;
      cursor: pointer;
    }
    .slider::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: currentColor; border: 0; cursor: pointer; }

    .del {
      position: absolute;
      top: -8px;
      right: -8px;
      width: 24px; height: 24px;
      border-radius: 50%;
      border: 0;
      background: #ef4444;
      color: white;
      font-size: 1rem;
      line-height: 1;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      z-index: 2;
    }
  `;
}

function sliderValueFor(d: RealDevice): number {
  if (d.family === 'light') {
    const b = d.attributes['brightness'];
    if (typeof b === 'number') return Math.round((b / 255) * 100);
  }
  if (d.family === 'fan') {
    const p = d.attributes['percentage'];
    if (typeof p === 'number') return Math.round(p);
  }
  if (d.family === 'cover') {
    const p = d.attributes['current_position'];
    if (typeof p === 'number') return Math.round(p);
  }
  return 0;
}

function formatState(d: RealDevice): string {
  if (d.family === 'sensor') {
    const unit = d.attributes['unit_of_measurement'] as string | undefined;
    return unit ? `${d.state} ${unit}` : d.state;
  }
  if (d.family === 'binary_sensor') {
    const cls = d.attributes['device_class'] as string | undefined;
    if (cls === 'motion') return d.state === 'on' ? 'Motion detected' : 'Clear';
    if (cls === 'window' || cls === 'door') return d.state === 'on' ? 'Open' : 'Closed';
    if (cls === 'moisture') return d.state === 'on' ? 'Wet' : 'Dry';
    return d.state;
  }
  if (d.family === 'climate') {
    const cur = d.attributes['current_temperature'];
    const target = d.attributes['temperature'];
    if (cur != null && target != null) return `${cur}° → ${target}°`;
  }
  if (d.family === 'media') {
    const title = d.attributes['media_title'] as string | undefined;
    if (title && d.state === 'playing') return `▶ ${title}`;
  }
  if (d.family === 'cover') {
    const pos = d.attributes['current_position'];
    if (typeof pos === 'number') return `${pos}% open`;
  }
  if (d.family === 'vacuum') {
    const battery = d.attributes['battery_level'];
    if (typeof battery === 'number') return `${d.state} · ${battery}%`;
  }
  return d.state;
}

declare global {
  interface HTMLElementTagNameMap {
    'sab-tile': SabTile;
  }
}
