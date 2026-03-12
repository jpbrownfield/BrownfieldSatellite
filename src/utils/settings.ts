import { setMyStuffCookie, getMyStuffCookie } from './cookies';

export interface AppSettings {
  allowedServices: string[];
  region: string;
  browserPath: string;
  tmdbApiKey: string;
  geminiApiKey: string;
}

const DEFAULT_SERVICES = ['netflix', 'max', 'amazon', 'hulu', 'disney', 'apple', 'paramount', 'peacock', 'directv'];
const DEFAULT_BROWSER_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEFAULT_TMDB_KEY = '94e10934d3c360799a710618b1e5406f';

let cachedSettings: AppSettings | null = null;

export async function getSettings(): Promise<AppSettings> {
  if (cachedSettings) return cachedSettings;

  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const settings = await res.json();
      
      // Merge with defaults
      const merged: AppSettings = {
        allowedServices: settings.allowedServices || DEFAULT_SERVICES,
        region: settings.region || 'US',
        browserPath: settings.browserPath || DEFAULT_BROWSER_PATH,
        tmdbApiKey: settings.tmdbApiKey || DEFAULT_TMDB_KEY,
        geminiApiKey: settings.geminiApiKey || '',
      };
      
      cachedSettings = merged;
      return merged;
    }
  } catch (e) {
    console.error('Failed to fetch settings from backend', e);
  }
  
  const defaults: AppSettings = {
    allowedServices: DEFAULT_SERVICES,
    region: 'US',
    browserPath: DEFAULT_BROWSER_PATH,
    tmdbApiKey: DEFAULT_TMDB_KEY,
    geminiApiKey: '',
  };
  cachedSettings = defaults;
  return defaults;
}

export async function saveSettings(settings: AppSettings) {
  cachedSettings = settings;
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
  } catch (e) {
    console.error('Failed to save settings to backend', e);
  }
}
