import { LitElement, css, html, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('sab-bottom-sheet')
export class SabBottomSheet extends LitElement {
  @property({ type: Boolean, reflect: true }) open = false;

  private close = (): void => {
    this.dispatchEvent(new CustomEvent('sheet-close', { bubbles: true, composed: true }));
  };

  override render(): TemplateResult {
    return html`
      <div class="backdrop" @click=${this.close}></div>
      <div class="sheet" @click=${(e: Event) => e.stopPropagation()}>
        <div class="grabber"></div>
        <slot></slot>
      </div>
    `;
  }

  static override styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 100;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.18s ease;
    }
    :host([open]) { pointer-events: auto; opacity: 1; }
    .backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.55);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
    }
    .sheet {
      position: absolute;
      left: 0; right: 0; bottom: 0;
      max-height: 85vh;
      overflow-y: auto;
      background: var(--card-background-color, #14141a);
      color: var(--primary-text-color, #f8fafc);
      border-radius: 24px 24px 0 0;
      padding: 0.5rem 1.25rem 2rem;
      transform: translateY(20px);
      transition: transform 0.22s ease;
      box-shadow: 0 -10px 40px rgba(0,0,0,0.5);
    }
    :host([open]) .sheet { transform: translateY(0); }
    .grabber {
      width: 42px; height: 4px;
      border-radius: 999px;
      background: rgba(255,255,255,0.2);
      margin: 0.5rem auto 1rem;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'sab-bottom-sheet': SabBottomSheet;
  }
}
