import React from 'react';
import { Star } from 'lucide-react';
import { MediaItem } from '../types';

interface MediaRowProps {
  title: string;
  items: MediaItem[];
  onSelect: (item: MediaItem) => void;
  myStuff?: MediaItem[];
}

export default function MediaRow({ title, items, onSelect, myStuff }: MediaRowProps) {
  if (items.length === 0) return null;
  
  return (
    <div className="mb-12">
      <h2 className="text-xl font-semibold mb-4 px-4">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-4 px-4 scrollbar-hide snap-x">
        {items.map((item) => {
          const isStarred = myStuff?.some(i => i.id === item.id);
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              onFocus={(e) => e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })}
              className="relative shrink-0 w-48 aspect-[2/3] rounded-xl overflow-hidden group snap-start outline-none focus:ring-4 focus:ring-white focus:scale-110 z-0 focus:z-10 transition-all duration-300"
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
