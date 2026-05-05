import { bridge } from './bridge';

export interface AppSettings {
  allowedServices: string[];
  region: string;
  browserPath: string;
  userAgent: string;
  tmdbApiKey: string;
  geminiApiKey: string;
  enableDomSearch: boolean;
  enableGeminiSearch: boolean;
  enableOpenCvSearch: boolean;
}

const DEFAULT_SERVICES = ['netflix', 'max', 'amazon', 'hulu', 'disney', 'apple', 'paramount', 'peacock', 'directv'];
const DEFAULT_BROWSER_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEFAULT_TMDB_KEY = '94e10934d3c360799a710618b1e5406f';

let cachedSettings: AppSettings | null = null;

export async function getSettings(): Promise<AppSettings> {
  if (cachedSettings) return cachedSettings;

  try {
    const settings = await bridge.invoke('settings:get');
    
    // Merge with defaults
    const merged: AppSettings = {
      allowedServices: settings.allowedServices || DEFAULT_SERVICES,
      region: settings.region || 'US',
      browserPath: settings.browserPath || DEFAULT_BROWSER_PATH,
      userAgent: settings.userAgent || DEFAULT_USER_AGENT,
      tmdbApiKey: settings.tmdbApiKey || DEFAULT_TMDB_KEY,
      geminiApiKey: settings.geminiApiKey || process.env.GEMINI_API_KEY || '',
      enableDomSearch: settings.enableDomSearch ?? true,
      enableGeminiSearch: settings.enableGeminiSearch ?? true,
      enableOpenCvSearch: settings.enableOpenCvSearch ?? true,
    };
    
    cachedSettings = merged;
    return merged;
  } catch (e) {
    console.error('Failed to fetch settings', e);
  }
  
  const defaults: AppSettings = {
    allowedServices: DEFAULT_SERVICES,
    region: 'US',
    browserPath: DEFAULT_BROWSER_PATH,
    userAgent: DEFAULT_USER_AGENT,
    tmdbApiKey: DEFAULT_TMDB_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY || '',
  };
  cachedSettings = defaults;
  return defaults;
}

export async function saveSettings(settings: AppSettings) {
  cachedSettings = settings;
  try {
    await bridge.invoke('settings:save', settings);
  } catch (e) {
    console.error('Failed to save settings', e);
  }
}
