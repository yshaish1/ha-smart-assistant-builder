import { LitElement, css, html, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { HistoryPoint } from '../ha/history.js';

@customElement('sab-sparkline')
export class SabSparkline extends LitElement {
  @property({ attribute: false }) points: HistoryPoint[] = [];
  @property({ type: Number }) width = 280;
  @property({ type: Number }) height = 60;

  override render(): TemplateResult {
    if (!this.points.length) {
      return html`<svg width=${this.width} height=${this.height}></svg>`;
    }
    const { width: w, height: h } = this;
    const padding = 2;
    const values = this.points.map(p => p.v);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const stepX = (w - padding * 2) / (this.points.length - 1 || 1);
    const path = this.points.map((p, i) => {
      const x = padding + i * stepX;
      const y = h - padding - ((p.v - min) / range) * (h - padding * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const lastX = padding + (this.points.length - 1) * stepX;
    const lastY = h - padding - ((this.points[this.points.length - 1]!.v - min) / range) * (h - padding * 2);
    const fill = `${path} L${lastX.toFixed(1)},${h} L${padding},${h} Z`;

    return html`
      <svg width=${w} height=${h} viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sab-spark-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="currentColor" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="currentColor" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d=${fill} fill="url(#sab-spark-grad)" />
        <path d=${path} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx=${lastX.toFixed(1)} cy=${lastY.toFixed(1)} r="2.5" fill="currentColor" />
      </svg>
    `;
  }

  static override styles = css`
    :host { display: inline-block; line-height: 0; }
    svg { display: block; }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'sab-sparkline': SabSparkline;
  }
}
