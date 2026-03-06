import React, { useEffect, useRef, useState } from 'react';
import { Play, Info, Star, ArrowLeft, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { MediaItem, StreamingService } from '../types';
import { findDirectSportsLink, findDirectMediaLink } from '../services/deepLinkService';

interface HeroProps {
  item: MediaItem;
  onPlay: (service: StreamingService) => void;
  isStarred: boolean;
  onToggleStar: (item: MediaItem) => void;
  onClose: () => void;
}

export default function Hero({ item, onPlay, isStarred, onToggleStar, onClose }: HeroProps) {
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const [directLink, setDirectLink] = useState<{ service: string, url: string } | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    // Focus back button on mount for remote/keyboard navigation
    backButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Search for direct link
    if (item.type === 'live' && item.league) {
      setIsSearching(true);
      setDirectLink(null);
      findDirectSportsLink(item.title, item.league).then(link => {
        if (link) {
          setDirectLink({ service: item.league === 'MLS' ? 'Apple TV' : 'DirecTV', url: link });
        }
        setIsSearching(false);
      }).catch(() => {
        setIsSearching(false);
      });
    } else if (item.type === 'movie' || item.type === 'tv') {
      setIsSearching(true);
      setDirectLink(null);
      findDirectMediaLink(item.title, item.type, item.year).then(link => {
        setDirectLink(link);
        setIsSearching(false);
      }).catch(() => {
        setIsSearching(false);
      });
    }

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, item]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="absolute inset-0 z-40 bg-neutral-950/90 backdrop-blur-xl flex flex-col overflow-y-auto overflow-x-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hero-title"
    >
      <div className="relative min-h-screen flex items-end pb-40 px-6 md:px-12 pt-32">
        <button 
          ref={backButtonRef}
          onClick={onClose}
          className="absolute top-8 left-8 z-50 flex items-center gap-2 px-4 py-2 bg-black/50 hover:bg-black/80 focus:bg-white focus:text-black focus:ring-4 focus:ring-white/50 outline-none rounded-full backdrop-blur-md transition-all text-white"
          aria-label="Back to list"
        >
          <ArrowLeft size={20} />
          <span className="font-medium">Back</span>
        </button>

        <div className="absolute top-0 left-0 right-0 z-0 h-[80vh]">
          <img 
            src={item.backdropUrl} 
            alt={item.title} 
            className="w-full h-full object-cover opacity-50"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/60 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-neutral-950 via-neutral-950/60 to-transparent"></div>
        </div>
        
        <div className="relative z-10 max-w-4xl mt-auto w-full">
        <h1 id="hero-title" className="text-4xl md:text-6xl font-bold mb-4 tracking-tight text-balance break-words">{item.title}</h1>
        <div className="flex items-center gap-4 text-sm font-medium text-neutral-300 mb-6 flex-wrap">
          {item.type === 'live' ? (
            <div className="flex items-center gap-3">
              <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                item.status === 'LIVE' ? 'bg-red-600' : 'bg-neutral-800 border border-neutral-700'
              }`}>
                {item.status === 'LIVE' ? 'Live Now' : item.status}
              </span>
              {item.startTime && (
                <span className="text-neutral-400">
                  {new Date(item.startTime).toLocaleString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric', 
                    hour: 'numeric', 
                    minute: '2-digit' 
                  })}
                </span>
              )}
            </div>
          ) : (
            <>
              <span>{item.year}</span>
              <span className="px-2 py-0.5 border border-neutral-600 rounded text-xs uppercase">{item.type}</span>
            </>
          )}
        </div>
        <p className="text-lg text-neutral-400 mb-8 line-clamp-3">
          {item.description}
        </p>
        
        <div className="flex flex-wrap gap-4">
          {isSearching && (
            <div className="flex items-center gap-2 px-6 py-3 bg-neutral-800 text-neutral-400 rounded-full font-semibold animate-pulse">
              <Loader2 size={20} className="animate-spin" />
              Finding direct link...
            </div>
          )}

          {directLink && (
            <button
              onClick={() => onPlay({ name: directLink.service, url: directLink.url })}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-full font-bold hover:bg-blue-500 focus:ring-4 focus:ring-white/50 focus:scale-105 outline-none transition-all shadow-lg shadow-blue-600/20"
            >
              <Play size={20} className="fill-current" />
              Watch Direct on {directLink.service}
            </button>
          )}

          {item.services.length > 0 ? (
            item.services.map((service, idx) => (
              <button
                key={idx}
                onClick={() => onPlay(service)}
                className={`flex items-center gap-2 px-6 py-3 rounded-full font-semibold outline-none transition-all ${
                  idx === 0 && !directLink && !isSearching
                    ? 'bg-white text-black hover:bg-neutral-200 focus:bg-neutral-200 focus:ring-4 focus:ring-white/50 focus:scale-105'
                    : 'bg-neutral-800/80 backdrop-blur-md text-white hover:bg-neutral-700 focus:bg-neutral-700 focus:ring-4 focus:ring-white/50 focus:scale-105'
                }`}
              >
                <Play size={20} className="fill-current" />
                {service.url.includes('search') ? `Search on ${service.name}` : `Watch on ${service.name}`}
              </button>
            ))
          ) : !isSearching && !directLink && (
            <button disabled className="flex items-center gap-2 px-6 py-3 bg-neutral-800 text-neutral-400 rounded-full font-semibold cursor-not-allowed">
              Not available to stream
            </button>
          )}
          <button 
            onClick={() => onToggleStar(item)}
            className="flex items-center gap-2 px-6 py-3 bg-neutral-800/80 backdrop-blur-md text-white rounded-full font-semibold hover:bg-neutral-700 focus:bg-neutral-700 focus:ring-4 focus:ring-white/50 focus:scale-105 outline-none transition-all"
          >
            <Star size={20} className={isStarred ? "fill-yellow-400 text-yellow-400" : ""} />
            {isStarred ? 'In My Stuff' : 'Add to My Stuff'}
          </button>
        </div>
      </div>
      </div>
    </motion.div>
  );
}
