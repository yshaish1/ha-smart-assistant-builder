import type { HassAdapter } from './adapter.js';
import type {
  AreaRegistryEntry,
  DeviceRegistryEntry,
  EntityRegistryEntry,
  HassEntity,
} from '../types.js';

const areas: AreaRegistryEntry[] = [
  { area_id: 'living_room', name: 'Living Room', icon: 'mdi:sofa' },
  { area_id: 'bedroom', name: 'Bedroom', icon: 'mdi:bed' },
  { area_id: 'kitchen', name: 'Kitchen', icon: 'mdi:silverware-fork-knife' },
  { area_id: 'office', name: 'Office', icon: 'mdi:desk' },
  { area_id: 'entry', name: 'Entry', icon: 'mdi:door' },
];

const devices: DeviceRegistryEntry[] = [
  { id: 'd_lr_lamp', area_id: 'living_room', manufacturer: 'Philips', model: 'Hue White & Color', name: 'Living Room Lamp', name_by_user: null, disabled_by: null },
  { id: 'd_lr_tv', area_id: 'living_room', manufacturer: 'LG', model: 'OLED C2', name: 'Living Room TV', name_by_user: null, disabled_by: null },
  { id: 'd_lr_thermo', area_id: 'living_room', manufacturer: 'Ecobee', model: 'SmartThermostat', name: 'Main Thermostat', name_by_user: null, disabled_by: null },
  { id: 'd_lr_motion', area_id: 'living_room', manufacturer: 'Aqara', model: 'Motion Sensor P1', name: 'Living Room Motion', name_by_user: null, disabled_by: null },
  { id: 'd_lr_temp', area_id: 'living_room', manufacturer: 'Aqara', model: 'TH Sensor', name: 'Living Room Temp', name_by_user: null, disabled_by: null },

  { id: 'd_bd_lamp', area_id: 'bedroom', manufacturer: 'IKEA', model: 'Tradfri', name: 'Bedside Lamp', name_by_user: null, disabled_by: null },
  { id: 'd_bd_fan', area_id: 'bedroom', manufacturer: 'Hampton Bay', model: 'Smart Fan', name: 'Ceiling Fan', name_by_user: null, disabled_by: null },
  { id: 'd_bd_contact', area_id: 'bedroom', manufacturer: 'Aqara', model: 'Contact Sensor', name: 'Window Contact', name_by_user: null, disabled_by: null },

  { id: 'd_kt_plug', area_id: 'kitchen', manufacturer: 'TP-Link', model: 'Kasa HS100', name: 'Coffee Maker Plug', name_by_user: null, disabled_by: null },
  { id: 'd_kt_leak', area_id: 'kitchen', manufacturer: 'Aqara', model: 'Leak Sensor', name: 'Sink Leak', name_by_user: null, disabled_by: null },

  { id: 'd_of_lamp', area_id: 'office', manufacturer: 'Philips', model: 'Hue White', name: 'Desk Lamp', name_by_user: null, disabled_by: null },
  { id: 'd_of_vacuum', area_id: 'office', manufacturer: 'Roborock', model: 'S7', name: 'Roborock', name_by_user: null, disabled_by: null },

  { id: 'd_en_lock', area_id: 'entry', manufacturer: 'August', model: 'Wi-Fi Smart Lock', name: 'Front Door Lock', name_by_user: null, disabled_by: null },
  { id: 'd_en_garage', area_id: 'entry', manufacturer: 'MyQ', model: 'Garage Hub', name: 'Garage Door', name_by_user: null, disabled_by: null },
];

const entityRegistry: EntityRegistryEntry[] = [
  { entity_id: 'light.living_room_lamp', device_id: 'd_lr_lamp', area_id: 'living_room', disabled_by: null, hidden_by: null, entity_category: null, platform: 'hue' },
  { entity_id: 'sensor.living_room_lamp_signal', device_id: 'd_lr_lamp', area_id: 'living_room', disabled_by: null, hidden_by: null, entity_category: 'diagnostic', platform: 'hue' },

  { entity_id: 'media_player.living_room_tv', device_id: 'd_lr_tv', area_id: 'living_room', disabled_by: null, hidden_by: null, entity_category: null, platform: 'webostv' },
  { entity_id: 'sensor.living_room_tv_uptime', device_id: 'd_lr_tv', area_id: 'living_room', disabled_by: null, hidden_by: null, entity_category: 'diagnostic', platform: 'webostv' },

  { entity_id: 'climate.main_thermostat', device_id: 'd_lr_thermo', area_id: 'living_room', disabled_by: null, hidden_by: null, entity_category: null, platform: 'ecobee' },

  { entity_id: 'binary_sensor.living_room_motion', device_id: 'd_lr_motion', area_id: 'living_room', disabled_by: null, hidden_by: null, entity_category: null, platform: 'aqara' },
  { entity_id: 'sensor.living_room_motion_battery', device_id: 'd_lr_motion', area_id: 'living_room', disabled_by: null, hidden_by: null, entity_category: 'diagnostic', platform: 'aqara' },

  { entity_id: 'sensor.living_room_temperature', device_id: 'd_lr_temp', area_id: 'living_room', disabled_by: null, hidden_by: null, entity_category: null, platform: 'aqara' },
  { entity_id: 'sensor.living_room_humidity', device_id: 'd_lr_temp', area_id: 'living_room', disabled_by: null, hidden_by: null, entity_category: null, platform: 'aqara' },

  { entity_id: 'light.bedside_lamp', device_id: 'd_bd_lamp', area_id: 'bedroom', disabled_by: null, hidden_by: null, entity_category: null, platform: 'tradfri' },
  { entity_id: 'fan.ceiling_fan', device_id: 'd_bd_fan', area_id: 'bedroom', disabled_by: null, hidden_by: null, entity_category: null, platform: 'hampton' },
  { entity_id: 'binary_sensor.window_contact', device_id: 'd_bd_contact', area_id: 'bedroom', disabled_by: null, hidden_by: null, entity_category: null, platform: 'aqara' },

  { entity_id: 'switch.coffee_maker', device_id: 'd_kt_plug', area_id: 'kitchen', disabled_by: null, hidden_by: null, entity_category: null, platform: 'tplink' },
  { entity_id: 'binary_sensor.sink_leak', device_id: 'd_kt_leak', area_id: 'kitchen', disabled_by: null, hidden_by: null, entity_category: null, platform: 'aqara' },

  { entity_id: 'light.desk_lamp', device_id: 'd_of_lamp', area_id: 'office', disabled_by: null, hidden_by: null, entity_category: null, platform: 'hue' },
  { entity_id: 'vacuum.roborock', device_id: 'd_of_vacuum', area_id: 'office', disabled_by: null, hidden_by: null, entity_category: null, platform: 'roborock' },

  { entity_id: 'lock.front_door', device_id: 'd_en_lock', area_id: 'entry', disabled_by: null, hidden_by: null, entity_category: null, platform: 'august' },
  { entity_id: 'cover.garage_door', device_id: 'd_en_garage', area_id: 'entry', disabled_by: null, hidden_by: null, entity_category: null, platform: 'myq' },

  // noise that should be filtered out
  { entity_id: 'automation.morning_routine', device_id: null, area_id: null, disabled_by: null, hidden_by: null, entity_category: null, platform: 'automation' },
  { entity_id: 'script.bedtime', device_id: null, area_id: null, disabled_by: null, hidden_by: null, entity_category: null, platform: 'script' },
  { entity_id: 'scene.movie_night', device_id: null, area_id: null, disabled_by: null, hidden_by: null, entity_category: null, platform: 'scene' },
  { entity_id: 'input_boolean.guest_mode', device_id: null, area_id: null, disabled_by: null, hidden_by: null, entity_category: null, platform: 'input_boolean' },
  { entity_id: 'sensor.template_average_temp', device_id: null, area_id: null, disabled_by: null, hidden_by: null, entity_category: null, platform: 'template' },
  { entity_id: 'light.broken_bulb', device_id: 'd_bd_lamp', area_id: 'bedroom', disabled_by: 'user', hidden_by: null, entity_category: null, platform: 'tradfri' },
];

const states: HassEntity[] = [
  { entity_id: 'light.living_room_lamp', state: 'on', attributes: { friendly_name: 'Living Room Lamp', brightness: 180, color_mode: 'hs', hs_color: [42, 80], supported_color_modes: ['hs', 'color_temp'] } },
  { entity_id: 'sensor.living_room_lamp_signal', state: '-52', attributes: { friendly_name: 'Lamp Signal', unit_of_measurement: 'dBm' } },

  { entity_id: 'media_player.living_room_tv', state: 'playing', attributes: { friendly_name: 'Living Room TV', volume_level: 0.4, media_title: 'Severance' } },
  { entity_id: 'sensor.living_room_tv_uptime', state: '143', attributes: { friendly_name: 'TV Uptime', unit_of_measurement: 'min' } },

  { entity_id: 'climate.main_thermostat', state: 'heat', attributes: { friendly_name: 'Main Thermostat', current_temperature: 21.5, temperature: 22, hvac_modes: ['heat', 'cool', 'off'] } },

  { entity_id: 'binary_sensor.living_room_motion', state: 'off', attributes: { friendly_name: 'Living Room Motion', device_class: 'motion' } },
  { entity_id: 'sensor.living_room_motion_battery', state: '87', attributes: { friendly_name: 'Motion Battery', unit_of_measurement: '%', device_class: 'battery' } },

  { entity_id: 'sensor.living_room_temperature', state: '21.4', attributes: { friendly_name: 'Living Room Temp', unit_of_measurement: '°C', device_class: 'temperature' } },
  { entity_id: 'sensor.living_room_humidity', state: '46', attributes: { friendly_name: 'Living Room Humidity', unit_of_measurement: '%', device_class: 'humidity' } },

  { entity_id: 'light.bedside_lamp', state: 'off', attributes: { friendly_name: 'Bedside Lamp', brightness: 0, supported_color_modes: ['brightness'] } },
  { entity_id: 'fan.ceiling_fan', state: 'on', attributes: { friendly_name: 'Ceiling Fan', percentage: 33 } },
  { entity_id: 'binary_sensor.window_contact', state: 'off', attributes: { friendly_name: 'Window Contact', device_class: 'window' } },

  { entity_id: 'switch.coffee_maker', state: 'off', attributes: { friendly_name: 'Coffee Maker' } },
  { entity_id: 'binary_sensor.sink_leak', state: 'off', attributes: { friendly_name: 'Sink Leak', device_class: 'moisture' } },

  { entity_id: 'light.desk_lamp', state: 'on', attributes: { friendly_name: 'Desk Lamp', brightness: 220, supported_color_modes: ['brightness'] } },
  { entity_id: 'vacuum.roborock', state: 'docked', attributes: { friendly_name: 'Roborock', battery_level: 96 } },

  { entity_id: 'lock.front_door', state: 'locked', attributes: { friendly_name: 'Front Door' } },
  { entity_id: 'cover.garage_door', state: 'closed', attributes: { friendly_name: 'Garage Door', current_position: 0 } },

  { entity_id: 'automation.morning_routine', state: 'on', attributes: { friendly_name: 'Morning Routine' } },
  { entity_id: 'script.bedtime', state: 'off', attributes: { friendly_name: 'Bedtime' } },
  { entity_id: 'scene.movie_night', state: 'unknown', attributes: { friendly_name: 'Movie Night' } },
  { entity_id: 'input_boolean.guest_mode', state: 'off', attributes: { friendly_name: 'Guest Mode' } },
  { entity_id: 'sensor.template_average_temp', state: '21.0', attributes: { friendly_name: 'Average Temp', unit_of_measurement: '°C' } },
  { entity_id: 'light.broken_bulb', state: 'unavailable', attributes: { friendly_name: 'Broken Bulb' } },
];

export class MockHassAdapter implements HassAdapter {
  private listeners = new Set<() => void>();
  private state = states.map(s => ({ ...s, attributes: { ...s.attributes } }));

  getStates(): HassEntity[] { return this.state; }
  getEntityRegistry(): EntityRegistryEntry[] { return entityRegistry; }
  getDeviceRegistry(): DeviceRegistryEntry[] { return devices; }
  getAreaRegistry(): AreaRegistryEntry[] { return areas; }

  async callService(domain: string, service: string, data: Record<string, unknown> = {}): Promise<void> {
    const entityId = data['entity_id'] as string | undefined;
    if (!entityId) return;
    const e = this.state.find(s => s.entity_id === entityId);
    if (!e) return;
    if (service === 'toggle') {
      e.state = e.state === 'on' ? 'off' : 'on';
    } else if (service === 'turn_on') {
      e.state = 'on';
    } else if (service === 'turn_off') {
      e.state = 'off';
    } else if (domain === 'lock' && service === 'lock') {
      e.state = 'locked';
    } else if (domain === 'lock' && service === 'unlock') {
      e.state = 'unlocked';
    } else if (domain === 'cover' && service === 'open_cover') {
      e.state = 'open';
    } else if (domain === 'cover' && service === 'close_cover') {
      e.state = 'closed';
    }
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach(l => l());
  }
}
