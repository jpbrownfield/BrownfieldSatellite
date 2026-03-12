import React, { useState } from 'react';
import { Check, Globe, Trash2, RefreshCw, Monitor, Shield, ExternalLink } from 'lucide-react';
import { getSettings, saveSettings, AppSettings } from '../utils/settings';
import { clearCache } from '../services/tmdbService';

const REGIONS = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'JP', name: 'Japan' },
];

const SERVICES = [
  { id: 'netflix', name: 'Netflix' },
  { id: 'max', name: 'Max / HBO' },
  { id: 'amazon', name: 'Amazon Prime' },
  { id: 'hulu', name: 'Hulu' },
  { id: 'disney', name: 'Disney+' },
  { id: 'apple', name: 'Apple TV' },
  { id: 'paramount', name: 'Paramount Plus' },
  { id: 'peacock', name: 'Peacock' },
  { id: 'directv', name: 'DirecTV' },
];

interface SettingsScreenProps {
  onSettingsChange: () => void;
}

export default function SettingsScreen({ onSettingsChange }: SettingsScreenProps) {
  const [settings, setSettings] = useState<AppSettings>(getSettings());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const toggleService = (serviceId: string) => {
    const newServices = settings.allowedServices.includes(serviceId)
      ? settings.allowedServices.filter(id => id !== serviceId)
      : [...settings.allowedServices, serviceId];
    
    const newSettings = { ...settings, allowedServices: newServices };
    setSettings(newSettings);
    saveSettings(newSettings);
    onSettingsChange();
  };

  const changeRegion = (regionCode: string) => {
    const newSettings = { ...settings, region: regionCode };
    setSettings(newSettings);
    saveSettings(newSettings);
    onSettingsChange();
  };

  const handleClearCache = () => {
    setIsRefreshing(true);
    clearCache();
    setTimeout(() => {
      setIsRefreshing(false);
      onSettingsChange();
    }, 1000);
  };

  return (
    <div className="p-12 max-w-4xl mx-auto h-full overflow-y-auto pb-32">
      <div className="flex items-center justify-between mb-12">
        <h1 className="text-4xl font-bold">Settings</h1>
      </div>

      {/* Services Section */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <Check className="text-neutral-400" size={24} />
          <h2 className="text-2xl font-semibold">My Subscriptions</h2>
        </div>
        <p className="text-neutral-400 mb-6">Select the services you want to see in your feed. Content from other services will be hidden.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SERVICES.map((service) => (
            <button
              key={service.id}
              onClick={() => toggleService(service.id)}
              className={`flex items-center justify-between px-6 py-4 rounded-xl border transition-all outline-none focus:ring-2 focus:ring-white focus:scale-105 ${
                settings.allowedServices.includes(service.id)
                  ? 'bg-neutral-800 border-neutral-700 text-white'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-500'
              }`}
            >
              <span className="font-semibold text-lg">{service.name}</span>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                settings.allowedServices.includes(service.id)
                  ? 'bg-white border-white'
                  : 'border-neutral-700'
              }`}>
                {settings.allowedServices.includes(service.id) && <Check size={16} className="text-black" />}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Region Section */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <Globe className="text-neutral-400" size={24} />
          <h2 className="text-2xl font-semibold">Streaming Region</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {REGIONS.map((region) => (
            <button
              key={region.code}
              onClick={() => changeRegion(region.code)}
              className={`px-6 py-4 rounded-xl border transition-all text-left outline-none focus:ring-2 focus:ring-white focus:scale-105 ${
                settings.region === region.code
                  ? 'bg-white text-black border-white'
                  : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:border-neutral-600'
              }`}
            >
              <div className="text-xs font-bold uppercase mb-1 opacity-60">{region.code}</div>
              <div className="font-semibold">{region.name}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Desktop Integration Section */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <Monitor className="text-neutral-400" size={24} />
          <h2 className="text-2xl font-semibold">Desktop Integration</h2>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-semibold mb-2">Enable Desktop Mode</h3>
              <p className="text-neutral-400 max-w-lg">Allows launching content in your local browser windows. This requires running the app locally on your machine.</p>
            </div>
            <button 
              onClick={() => {
                const newSettings = { ...settings, enableDesktopMode: !settings.enableDesktopMode };
                setSettings(newSettings);
                saveSettings(newSettings);
                onSettingsChange();
              }}
              className={`w-14 h-8 rounded-full transition-all relative ${settings.enableDesktopMode ? 'bg-green-600' : 'bg-neutral-700'}`}
            >
              <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${settings.enableDesktopMode ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          {settings.enableDesktopMode && (
            <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
              <div>
                <label className="block text-sm font-bold text-neutral-400 uppercase tracking-widest mb-3">Browser Executable Path</label>
                <div className="flex gap-4">
                  <input 
                    type="text"
                    value={settings.browserPath}
                    onChange={(e) => {
                      const newSettings = { ...settings, browserPath: e.target.value };
                      setSettings(newSettings);
                      saveSettings(newSettings);
                    }}
                    placeholder="C:\Program Files\Google\Chrome\Application\chrome.exe"
                    className="flex-1 bg-black border border-neutral-800 rounded-xl px-6 py-4 text-white focus:outline-none focus:border-neutral-600 transition-all font-mono text-sm"
                  />
                </div>
                <p className="mt-3 text-xs text-neutral-500 flex items-center gap-2">
                  <Shield size={12} />
                  Tip: Use the path to Chrome or Edge for the best experience with the --app flag.
                </p>
              </div>

              <div className="p-4 bg-blue-900/20 border border-blue-800/50 rounded-xl">
                <div className="flex items-start gap-3">
                  <ExternalLink className="text-blue-400 shrink-0 mt-1" size={18} />
                  <div>
                    <h4 className="text-blue-400 font-bold text-sm mb-1 uppercase tracking-wider">How to use locally:</h4>
                    <p className="text-blue-200/70 text-sm leading-relaxed">
                      1. Click "Export" in the app settings.<br />
                      2. Unzip and run <code className="bg-blue-900/40 px-1 rounded">npm install</code> then <code className="bg-blue-900/40 px-1 rounded">npm run dev</code>.<br />
                      3. Open <code className="bg-blue-900/40 px-1 rounded">localhost:3000</code> in your browser.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Data Section */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <Trash2 className="text-neutral-400" size={24} />
          <h2 className="text-2xl font-semibold">Data & Cache</h2>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-semibold mb-2">Refresh Trending Data</h3>
            <p className="text-neutral-400">The app caches trending lists for 24 hours to stay fast. Clear it to see the absolute latest updates.</p>
          </div>
          <button
            onClick={handleClearCache}
            disabled={isRefreshing}
            className="flex items-center gap-3 px-8 py-4 bg-white text-black rounded-xl font-bold hover:bg-neutral-200 focus:ring-4 focus:ring-white/50 outline-none transition-all disabled:opacity-50"
          >
            <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
            {isRefreshing ? 'Refreshing...' : 'Clear Cache'}
          </button>
        </div>
      </section>
    </div>
  );
}
