import type { DeviceFamily, PrimaryAction } from '../types.js';

export interface SmartDefault {
  attributes: string[];
  primaryAction: PrimaryAction;
  hasSlider: boolean;
}

export function smartDefaultsFor(family: DeviceFamily): SmartDefault {
  switch (family) {
    case 'light':
      return { attributes: ['brightness', 'color_mode'], primaryAction: 'toggle', hasSlider: true };
    case 'switch':
      return { attributes: [], primaryAction: 'toggle', hasSlider: false };
    case 'lock':
      return { attributes: [], primaryAction: 'lock', hasSlider: false };
    case 'cover':
      return { attributes: ['current_position'], primaryAction: 'open', hasSlider: true };
    case 'climate':
      return { attributes: ['current_temperature', 'temperature', 'hvac_mode'], primaryAction: 'none', hasSlider: true };
    case 'fan':
      return { attributes: ['percentage'], primaryAction: 'toggle', hasSlider: true };
    case 'vacuum':
      return { attributes: ['battery_level'], primaryAction: 'none', hasSlider: false };
    case 'media':
      return { attributes: ['media_title', 'volume_level'], primaryAction: 'play_pause', hasSlider: false };
    case 'sensor':
      return { attributes: ['unit_of_measurement', 'device_class'], primaryAction: 'none', hasSlider: false };
    case 'binary_sensor':
      return { attributes: ['device_class'], primaryAction: 'none', hasSlider: false };
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

export function familyIcon(family: DeviceFamily): string {
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

export function isOnState(state: string): boolean {
  return state === 'on' || state === 'open' || state === 'unlocked' || state === 'playing' || state === 'cleaning' || state === 'heat' || state === 'cool' || state === 'auto';
}
