import React, { useState, useEffect } from 'react';
import { Check, Globe, Trash2, RefreshCw, Monitor, Shield, ExternalLink, Key, FileText, Terminal, Puzzle, ShoppingBag, MonitorPlay } from 'lucide-react';
import { bridge } from '../utils/bridge';
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
  const [logs, setLogs] = useState<string>('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings);
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const text = await bridge.invoke('debug:get-logs');
      setLogs(text);
    } catch (e) {
      console.error('Failed to fetch logs', e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const [isTestingPath, setIsTestingPath] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean, message: string} | null>(null);

  const testBrowserPath = async () => {
    if (!settings) return;
    setIsTestingPath(true);
    setTestResult(null);
    try {
      const data = await bridge.invoke('desktop:validate-path', settings.browserPath);
      setTestResult({ success: data.exists, message: data.message });
    } catch (e) {
      setTestResult({ success: false, message: "Failed to connect for validation." });
    } finally {
      setIsTestingPath(false);
    }
  };

  const [isTestingGemini, setIsTestingGemini] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<{success: boolean, message: string} | null>(null);
  
  const [isTestingTmdb, setIsTestingTmdb] = useState(false);
  const [tmdbTestResult, setTmdbTestResult] = useState<{success: boolean, message: string} | null>(null);

  const testTmdb = async () => {
    if (!settings) return;
    setIsTestingTmdb(true);
    setTmdbTestResult(null);
    try {
      const res = await fetch(`https://api.themoviedb.org/3/authentication?api_key=${settings.tmdbApiKey}`);
      const data = await res.json();
      if (data.success) {
        setTmdbTestResult({ success: true, message: "Valid API Key!" });
      } else {
        setTmdbTestResult({ success: false, message: data.status_message || "Invalid API Key" });
      }
    } catch (e: any) {
      console.error('TMDB Test Failed:', e);
      setTmdbTestResult({ success: false, message: e.message || "Network error occurred." });
    } finally {
      setIsTestingTmdb(false);
    }
  };

  const testGemini = async () => {
    if (!settings) return;
    setIsTestingGemini(true);
    setGeminiTestResult(null);
    try {
      const data = await bridge.invoke('gemini:call', { 
        prompt: "Hello, this is a test message. Please respond with 'Gemini is working!'.", 
        apiKey: settings.geminiApiKey 
      });
      setGeminiTestResult({ success: true, message: data.text });
    } catch (e: any) {
      console.error('Gemini Test Failed:', e);
      setGeminiTestResult({ success: false, message: e.message || "Unknown error occurred." });
    } finally {
      setIsTestingGemini(false);
    }
  };

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

  const handleLaunchExtensionManager = async (url: string) => {
    if (!settings) return;
    try {
      await bridge.invoke('desktop:launch', {
        browserPath: settings.browserPath,
        url: url
      });
    } catch (e) {
      console.error('Failed to launch extension manager', e);
    }
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
            <div className="mt-4 flex items-center gap-4">
              <button 
                onClick={testTmdb}
                disabled={isTestingTmdb}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm font-bold transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isTestingTmdb ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Test TMDB
              </button>
              {tmdbTestResult && (
                <span className={`text-sm font-medium ${tmdbTestResult.success ? 'text-green-500' : 'text-red-500'}`}>
                  {tmdbTestResult.success ? 'Success!' : tmdbTestResult.message}
                </span>
              )}
            </div>
            {tmdbTestResult?.success && (
              <div className="mt-2 p-3 bg-neutral-800/50 rounded-lg text-xs text-neutral-300 font-mono">
                {tmdbTestResult.message}
              </div>
            )}
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
            <div className="mt-4 flex items-center gap-4">
              <button 
                onClick={testGemini}
                disabled={isTestingGemini}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm font-bold transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isTestingGemini ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Test Gemini
              </button>
              {geminiTestResult && (
                <span className={`text-sm font-medium ${geminiTestResult.success ? 'text-green-500' : 'text-red-500'}`}>
                  {geminiTestResult.success ? 'Success!' : geminiTestResult.message}
                </span>
              )}
            </div>
            {geminiTestResult?.success && (
              <div className="mt-2 p-3 bg-neutral-800/50 rounded-lg text-xs text-neutral-300 font-mono">
                {geminiTestResult.message}
              </div>
            )}
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
            <div className="mt-4 flex items-center gap-4">
              <button 
                onClick={testBrowserPath}
                disabled={isTestingPath}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm font-bold transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isTestingPath ? <RefreshCw size={14} className="animate-spin" /> : <Monitor size={14} />}
                Test Path
              </button>
              {testResult && (
                <span className={`text-sm font-medium ${testResult.success ? 'text-green-500' : 'text-red-500'}`}>
                  {testResult.message}
                </span>
              )}
            </div>
            <p className="mt-3 text-xs text-neutral-500 flex items-center gap-2">
              <Shield size={12} />
              Desktop Mode is active. Set the path to your local Chrome or Edge executable.
            </p>
          </div>

          <div className="pt-6 border-t border-neutral-800">
            <label className="block text-sm font-bold text-neutral-400 uppercase tracking-widest mb-3">Browser User Agent</label>
            <input 
              type="text"
              value={settings.userAgent}
              onChange={(e) => handleSave({ ...settings, userAgent: e.target.value })}
              className="w-full bg-black border border-neutral-800 rounded-xl px-6 py-4 text-white focus:outline-none focus:border-neutral-600 transition-all font-mono text-sm"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { name: 'Default Desktop', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
                { name: 'Smart TV (WebOS)', ua: 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.199 Safari/537.36 SmartTV/8.3.0 (V8.3.0-22)' },
                { name: 'Apple TV', ua: 'Mozilla/5.0 (Apple TV; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
              ].map((preset, i) => (
                <button 
                  key={i}
                  onClick={() => handleSave({ ...settings, userAgent: preset.ua })}
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-md text-[10px] font-bold transition-all"
                >
                  {preset.name}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              Spoofing a Smart TV user agent can sometimes trigger remote-friendly UIs, but may also break some sites.
            </p>
          </div>
        </div>
      </section>

      {/* Automation Overrides Section */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <MonitorPlay className="text-neutral-400" size={24} />
          <h2 className="text-2xl font-semibold">AI & Automation Engine</h2>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Standard DOM Automation</h3>
              <p className="text-neutral-400 text-sm max-w-lg">Continuously searches the invisible webpage code for exact button matches while watching. Extremely fast, but breaks if sites disguise their text.</p>
            </div>
            <button
              onClick={() => handleSave({ ...settings, enableDomSearch: !settings.enableDomSearch })}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none ${settings.enableDomSearch ? 'bg-green-500' : 'bg-neutral-700'}`}
            >
              <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${settings.enableDomSearch ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="h-px bg-neutral-800" />

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">OpenCV Local Feature Matching</h3>
              <p className="text-neutral-400 text-sm max-w-lg">Uses local computer vision to scan screenshots for the movie poster/cover art. Instant and offline, but won't work for word buttons like "Play".</p>
            </div>
            <button
              onClick={() => handleSave({ ...settings, enableOpenCvSearch: !settings.enableOpenCvSearch })}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none ${settings.enableOpenCvSearch ? 'bg-purple-500' : 'bg-neutral-700'}`}
            >
              <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${settings.enableOpenCvSearch ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="h-px bg-neutral-800" />

          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Gemini Vision AI Automation</h3>
              <p className="text-neutral-400 text-sm max-w-lg">Takes screenshots of the stream window and uses AI to physically click the right buttons on the screen. Required for tricky sites, but slower.</p>
            </div>
            <button
              onClick={() => handleSave({ ...settings, enableGeminiSearch: !settings.enableGeminiSearch })}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none ${settings.enableGeminiSearch ? 'bg-blue-600' : 'bg-neutral-700'}`}
            >
              <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${settings.enableGeminiSearch ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
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

      {/* Extensions Section */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <Puzzle className="text-neutral-400" size={24} />
          <h2 className="text-2xl font-semibold">Browser Extensions</h2>
        </div>
        <p className="text-neutral-400 mb-6">
          Since the app uses your local browser, you can install extensions to block ads, skip intros, or improve video quality. 
          Install them in the standalone window and they will work automatically.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
            <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
              <ShoppingBag size={18} className="text-blue-400" />
              Chrome Web Store
            </h3>
            <p className="text-sm text-neutral-500 mb-4">Browse and install new extensions for your streaming browser.</p>
            <button 
              onClick={() => handleLaunchExtensionManager('https://chrome.google.com/webstore')}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
            >
              <ExternalLink size={16} />
              Open Web Store
            </button>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
            <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
              <Monitor size={18} className="text-green-400" />
              Manage Extensions
            </h3>
            <p className="text-sm text-neutral-500 mb-4">View, enable, or configure extensions you've already installed.</p>
            <button 
              onClick={() => handleLaunchExtensionManager('chrome://extensions')}
              className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
            >
              <ExternalLink size={16} />
              Manage Installed
            </button>
          </div>
        </div>

        <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6">
          <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-4">Extensions Backup & Import</h3>
          <p className="text-sm text-neutral-400 mb-4">Export unpacked extensions to a portable folder, or import a previously bundled folder.</p>
          <div className="flex flex-col md:flex-row gap-4">
            <button 
              onClick={async () => {
                try {
                  await bridge.invoke('extensions:backup');
                  alert('Extensions backed up to [App Path]/exported-extensions! You can bundle this folder.');
                } catch (e) {
                  alert('Backup failed. Check logs.');
                }
              }}
              className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
            >
              <Puzzle size={16} />
              Export Extensions
            </button>
            <button 
               onClick={async () => {
                try {
                  await bridge.invoke('extensions:import');
                  alert('Extensions imported successfully onto your active browser profile!');
                } catch (e) {
                  alert('Import failed. Make sure exported-extensions folder exists next to the exe.');
                }
              }}
              className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
            >
              <Puzzle size={16} />
              Import Bundled Extensions
            </button>
          </div>
        </div>
      </section>

      {/* Data Section */}
      <section className="mb-12">
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

      {/* Server Logs Section */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Terminal className="text-neutral-400" size={24} />
            <h2 className="text-2xl font-semibold">Debug Logs</h2>
          </div>
          <button 
            onClick={fetchLogs}
            disabled={isLoadingLogs}
            className="flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
          >
            <RefreshCw size={14} className={isLoadingLogs ? 'animate-spin' : ''} />
            Refresh Logs
          </button>
        </div>
        <div className="bg-black border border-neutral-800 rounded-2xl p-6 font-mono text-xs overflow-hidden">
          <div className="flex items-center gap-2 mb-4 text-neutral-500 border-b border-neutral-800 pb-2">
            <FileText size={14} />
            <span>nw-debug.log</span>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1 custom-scrollbar">
            {logs ? (
              logs.split('\n').map((line, i) => (
                <div key={i} className="whitespace-pre-wrap break-all">
                  {line}
                </div>
              ))
            ) : (
              <div className="text-neutral-600 italic">No logs available.</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
