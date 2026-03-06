import React from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { MediaItem, StreamingService } from '../types';

interface PlayerProps {
  item: MediaItem;
  service: StreamingService;
  onClose: () => void;
}

export default function Player({ item, service, onClose }: PlayerProps) {
  // Handle escape key to close
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleOpenExternal = () => {
    window.open(service.url, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Static Top Bar */}
      <div className="h-16 shrink-0 flex items-center justify-between px-6 bg-black border-b border-white/10 z-10 text-white">
        <button 
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 focus:bg-neutral-800 focus:ring-2 focus:ring-white outline-none rounded-md transition-all"
        >
          <ArrowLeft size={20} />
          <span className="font-medium">Back to Browse</span>
        </button>
        
        <div className="text-center pointer-events-none absolute left-1/2 -translate-x-1/2">
          <h2 className="text-lg font-bold truncate max-w-[200px] md:max-w-[400px]">{item.title}</h2>
          <p className="text-xs text-neutral-400">
            {service.url.includes('search') 
              ? "Search Results: Click the first game link below" 
              : `Streaming via ${service.name}`}
          </p>
        </div>

        <button 
          onClick={handleOpenExternal}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 focus:ring-2 focus:ring-white outline-none rounded-md transition-all font-bold"
        >
          <span className="hidden md:inline">Open in New Tab</span>
          <ExternalLink size={18} />
        </button>
      </div>

      {/* The Iframe Area */}
      <div className="flex-1 bg-black overflow-hidden">
        <iframe 
          src={service.url}
          className="w-full h-full border-none"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-presentation allow-storage-access-by-user-activation"
          referrerPolicy="no-referrer-when-downgrade"
          title={`Playing ${item.title} on ${service.name}`}
        />
      </div>
    </div>
  );
}
