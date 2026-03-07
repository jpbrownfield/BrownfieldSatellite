import React from 'react';
import { Search, Star, Tv, Film, Settings, Satellite, Trophy } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const navItems = [
    { id: 'search', icon: Search, label: 'Search' },
    { id: 'mystuff', icon: Star, label: 'My Stuff' },
    { id: 'movies', icon: Film, label: 'Movies' },
    { id: 'tv', icon: Tv, label: 'TV Shows' },
    { id: 'sports', icon: Trophy, label: 'Sports Hub' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="w-20 hover:w-64 transition-all duration-300 ease-in-out bg-neutral-950/80 backdrop-blur-md border-r border-white/5 flex flex-col items-start py-8 group z-50 absolute h-full md:relative">
      <div className="px-6 mb-12 w-full flex justify-center group-hover:justify-start">
        <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-sky-500 rounded-lg flex items-center justify-center font-bold text-xl shrink-0">
          <Satellite size={20} className="text-white" />
        </div>
        <span className="ml-4 font-bold text-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden group-hover:block">
          Brownfield Satellite
        </span>
      </div>
      
      <nav className="flex-1 w-full flex flex-col gap-2 px-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center justify-center group-hover:justify-start gap-0 group-hover:gap-4 px-0 group-hover:px-4 py-3 rounded-xl transition-all w-full outline-none focus:ring-2 focus:ring-white focus:scale-105 ${
                isActive 
                  ? 'bg-white/10 text-white' 
                  : 'text-neutral-400 hover:text-white hover:bg-white/5 focus:bg-white/10 focus:text-white'
              }`}
            >
              <Icon size={24} className="shrink-0" />
              <span className="font-medium opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden group-hover:block">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
