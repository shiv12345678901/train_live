import type { AppSettings } from '@/types';
import { requestJson } from './client';

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  return requestJson<AppSettings>('/settings-update', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
}

