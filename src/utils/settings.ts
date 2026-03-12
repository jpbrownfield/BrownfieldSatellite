import { setMyStuffCookie, getMyStuffCookie } from './cookies';

export interface AppSettings {
  allowedServices: string[];
  region: string;
  browserPath: string;
  enableDesktopMode: boolean;
}

const SETTINGS_COOKIE = 'app_settings';

const DEFAULT_SERVICES = ['netflix', 'max', 'amazon', 'hulu', 'disney', 'apple', 'paramount', 'peacock', 'directv'];
const DEFAULT_BROWSER_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export function getSettings(): AppSettings {
  try {
    const cookie = document.cookie.split('; ').find(row => row.startsWith(`${SETTINGS_COOKIE}=`));
    if (cookie) {
      const settings = JSON.parse(decodeURIComponent(cookie.split('=')[1]));
      // Migration: Ensure new fields are added if they were missing
      let updated = false;
      if (settings.browserPath === undefined) {
        settings.browserPath = DEFAULT_BROWSER_PATH;
        updated = true;
      }
      if (settings.enableDesktopMode === undefined) {
        settings.enableDesktopMode = false;
        updated = true;
      }
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
    region: 'US',
    browserPath: DEFAULT_BROWSER_PATH,
    enableDesktopMode: false
  };
}

export function saveSettings(settings: AppSettings) {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `${SETTINGS_COOKIE}=${encodeURIComponent(JSON.stringify(settings))}; expires=${expires.toUTCString()}; path=/; SameSite=None; Secure`;
}
