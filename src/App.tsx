/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { getTrendingMovies, getTrendingTv, getMediaDetails } from './services/tmdbService';
import { getLiveSportsEvents } from './services/sportsService';
import { getMyStuffCookie, setMyStuffCookie } from './utils/cookies';
import { getSettings } from './utils/settings';
import { MediaItem, StreamingService } from './types';

// Components
import Sidebar from './components/Sidebar';
import Hero from './components/Hero';
import MediaRow from './components/MediaRow';
import MediaGrid from './components/MediaGrid';
import SportsRow from './components/SportsRow';
import Player from './components/Player';
import SearchScreen from './components/SearchScreen';
import SettingsScreen from './components/SettingsScreen';

export default function App() {
  const [activeTab, setActiveTab] = useState('mystuff');
  const [movies, setMovies] = useState<MediaItem[]>([]);
  const [tvShows, setTvShows] = useState<MediaItem[]>([]);
  const [sports, setSports] = useState<MediaItem[]>([]);
  const [myStuff, setMyStuff] = useState<MediaItem[]>([]);
  const [featured, setFeatured] = useState<MediaItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  
  const [playing, setPlaying] = useState<{item: MediaItem, service: StreamingService} | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const settings = getSettings();
      try {
        const [m, t, liveSports] = await Promise.all([
          getTrendingMovies().catch(() => []), 
          getTrendingTv().catch(() => []), 
          getLiveSportsEvents().catch(() => [])
        ]);
        setMovies(m);
        setTvShows(t);
        
        // Filter sports based on settings
        const filteredSports = (liveSports || []).filter(item => {
          const allowed = settings.allowedServices || [];
          if (item.league === 'MLS') return allowed.includes('apple');
          return allowed.includes('directv');
        });
        setSports(filteredSports);
        
        const stuffIds = getMyStuffCookie();
        // Deduplicate stuffIds before fetching
        const uniqueStuffIds = Array.from(new Set(stuffIds.map(i => `${i.id}-${i.type}`)))
          .map(str => {
            const [id, type] = str.split('-');
            return { id, type: type as 'movie' | 'tv' };
          });
          
        const stuffItems = await Promise.all(uniqueStuffIds.map(i => getMediaDetails(i.id, i.type).catch(() => null)));
        const validStuff = stuffItems.filter(i => i !== null) as MediaItem[];
        setMyStuff(validStuff);
      } catch (error) {
        console.error("Failed to load app data", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [refreshKey]);

  const handleSettingsChange = () => {
    setRefreshKey(prev => prev + 1);
  };

  useEffect(() => {
    setFeatured(null);
  }, [activeTab]);

  useEffect(() => {
    if (featured) {
      const main = document.getElementById('main-content');
      if (main) main.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [featured]);

  const toggleStar = (item: MediaItem) => {
    const exists = myStuff.find(i => i.id === item.id);
    let newStuff;
    if (exists) {
      newStuff = myStuff.filter(i => i.id !== item.id);
    } else {
      newStuff = [...myStuff, item];
    }
    setMyStuff(newStuff);
    setMyStuffCookie(newStuff.map(i => ({id: i.id, type: i.type})));
  };

  const isStarred = (item: MediaItem | null) => {
    if (!item) return false;
    return myStuff.some(i => i.id === item.id);
  };

  const handleClosePlayer = () => {
    const settings = getSettings();
    if (settings.enableDesktopMode) {
      fetch('/api/desktop/close', { method: 'POST' }).catch(() => {});
    }
    setPlaying(null);
  };

  if (playing) {
    return <Player item={playing.item} service={playing.service} onClose={handleClosePlayer} />;
  }

  return (
    <div className="flex h-screen w-full bg-neutral-950 text-white overflow-hidden font-sans">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main id="main-content" className={`flex-1 relative ${featured ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
          </div>
        ) : (
          <>
            <div className="flex flex-col w-full" inert={!!featured}>
              {activeTab === 'mystuff' && (
                <div className="relative z-10 mt-12 pb-20 px-8">
                  {myStuff.length > 0 ? (
                    <MediaGrid title="My Stuff" items={myStuff} onSelect={setFeatured} myStuff={myStuff} />
                  ) : (
                    <div className="text-center mt-32">
                      <h2 className="text-2xl font-bold mb-4">Your Stuff is Empty</h2>
                      <p className="text-neutral-400">Search for movies and TV shows and click the star to add them here.</p>
                    </div>
                  )}
                </div>
              )}
              
              {activeTab === 'movies' && (
                <div className="relative z-10 mt-12 pb-20 px-8">
                  <MediaGrid title="Trending Movies" items={movies} onSelect={setFeatured} myStuff={myStuff} />
                </div>
              )}

              {activeTab === 'tv' && (
                <div className="relative z-10 mt-12 pb-20 px-8">
                  <MediaGrid title="Trending TV Shows" items={tvShows} onSelect={setFeatured} myStuff={myStuff} />
                </div>
              )}

              {activeTab === 'sports' && (
                <div className="relative z-10 mt-12 pb-20">
                  <SportsRow title="NFL" items={sports.filter(s => s.league === 'NFL')} onSelect={setFeatured} />
                  <SportsRow title="NBA" items={sports.filter(s => s.league === 'NBA')} onSelect={setFeatured} />
                  <SportsRow title="MLB" items={sports.filter(s => s.league === 'MLB')} onSelect={setFeatured} />
                  <SportsRow title="MLS" items={sports.filter(s => s.league === 'MLS')} onSelect={setFeatured} />
                  
                  {sports.length === 0 && (
                    <div className="text-center mt-32">
                      <h2 className="text-2xl font-bold mb-4">No Live Events Found</h2>
                      <p className="text-neutral-400">Check back later for upcoming Atlanta sports games.</p>
                    </div>
                  )}
                </div>
              )}
              
              {activeTab === 'search' && (
                <SearchScreen onPlay={(item, service) => setPlaying({item, service})} myStuff={myStuff} onToggleStar={toggleStar} onSelect={setFeatured} />
              )}

              {activeTab === 'settings' && (
                <SettingsScreen onSettingsChange={handleSettingsChange} />
              )}
            </div>

            <AnimatePresence>
              {featured && (
                <Hero 
                  item={featured} 
                  onPlay={(service) => setPlaying({item: featured, service})} 
                  isStarred={isStarred(featured)} 
                  onToggleStar={toggleStar} 
                  onClose={() => setFeatured(null)}
                />
              )}
            </AnimatePresence>
          </>
        )}
      </main>
    </div>
  );
}
