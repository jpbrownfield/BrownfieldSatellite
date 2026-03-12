import React, { useState, useEffect } from 'react';
import { Check, Globe, Trash2, RefreshCw, Monitor, Shield, ExternalLink, Key } from 'lucide-react';
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
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const handleSave = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    setSaveStatus('saving');
    await saveSettings(newSettings);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const toggleService = (serviceId: string) => {
    if (!settings) return;
    const newServices = settings.allowedServices.includes(serviceId)
      ? settings.allowedServices.filter(id => id !== serviceId)
      : [...settings.allowedServices, serviceId];
    
    const newSettings = { ...settings, allowedServices: newServices };
    handleSave(newSettings);
    onSettingsChange();
  };

  const changeRegion = (regionCode: string) => {
    if (!settings) return;
    const newSettings = { ...settings, region: regionCode };
    handleSave(newSettings);
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

  if (!settings) return null;

  return (
    <div className="p-12 max-w-4xl mx-auto h-full overflow-y-auto pb-32">
      <div className="flex items-center justify-between mb-12">
        <h1 className="text-4xl font-bold">Settings</h1>
        <div className="flex items-center gap-2 text-sm">
          {saveStatus === 'saving' && <span className="text-blue-400 animate-pulse">Saving...</span>}
          {saveStatus === 'saved' && <span className="text-green-500 flex items-center gap-1"><Check size={14} /> Saved</span>}
        </div>
      </div>

      {/* App Configuration Section */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <Key className="text-neutral-400" size={24} />
          <h2 className="text-2xl font-semibold">App Configuration</h2>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 space-y-8">
          <div>
            <label className="block text-sm font-bold text-neutral-400 uppercase tracking-widest mb-3">TMDB API Key</label>
            <input 
              type="password"
              value={settings.tmdbApiKey}
              onChange={(e) => handleSave({ ...settings, tmdbApiKey: e.target.value })}
              className="w-full bg-black border border-neutral-800 rounded-xl px-6 py-4 text-white focus:outline-none focus:border-neutral-600 transition-all font-mono text-sm"
            />
            <p className="mt-2 text-xs text-neutral-500">Get your key from themoviedb.org settings.</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-neutral-400 uppercase tracking-widest mb-3">Gemini API Key</label>
            <input 
              type="password"
              value={settings.geminiApiKey}
              onChange={(e) => handleSave({ ...settings, geminiApiKey: e.target.value })}
              className="w-full bg-black border border-neutral-800 rounded-xl px-6 py-4 text-white focus:outline-none focus:border-neutral-600 transition-all font-mono text-sm"
            />
            <p className="mt-2 text-xs text-neutral-500">Used for deep link discovery and smart search.</p>
          </div>

          <div className="pt-6 border-t border-neutral-800">
            <label className="block text-sm font-bold text-neutral-400 uppercase tracking-widest mb-3">Browser Executable Path</label>
            <input 
              type="text"
              value={settings.browserPath}
              onChange={(e) => handleSave({ ...settings, browserPath: e.target.value })}
              placeholder="C:\Program Files\Google\Chrome\Application\chrome.exe"
              className="w-full bg-black border border-neutral-800 rounded-xl px-6 py-4 text-white focus:outline-none focus:border-neutral-600 transition-all font-mono text-sm"
            />
            <p className="mt-3 text-xs text-neutral-500 flex items-center gap-2">
              <Shield size={12} />
              Desktop Mode is active. Set the path to your local Chrome or Edge executable.
            </p>
          </div>
        </div>
      </section>

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
