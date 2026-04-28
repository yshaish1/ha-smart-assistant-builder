import type { HassAdapter } from './adapter.js';
import type { DeviceFamily, RealDevice } from '../types.js';

const DOMAIN_TO_FAMILY: Record<string, DeviceFamily> = {
  light: 'light',
  switch: 'switch',
  lock: 'lock',
  cover: 'cover',
  climate: 'climate',
  fan: 'fan',
  vacuum: 'vacuum',
  media_player: 'media',
  humidifier: 'climate',
  water_heater: 'climate',
  sensor: 'sensor',
  binary_sensor: 'binary_sensor',
};

const SENSOR_DOMAINS = new Set(['sensor', 'binary_sensor']);

const NOISY_PLATFORMS = new Set(['template', 'group', 'integration_solver']);

export interface FilterOptions {
  includeUnavailable?: boolean;
  showAll?: boolean;
}

export function listRealDevices(adapter: HassAdapter, options: FilterOptions = {}): RealDevice[] {
  const { includeUnavailable = false, showAll = false } = options;

  const states = adapter.getStates();
  const entities = adapter.getEntityRegistry();
  const devices = adapter.getDeviceRegistry();
  const stateMap = new Map(states.map(s => [s.entity_id, s]));
  const entityMap = new Map(entities.map(e => [e.entity_id, e]));
  const deviceMap = new Map(devices.map(d => [d.id, d]));

  const candidates = showAll ? states : states.filter(s => !skipDomain(s.entity_id));

  const out: RealDevice[] = [];
  for (const state of candidates) {
    const domain = domainOf(state.entity_id);
    const family = DOMAIN_TO_FAMILY[domain];
    if (!family) continue;

    const reg = entityMap.get(state.entity_id);

    if (!showAll) {
      if (reg?.disabled_by) continue;
      if (reg?.hidden_by) continue;
      if (reg?.entity_category === 'diagnostic' || reg?.entity_category === 'config') continue;
      if (!includeUnavailable && (state.state === 'unavailable' || state.state === 'unknown')) continue;

      if (SENSOR_DOMAINS.has(domain)) {
        const deviceId = reg?.device_id ?? null;
        if (!deviceId) continue;
        const device = deviceMap.get(deviceId);
        if (!device || !device.manufacturer) continue;
        if (device.disabled_by) continue;
      }

      if (reg?.platform && NOISY_PLATFORMS.has(reg.platform)) continue;
    }

    out.push({
      entityId: state.entity_id,
      family,
      friendlyName: (state.attributes['friendly_name'] as string | undefined) ?? state.entity_id,
      areaId: reg?.area_id ?? deviceMap.get(reg?.device_id ?? '')?.area_id ?? null,
      deviceId: reg?.device_id ?? null,
      state: state.state,
      attributes: state.attributes,
    });

    void stateMap;
  }

  return out;
}

export function groupByArea(devices: RealDevice[]): Map<string | null, RealDevice[]> {
  const map = new Map<string | null, RealDevice[]>();
  for (const d of devices) {
    const key = d.areaId;
    const list = map.get(key);
    if (list) list.push(d);
    else map.set(key, [d]);
  }
  return map;
}

function domainOf(entityId: string): string {
  const i = entityId.indexOf('.');
  return i < 0 ? '' : entityId.slice(0, i);
}

const SKIP_DOMAINS = new Set([
  'automation', 'script', 'scene', 'group', 'zone', 'person', 'sun', 'weather',
  'input_boolean', 'input_number', 'input_text', 'input_select', 'input_datetime', 'input_button',
  'counter', 'timer', 'schedule',
]);

function skipDomain(entityId: string): boolean {
  return SKIP_DOMAINS.has(domainOf(entityId));
}
