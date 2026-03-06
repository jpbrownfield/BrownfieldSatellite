import { setMyStuffCookie, getMyStuffCookie } from './cookies';

export interface AppSettings {
  allowedServices: string[];
  region: string;
}

const SETTINGS_COOKIE = 'app_settings';

const DEFAULT_SERVICES = ['netflix', 'max', 'amazon', 'hulu', 'disney', 'apple', 'paramount', 'peacock', 'directv'];

export function getSettings(): AppSettings {
  try {
    const cookie = document.cookie.split('; ').find(row => row.startsWith(`${SETTINGS_COOKIE}=`));
    if (cookie) {
      const settings = JSON.parse(decodeURIComponent(cookie.split('=')[1]));
      // Migration: Ensure new services are added if they were missing
      let updated = false;
      ['apple', 'directv'].forEach(service => {
        if (!settings.allowedServices.includes(service)) {
          settings.allowedServices.push(service);
          updated = true;
        }
      });
      if (updated) saveSettings(settings);
      return settings;
    }
  } catch (e) {
    console.error('Failed to parse settings cookie', e);
  }
  
  return {
    allowedServices: DEFAULT_SERVICES,
    region: 'US'
  };
}

export function saveSettings(settings: AppSettings) {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `${SETTINGS_COOKIE}=${encodeURIComponent(JSON.stringify(settings))}; expires=${expires.toUTCString()}; path=/; SameSite=None; Secure`;
}
