import React, { useEffect, useRef, useState } from 'react';
import { Play, Info, Star, ArrowLeft, Loader2, X, ChevronDown, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MediaItem, StreamingService, Season, Episode } from '../types';
import { getTvEpisodes } from '../services/tmdbService';

interface HeroProps {
  item: MediaItem;
  onPlay: (service: StreamingService) => void;
  isStarred: boolean;
  onToggleStar: (item: MediaItem) => void;
  onClose: () => void;
}

export default function Hero({ item, onPlay, isStarred, onToggleStar, onClose }: HeroProps) {
  const backButtonRef = useRef<HTMLButtonElement>(null);
  
  // TV Show specific state
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);

  useEffect(() => {
    // Focus back button on mount for remote/keyboard navigation
    backButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // If it's a TV show, pre-select the first season
    if (item.type === 'tv' && item.seasons && item.seasons.length > 0) {
      const firstSeason = item.seasons.find(s => s.seasonNumber > 0) || item.seasons[0];
      setSelectedSeason(firstSeason);
    }

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, item]);

  // Fetch episodes when season changes
  useEffect(() => {
    if (item.type === 'tv' && selectedSeason) {
      setLoadingEpisodes(true);
      getTvEpisodes(item.id, selectedSeason.seasonNumber).then(data => {
        setEpisodes(data);
        setLoadingEpisodes(false);
      }).catch(() => {
        setLoadingEpisodes(false);
      });
    }
  }, [item.id, item.type, selectedSeason]);

  const handleEpisodeSelect = async (episode: Episode) => {
    setSelectedEpisode(episode);
  };

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

        <div className="flex flex-wrap gap-4 mb-8">
          {item.services.length > 0 ? (
            item.services.map((service, idx) => (
              <button
                key={idx}
                onClick={() => onPlay(service)}
                className={`flex items-center gap-2 px-6 py-3 rounded-full font-semibold outline-none transition-all ${
                  idx === 0
                    ? 'bg-white text-black hover:bg-neutral-200 focus:bg-neutral-200 focus:ring-4 focus:ring-white/50 focus:scale-105'
                    : 'bg-neutral-800/80 backdrop-blur-md text-white hover:bg-neutral-700 focus:bg-neutral-700 focus:ring-4 focus:ring-white/50 focus:scale-105'
                }`}
              >
                <Play size={20} className="fill-current" />
                {selectedEpisode 
                  ? `Watch S${selectedSeason?.seasonNumber}E${selectedEpisode.episodeNumber} on ${service.name}`
                  : `Watch on ${service.name}`
                }
              </button>
            ))
          ) : (
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

        {/* TV Show Season/Episode Selector */}
        {item.type === 'tv' && item.seasons && (
          <div className="mb-10">
            <div className="flex items-center gap-4 mb-6 overflow-x-auto pb-2 scrollbar-hide">
              {item.seasons.map((season) => (
                <button
                  key={season.id}
                  onClick={() => setSelectedSeason(season)}
                  className={`px-4 py-2 rounded-lg whitespace-nowrap transition-all outline-none focus:ring-2 focus:ring-white ${
                    selectedSeason?.id === season.id 
                      ? 'bg-white text-black font-bold' 
                      : 'bg-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  {season.name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
              {loadingEpisodes ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-24 bg-neutral-900 rounded-xl animate-pulse"></div>
                ))
              ) : (
                episodes.map((episode) => (
                  <button
                    key={episode.id}
                    onClick={() => handleEpisodeSelect(episode)}
                    className={`flex flex-col items-start p-4 rounded-xl text-left transition-all outline-none focus:ring-2 focus:ring-white ${
                      selectedEpisode?.id === episode.id
                        ? 'bg-blue-600/20 border border-blue-500'
                        : 'bg-neutral-900 border border-transparent hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">Episode {episode.episodeNumber}</span>
                      <span className="text-[10px] text-neutral-500">{episode.airDate}</span>
                    </div>
                    <h4 className="font-semibold mb-2 line-clamp-1">{episode.name}</h4>
                    <p className="text-xs text-neutral-500 line-clamp-2">{episode.overview || 'No description available.'}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      </div>
    </motion.div>
  );
}
