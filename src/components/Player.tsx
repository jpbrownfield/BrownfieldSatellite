import React, { useState } from 'react';
import { ArrowLeft, ExternalLink, Shield, ShieldAlert, PlayCircle, RefreshCw } from 'lucide-react';
import { MediaItem, StreamingService } from '../types';
import { getSettings } from '../utils/settings';

interface PlayerProps {
  item: MediaItem;
  service: StreamingService;
  onClose: () => void;
}

export default function Player({ item, service, onClose }: PlayerProps) {
  const [isRemoteMode, setIsRemoteMode] = useState(false);
  const [isLaunching, setIsLaunching] = useState(true);
  const remoteWindowRef = React.useRef<Window | null>(null);

  // Cleanup remote window on unmount
  React.useEffect(() => {
    handleLaunch();
    return () => {
      if (remoteWindowRef.current && !remoteWindowRef.current.closed) {
        remoteWindowRef.current.close();
      }
    };
  }, []);

  const handleLaunch = async () => {
    console.log(`Attempting to launch: ${service.url}`);
    setIsLaunching(true);
    const settings = await getSettings();
    
    // Desktop Mode Launch
    try {
      const response = await fetch('/api/desktop/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          browserPath: settings.browserPath,
          url: service.url
        })
      });

      const data = await response.json();

      if (data.simulated) {
        console.log("Launch simulated", data.command);
        alert(`Desktop Launch Simulated!\n\nCommand: ${data.command}\n\nNote: This will open a real window when you run the app locally on your PC.`);
        setIsRemoteMode(true);
      } else if (data.error) {
        console.error("Launch error from server", data.error);
        alert(`Error: ${data.error}\n\n${data.details || ''}`);
        onClose(); 
      } else {
        console.log("Launch successful");
        setIsRemoteMode(true);
      }
    } catch (err) {
      console.error("Desktop launch fetch failed", err);
      // Fallback to popup
      const width = 1280;
      const height = 720;
      const left = (window.screen.width / 2) - (width / 2);
      const top = (window.screen.height / 2) - (height / 2);

      const win = window.open(
        service.url, 
        'StreamingAppWindow', 
        `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`
      );

      if (win) {
        remoteWindowRef.current = win;
        setIsRemoteMode(true);
      } else {
        // If we get here, it's likely a popup blocker issue
        // We'll stay on the launch screen but allow manual retry
        console.warn("Popup blocked or launch failed");
      }
    } finally {
      setIsLaunching(false);
    }
  };

  const handleFocus = () => {
    if (remoteWindowRef.current && !remoteWindowRef.current.closed) {
      remoteWindowRef.current.focus();
    } else {
      handleLaunch(); // Re-launch if closed
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
            <span className="font-medium">Exit Player</span>
          </button>
        </div>
        
        <div className="text-center pointer-events-none absolute left-1/2 -translate-x-1/2">
          <h2 className="text-lg font-bold truncate max-w-[150px] md:max-w-[400px]">{item.title}</h2>
          <p className="text-[10px] md:text-xs text-neutral-400">
            {isLaunching ? "Launching App..." : "Standalone App Active"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={handleFocus}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 focus:ring-2 focus:ring-white outline-none rounded-md transition-all font-bold"
          >
            <span className="hidden md:inline">{isLaunching ? "Retry Launch" : "Focus App"}</span>
            <ExternalLink size={18} />
          </button>
        </div>
      </div>

      {/* The Remote Control Dashboard */}
      <div className="flex-1 bg-black relative overflow-hidden">
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-neutral-950 p-6 text-center">
          <div className="relative mb-8">
            <div className={`w-32 h-32 bg-blue-600/10 rounded-full flex items-center justify-center ${isLaunching ? 'animate-spin' : 'animate-pulse'}`}>
              {isLaunching ? <RefreshCw size={64} className="text-blue-500 animate-spin" /> : <PlayCircle size={64} className="text-blue-500" />}
            </div>
            {!isLaunching && (
              <div className="absolute -top-2 -right-2 bg-green-500 w-6 h-6 rounded-full border-4 border-neutral-950 flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full animate-ping" />
              </div>
            )}
          </div>
          
          <h3 className="text-3xl font-bold mb-2">
            {isLaunching ? "Launching Standalone App" : "Standalone App Active"}
          </h3>
          <p className="text-neutral-400 max-w-md mb-12">
            {isLaunching 
              ? "Connecting to your local browser to launch the content in a dedicated window..." 
              : "The content is playing in a dedicated window. This allows your Chrome extensions and login sessions to work perfectly."}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-lg">
            <button 
              onClick={handleFocus}
              className="flex items-center justify-center gap-3 px-8 py-6 bg-white text-black rounded-2xl font-bold text-lg hover:bg-neutral-200 transition-all"
            >
              <ExternalLink size={24} />
              {isLaunching ? "Try Launching Again" : "Focus App Window"}
            </button>
            <button 
              onClick={handleCloseAll}
              className="flex items-center justify-center gap-3 px-8 py-6 bg-red-600 text-white rounded-2xl font-bold text-lg hover:bg-red-500 transition-all"
            >
              <Shield size={24} />
              Close & Exit
            </button>
          </div>

          <div className="mt-12 flex items-center gap-2 text-neutral-500 text-sm">
            <Shield size={16} className="text-green-500" />
            <span>Managed Session: The window will close when you exit this screen.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
