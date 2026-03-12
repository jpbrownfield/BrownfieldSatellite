import React, { useState, useEffect } from 'react';
import { Search as SearchIcon, X, Play, Star } from 'lucide-react';
import { searchMedia } from '../services/tmdbService';
import { MediaItem, StreamingService } from '../types';

interface SearchScreenProps {
  onPlay: (item: MediaItem, service: StreamingService) => void;
  myStuff: MediaItem[];
  onToggleStar: (item: MediaItem) => void;
  onSelect: (item: MediaItem) => void;
}

export default function SearchScreen({ onPlay, myStuff, onToggleStar, onSelect }: SearchScreenProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (query.trim().length > 2) {
        setLoading(true);
        const data = await searchMedia(query);
        setResults(data);
        setLoading(false);
      } else {
        setResults([]);
      }
    }, 1000);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  return (
    <div className="p-12 h-full flex flex-col relative">
      <div className="relative max-w-3xl w-full mx-auto mb-12">
        <SearchIcon className="absolute left-6 top-1/2 -translate-y-1/2 text-neutral-400" size={28} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search movies, TV shows, or genres..."
          className="w-full bg-neutral-900 border border-neutral-800 rounded-full py-6 pl-20 pr-8 text-xl focus:outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600 transition-all"
        />
      </div>

      <div className="flex-1 overflow-y-auto pb-20">
        {loading ? (
          <div className="flex justify-center mt-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {results.filter((item, index, self) => 
              index === self.findIndex((t) => t.id === item.id)
            ).map((item) => {
              const isStarred = myStuff.some(i => i.id === item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => onSelect(item)}
                  onFocus={(e) => e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })}
                  className="relative aspect-[2/3] rounded-xl overflow-hidden group outline-none focus:ring-4 focus:ring-white focus:scale-110 z-0 focus:z-10 transition-all duration-300"
                >
                  <img 
                    src={item.posterUrl} 
                    alt={item.title} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  {isStarred && (
                    <div className="absolute top-2 right-2 z-10 bg-black/50 p-1.5 rounded-full backdrop-blur-sm">
                      <Star size={14} className="fill-yellow-400 text-yellow-400" />
                    </div>
                  )}
                  {item.type === 'live' && (
                    <div className={`absolute top-2 left-2 z-10 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase shadow-lg ${
                      item.status === 'LIVE' ? 'bg-red-600 animate-pulse' : 'bg-neutral-800 border border-white/10'
                    }`}>
                      {item.status === 'LIVE' ? 'Live' : (
                        item.startTime ? new Date(item.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Upcoming'
                      )}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4 text-center">
                    <span className="font-semibold text-sm">{item.title}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
