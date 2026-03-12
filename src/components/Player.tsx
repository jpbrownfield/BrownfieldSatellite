import React, { useState } from 'react';
import { ArrowLeft, ExternalLink, Shield, ShieldAlert, PlayCircle } from 'lucide-react';
import { MediaItem, StreamingService } from '../types';
import { getSettings } from '../utils/settings';

interface PlayerProps {
  item: MediaItem;
  service: StreamingService;
  onClose: () => void;
}

export default function Player({ item, service, onClose }: PlayerProps) {
  const [useProxy, setUseProxy] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showHelper, setShowHelper] = useState(false);
  const [isRemoteMode, setIsRemoteMode] = useState(false);
  const remoteWindowRef = React.useRef<Window | null>(null);

  const proxyUrl = `/api/proxy?url=${encodeURIComponent(service.url)}`;
  const currentUrl = useProxy ? proxyUrl : service.url;

  // Cleanup remote window on unmount
  React.useEffect(() => {
    return () => {
      if (remoteWindowRef.current && !remoteWindowRef.current.closed) {
        remoteWindowRef.current.close();
      }
    };
  }, []);

  // Show helper after 5 seconds if still in iframe
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setShowHelper(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [currentUrl]);

  // Handle escape key to close
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCloseAll();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleOpenExternal = () => {
    // If we already have a window, focus it
    if (remoteWindowRef.current && !remoteWindowRef.current.closed) {
      remoteWindowRef.current.focus();
      return;
    }

    const settings = getSettings();
    
    // Desktop Mode Launch
    if (settings.enableDesktopMode) {
      fetch('/api/desktop/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          browserPath: settings.browserPath,
          url: service.url
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.simulated) {
          alert(`Desktop Launch Simulated!\n\nCommand: ${data.command}\n\nNote: This will open a real window when you run the app locally on your PC.`);
        } else if (data.error) {
          alert(`Error: ${data.error}`);
        } else {
          setIsRemoteMode(true);
        }
      })
      .catch(err => {
        console.error("Desktop launch failed", err);
        alert("Desktop launch failed. Make sure the app is running locally.");
      });
      return;
    }

    // Calculate window position to center it
    const width = 1280;
    const height = 720;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);

    // Open new standalone window (no address bar/tabs)
    const win = window.open(
      service.url, 
      'StreamingAppWindow', 
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`
    );

    if (win) {
      remoteWindowRef.current = win;
      setIsRemoteMode(true);
    } else {
      alert("Window blocked! Please allow popups to use Standalone App mode.");
    }
  };

  const handleCloseAll = () => {
    if (remoteWindowRef.current && !remoteWindowRef.current.closed) {
      remoteWindowRef.current.close();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Static Top Bar */}
      <div className="h-16 shrink-0 flex items-center justify-between px-6 bg-black border-b border-white/10 z-10 text-white">
        <div className="flex items-center gap-4">
          <button 
            onClick={handleCloseAll}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 focus:bg-neutral-800 focus:ring-2 focus:ring-white outline-none rounded-md transition-all"
          >
            <ArrowLeft size={20} />
            <span className="font-medium">Back</span>
          </button>

          {!isRemoteMode && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-neutral-900 border border-white/5 rounded-full text-xs text-neutral-400">
              <button 
                onClick={() => setUseProxy(false)}
                className={`px-2 py-1 rounded-full transition-colors ${!useProxy ? 'bg-white text-black font-bold' : 'hover:text-white'}`}
              >
                Direct
              </button>
              <button 
                onClick={() => setUseProxy(true)}
                className={`px-2 py-1 rounded-full transition-colors ${useProxy ? 'bg-blue-600 text-white font-bold' : 'hover:text-white'}`}
              >
                Proxy
              </button>
            </div>
          )}
        </div>
        
        <div className="text-center pointer-events-none absolute left-1/2 -translate-x-1/2">
          <h2 className="text-lg font-bold truncate max-w-[150px] md:max-w-[400px]">{item.title}</h2>
          <p className="text-[10px] md:text-xs text-neutral-400">
            {isRemoteMode ? "Standalone App Active" : (useProxy ? "Proxy Active" : `via ${service.name}`)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isRemoteMode && (
            <button 
              onClick={() => {
                if (remoteWindowRef.current && !remoteWindowRef.current.closed) {
                  remoteWindowRef.current.close();
                }
                setIsRemoteMode(false);
              }}
              className="hidden md:flex items-center gap-2 px-4 py-2 bg-red-600/20 text-red-500 hover:bg-red-600/30 rounded-md transition-all font-bold text-sm"
            >
              Close App
            </button>
          )}
          <button 
            onClick={handleOpenExternal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 focus:ring-2 focus:ring-white outline-none rounded-md transition-all font-bold"
          >
            <span className="hidden md:inline">{isRemoteMode ? "Focus App" : "App Mode"}</span>
            <ExternalLink size={18} />
          </button>
        </div>
      </div>

      {/* The Iframe Area */}
      <div className="flex-1 bg-black relative overflow-hidden">
        {/* Remote Control Dashboard */}
        {isRemoteMode ? (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-neutral-950 p-6 text-center">
            <div className="relative mb-8">
              <div className="w-32 h-32 bg-blue-600/10 rounded-full flex items-center justify-center animate-pulse">
                <PlayCircle size={64} className="text-blue-500" />
              </div>
              <div className="absolute -top-2 -right-2 bg-green-500 w-6 h-6 rounded-full border-4 border-neutral-950 flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full animate-ping" />
              </div>
            </div>
            
            <h3 className="text-3xl font-bold mb-2">Standalone App Active</h3>
            <p className="text-neutral-400 max-w-md mb-12">
              The content is playing in a dedicated window. This allows your Chrome extensions and login sessions to work perfectly.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-lg">
              <button 
                onClick={handleOpenExternal}
                className="flex items-center justify-center gap-3 px-8 py-6 bg-white text-black rounded-2xl font-bold text-lg hover:bg-neutral-200 transition-all"
              >
                <ExternalLink size={24} />
                Focus App Window
              </button>
              <button 
                onClick={handleCloseAll}
                className="flex items-center justify-center gap-3 px-8 py-6 bg-red-600 text-white rounded-2xl font-bold text-lg hover:bg-red-500 transition-all"
              >
                <Shield size={24} />
                Close App Window
              </button>
            </div>

            <div className="mt-12 flex items-center gap-2 text-neutral-500 text-sm">
              <Shield size={16} className="text-green-500" />
              <span>Managed Session: The window will close when you exit this screen.</span>
            </div>
          </div>
        ) : (
          <>
            {/* Fallback / Launch Screen */}
            {hasError && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-neutral-950 p-6 text-center">
                <div className="w-20 h-20 bg-neutral-900 rounded-full flex items-center justify-center mb-6 border border-white/10">
                  <ShieldAlert size={40} className="text-yellow-500" />
                </div>
                <h3 className="text-2xl font-bold mb-2">Content Blocked by Provider</h3>
                <p className="text-neutral-400 max-w-md mb-8">
                  {service.name} prevents embedding. Use **Remote Mode** to watch with full extension support.
                </p>
                <button 
                  onClick={handleOpenExternal}
                  className="flex items-center gap-3 px-8 py-4 bg-white text-black rounded-xl font-bold text-lg hover:bg-neutral-200 transition-all scale-105"
                >
                  <PlayCircle size={24} />
                  Launch Remote Mode
                </button>
                
                {!useProxy && (
                  <button 
                    onClick={() => { setUseProxy(true); setHasError(false); }}
                    className="mt-6 text-blue-400 hover:text-blue-300 underline text-sm"
                  >
                    Try Proxy Bypass (Extensions won't work)
                  </button>
                )}
              </div>
            )}

            <iframe 
              key={currentUrl}
              src={currentUrl}
              className="w-full h-full border-none"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-presentation allow-storage-access-by-user-activation"
              referrerPolicy="no-referrer"
              title={`Playing ${item.title} on ${service.name}`}
              onError={() => setHasError(true)}
            />

            {showHelper && !hasError && (
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-neutral-900/90 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-white">Not loading correctly?</span>
                    <span className="text-xs text-neutral-400">Try Remote Mode for the best experience.</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={handleOpenExternal}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all"
                    >
                      Launch Remote Mode
                    </button>
                    <button 
                      onClick={() => setShowHelper(false)}
                      className="p-2 text-neutral-500 hover:text-white transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
