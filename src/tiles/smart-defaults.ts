import type { AttributeBinding, AttributeRender, DeviceFamily, PrimaryAction, TileSize } from '../types.js';

export interface SmartDefault {
  bindings: AttributeBinding[];
  primaryAction: PrimaryAction;
  size: TileSize;
}

export function smartDefaultsFor(family: DeviceFamily): SmartDefault {
  switch (family) {
    case 'light':
      return { bindings: [{ attribute: 'brightness', render: 'slider' }], primaryAction: 'toggle', size: 'medium' };
    case 'switch':
      return { bindings: [], primaryAction: 'toggle', size: 'small' };
    case 'lock':
      return { bindings: [], primaryAction: 'lock', size: 'small' };
    case 'cover':
      return { bindings: [{ attribute: 'current_position', render: 'slider' }], primaryAction: 'open', size: 'medium' };
    case 'climate':
      return {
        bindings: [
          { attribute: 'current_temperature', render: 'text' },
          { attribute: 'temperature', render: 'slider' },
        ],
        primaryAction: 'none',
        size: 'medium',
      };
    case 'fan':
      return { bindings: [{ attribute: 'percentage', render: 'slider' }], primaryAction: 'toggle', size: 'medium' };
    case 'vacuum':
      return { bindings: [{ attribute: 'battery_level', render: 'badge' }], primaryAction: 'none', size: 'medium' };
    case 'media':
      return {
        bindings: [
          { attribute: 'media_title', render: 'text' },
          { attribute: 'volume_level', render: 'slider' },
        ],
        primaryAction: 'play_pause',
        size: 'large',
      };
    case 'sensor':
      return { bindings: [{ attribute: 'state', render: 'sparkline' }], primaryAction: 'none', size: 'medium' };
    case 'binary_sensor':
      return { bindings: [], primaryAction: 'none', size: 'small' };
  }
}

export function familyLabel(family: DeviceFamily): string {
  switch (family) {
    case 'light': return 'Light';
    case 'switch': return 'Switch';
    case 'lock': return 'Lock';
    case 'cover': return 'Cover';
    case 'climate': return 'Climate';
    case 'fan': return 'Fan';
    case 'vacuum': return 'Vacuum';
    case 'media': return 'Media';
    case 'sensor': return 'Sensor';
    case 'binary_sensor': return 'Binary Sensor';
  }
}

export function familyEmoji(family: DeviceFamily): string {
  switch (family) {
    case 'light': return '💡';
    case 'switch': return '🔌';
    case 'lock': return '🔒';
    case 'cover': return '🚪';
    case 'climate': return '🌡️';
    case 'fan': return '🪭';
    case 'vacuum': return '🤖';
    case 'media': return '📺';
    case 'sensor': return '📊';
    case 'binary_sensor': return '⚡';
  }
}

export function familyMdi(family: DeviceFamily): string {
  switch (family) {
    case 'light': return 'mdi:lightbulb';
    case 'switch': return 'mdi:power-socket';
    case 'lock': return 'mdi:lock';
    case 'cover': return 'mdi:window-shutter';
    case 'climate': return 'mdi:thermostat';
    case 'fan': return 'mdi:fan';
    case 'vacuum': return 'mdi:robot-vacuum';
    case 'media': return 'mdi:television';
    case 'sensor': return 'mdi:gauge';
    case 'binary_sensor': return 'mdi:checkbox-blank-circle-outline';
  }
}

/** Backwards-compat shim for code paths still using familyIcon. */
export function familyIcon(family: DeviceFamily): string { return familyEmoji(family); }

export function isOnState(state: string): boolean {
  return state === 'on' || state === 'open' || state === 'unlocked' || state === 'playing' || state === 'cleaning' || state === 'heat' || state === 'cool' || state === 'auto' || state === 'heat_cool' || state === 'fan_only';
}

/** Suggest a render style for an attribute we don't have a smart default for. */
export function suggestRender(attribute: string, value: unknown): AttributeRender {
  if (typeof value === 'boolean') return 'badge';
  if (typeof value === 'number') {
    if (/battery|signal|rssi/i.test(attribute)) return 'badge';
    if (/percent|brightness|level|position|volume|temperature|humidity/i.test(attribute) && value >= 0 && value <= 100) {
      return 'slider';
    }
    return 'text';
  }
  return 'text';
}

/** Attributes we hide from the wizard - they're noise that doesn't help users. */
export const NOISE_ATTRS = new Set([
  'friendly_name', 'supported_features', 'supported_color_modes', 'icon',
  'restored', 'editable', 'assumed_state', 'attribution', 'unit_of_measurement',
  'state_class', 'last_reset', 'options', 'event_types', 'min_color_temp_kelvin',
  'max_color_temp_kelvin', 'min_mireds', 'max_mireds', 'effect_list', 'min_temp', 'max_temp',
  'target_temp_step', 'fan_modes', 'preset_modes', 'hvac_modes', 'swing_modes',
  'source_list', 'sound_mode_list', 'app_list', 'preset_mode',
]);

