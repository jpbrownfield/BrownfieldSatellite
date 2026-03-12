import React from 'react';
import { Star } from 'lucide-react';
import { MediaItem } from '../types';

interface MediaGridProps {
  title: string;
  items: MediaItem[];
  onSelect: (item: MediaItem) => void;
  myStuff?: MediaItem[];
}

export default function MediaGrid({ title, items, onSelect, myStuff }: MediaGridProps) {
  if (items.length === 0) return null;
  
  // Final safeguard: Deduplicate items by ID to prevent React key errors
  const uniqueItems = items.filter((item, index, self) =>
    index === self.findIndex((t) => t.id === item.id)
  );
  
  return (
    <div className="mb-12">
      <h2 className="text-2xl font-bold mb-8 px-4">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 px-4">
        {uniqueItems.map((item) => {
          const isStarred = myStuff?.some(i => i.id === item.id);
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              onFocus={(e) => e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
              className="relative aspect-[2/3] rounded-xl overflow-hidden group outline-none focus:ring-4 focus:ring-white focus:scale-105 z-0 focus:z-10 transition-all duration-300"
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
    </div>
  );
}
