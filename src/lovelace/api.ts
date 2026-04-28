import type { HassLike } from '../ha/adapter.real.js';

export interface LovelaceDashboardEntry {
  id: string;
  url_path: string;
  title: string;
  icon?: string;
  show_in_sidebar: boolean;
  require_admin: boolean;
  mode: 'storage' | 'yaml';
}

export interface LovelaceConfig {
  title?: string;
  views: unknown[];
  [k: string]: unknown;
}

export async function listDashboards(hass: HassLike): Promise<LovelaceDashboardEntry[]> {
  return hass.connection.sendMessagePromise({ type: 'lovelace/dashboards/list' });
}

export async function createDashboard(
  hass: HassLike,
  params: { url_path: string; title: string; icon?: string; show_in_sidebar?: boolean; require_admin?: boolean }
): Promise<LovelaceDashboardEntry> {
  return hass.connection.sendMessagePromise({
    type: 'lovelace/dashboards/create',
    url_path: params.url_path,
    title: params.title,
    icon: params.icon ?? 'mdi:home-heart',
    show_in_sidebar: params.show_in_sidebar ?? true,
    require_admin: params.require_admin ?? false,
    mode: 'storage',
  });
}

export async function updateDashboard(
  hass: HassLike,
  dashboardId: string,
  params: { title?: string; icon?: string; show_in_sidebar?: boolean; require_admin?: boolean }
): Promise<LovelaceDashboardEntry> {
  return hass.connection.sendMessagePromise({
    type: 'lovelace/dashboards/update',
    dashboard_id: dashboardId,
    ...params,
  });
}

export async function deleteDashboard(hass: HassLike, dashboardId: string): Promise<void> {
  await hass.connection.sendMessagePromise({
    type: 'lovelace/dashboards/delete',
    dashboard_id: dashboardId,
  });
}

export async function getConfig(hass: HassLike, urlPath: string): Promise<LovelaceConfig | null> {
  try {
    return await hass.connection.sendMessagePromise<LovelaceConfig>({
      type: 'lovelace/config',
      url_path: urlPath,
    });
  } catch {
    return null;
  }
}

export async function saveConfig(hass: HassLike, urlPath: string, config: LovelaceConfig): Promise<void> {
  await hass.connection.sendMessagePromise({
    type: 'lovelace/config/save',
    url_path: urlPath,
    config,
  });
}

export interface LovelaceResource {
  id: string;
  type: string;
  url: string;
}

export async function listResources(hass: HassLike): Promise<LovelaceResource[]> {
  return hass.connection.sendMessagePromise({ type: 'lovelace/resources' });
}

export async function createResource(
  hass: HassLike,
  params: { res_type: 'module' | 'css' | 'js'; url: string }
): Promise<LovelaceResource> {
  return hass.connection.sendMessagePromise({
    type: 'lovelace/resources/create',
    res_type: params.res_type,
    url: params.url,
  });
}

export async function updateResource(
  hass: HassLike,
  resourceId: string,
  params: { res_type?: 'module' | 'css' | 'js'; url?: string }
): Promise<LovelaceResource> {
  return hass.connection.sendMessagePromise({
    type: 'lovelace/resources/update',
    resource_id: resourceId,
    ...params,
  });
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'dashboard';
}
