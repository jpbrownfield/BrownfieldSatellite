import React from 'react';
import { MediaItem } from '../types';

interface SportsRowProps {
  title: string;
  items: MediaItem[];
  onSelect: (item: MediaItem) => void;
}

export default function SportsRow({ title, items, onSelect }: SportsRowProps) {
  if (items.length === 0) return null;
  
  return (
    <div className="mb-12">
      <h2 className="text-2xl font-bold mb-6 px-4 tracking-tight">{title}</h2>
      <div className="flex gap-6 overflow-x-auto pb-8 px-4 scrollbar-hide snap-x">
        {items.map((item) => {
          const isLive = item.status === 'LIVE';
          const date = item.startTime ? new Date(item.startTime) : null;
          
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              onFocus={(e) => e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })}
              className="relative shrink-0 w-64 aspect-video rounded-2xl overflow-hidden group snap-start outline-none focus:ring-4 focus:ring-white focus:scale-105 z-0 focus:z-10 transition-all duration-300 bg-neutral-900 border border-white/5"
            >
              {/* Background Logo / Image */}
              <div className="absolute inset-0 flex items-center justify-center p-6 bg-neutral-900">
                <img 
                  src={item.posterUrl} 
                  alt={item.title} 
                  className="w-full h-full object-contain opacity-90 group-hover:opacity-100 transition-all duration-500 group-hover:scale-110"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Content Overlay */}
              <div className="absolute inset-0 flex flex-col justify-between p-4 bg-gradient-to-t from-black/95 via-black/10 to-black/30">
                <div className="flex justify-between items-start">
                  {isLive ? (
                    <span className="bg-red-600 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded animate-pulse shadow-lg">
                      Live
                    </span>
                  ) : (
                    <span className="bg-white text-black text-[10px] font-black uppercase px-2 py-0.5 rounded shadow-lg">
                      Upcoming
                    </span>
                  )}
                  <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest ml-auto">
                    {item.league}
                  </span>
                </div>

                <div className="space-y-1">
                  <h3 className="font-bold text-sm leading-tight text-white drop-shadow-md">
                    {item.title}
                  </h3>
                  <div className="text-sm font-medium text-neutral-200">
                    {isLive ? (
                      <span className="text-red-400">Playing Now</span>
                    ) : (
                      date?.toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        hour: 'numeric', 
                        minute: '2-digit' 
                      })
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
