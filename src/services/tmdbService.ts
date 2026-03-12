import { MediaItem, StreamingService } from '../types';
import { getSettings } from '../utils/settings';

const BASE_URL = 'https://api.themoviedb.org/3';

const SERVICE_MAPPING: Record<string, string> = {
  'netflix': 'Netflix',
  'max': 'Max',
  'hbo': 'Max',
  'amazon': 'Amazon Prime',
  'prime': 'Amazon Prime',
  'hulu': 'Hulu',
  'disney': 'Disney+',
  'apple': 'Apple TV',
  'paramount': 'Paramount Plus',
  'peacock': 'Peacock'
};

async function getCanonicalName(providerName: string): Promise<string | null> {
  const name = providerName.toLowerCase();
  const settings = await getSettings();
  
  for (const [key, value] of Object.entries(SERVICE_MAPPING)) {
    if (name.includes(key)) {
      // Check if this canonical service is in the user's allowed list
      if (settings.allowedServices.includes(key)) {
        return value;
      }
    }
  }
  return null;
}

// TMDB doesn't provide direct deep links to the player in their free API, 
// so we construct a search/home URL for the major streaming services.
function getServiceUrl(canonicalName: string, title: string, tmdbLink: string): string {
  const name = canonicalName.toLowerCase();
  const q = encodeURIComponent(title);
  
  if (name.includes('netflix')) return `https://www.netflix.com/search?q=${q}`;
  if (name.includes('max')) return `https://play.max.com/search?q=${q}`;
  if (name.includes('amazon')) return `https://www.amazon.com/s?k=${q}&i=instant-video`;
  if (name.includes('hulu')) return `https://www.hulu.com/search?q=${q}`;
  if (name.includes('disney')) return `https://www.disneyplus.com/search?q=${q}`;
  if (name.includes('apple')) return `https://tv.apple.com/search?term=${q}`;
  if (name.includes('paramount')) return `https://www.paramountplus.com/search/?q=${q}`;
  if (name.includes('peacock')) return `https://www.peacocktv.com/watch/search?q=${q}`;
  
  return tmdbLink;
}

async function getProviders(id: number | string, type: 'movie' | 'tv', title: string): Promise<StreamingService[]> {
  try {
    const settings = await getSettings();
    const res = await fetch(`${BASE_URL}/${type}/${id}/watch/providers?api_key=${settings.tmdbApiKey}`);
    if (!res.ok) return [];
    const data = await res.json();
    
    const regionData = data.results?.[settings.region];
    if (!regionData || !regionData.flatrate) return [];
    
    const serviceMap = new Map<string, StreamingService>();

    for (const provider of regionData.flatrate) {
      const canonicalName = await getCanonicalName(provider.provider_name);
      if (canonicalName && !serviceMap.has(canonicalName)) {
        serviceMap.set(canonicalName, {
          name: canonicalName,
          url: getServiceUrl(canonicalName, title, regionData.link)
        });
      }
    }

    return Array.from(serviceMap.values());
  } catch (e) {
    console.error('Failed to fetch providers', e);
    return [];
  }
}

function formatMediaItem(item: any, type: 'movie' | 'tv'): Omit<MediaItem, 'services'> {
  return {
    id: item.id.toString(),
    title: item.title || item.name,
    type,
    description: item.overview || 'No description available.',
    year: (item.release_date || item.first_air_date || '').substring(0, 4),
    posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : `https://picsum.photos/seed/${item.id}/400/600`,
    backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : `https://picsum.photos/seed/${item.id}_bg/1920/1080`,
  };
}

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCache<T>(key: string): T | null {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
}

function setCache(key: string, data: any) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch (e) {
    console.warn('Failed to set cache', e);
  }
}

export function clearCache() {
  localStorage.removeItem('trending_movies');
  localStorage.removeItem('trending_tv');
}

async function processResults(results: any[], defaultType: 'movie' | 'tv'): Promise<MediaItem[]> {
  const BATCH_SIZE = 5; // Smaller batch size for better rate limit management
  const processedResults: MediaItem[] = [];
  
  // Deduplicate raw results first to avoid race conditions in async processing
  const uniqueRawResults = results.filter((item, index, self) => 
    index === self.findIndex((t) => t.id === item.id)
  );

  for (let i = 0; i < uniqueRawResults.length; i += BATCH_SIZE) {
    const batch = uniqueRawResults.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (item: any) => {
        const type = item.media_type || defaultType;
        if (type !== 'movie' && type !== 'tv') return null;
        
        const baseItem = formatMediaItem(item, type);
        const services = await getProviders(item.id, type, baseItem.title);
        
        if (services.length === 0) return null;
        
        return { ...baseItem, services };
      })
    );
    processedResults.push(...batchResults.filter((item): item is MediaItem => item !== null));
    
    // Add a small delay between batches to stay under TMDB's 40 requests / 10 seconds limit
    if (i + BATCH_SIZE < uniqueRawResults.length) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  
  return processedResults;
}

export async function searchMedia(query: string): Promise<MediaItem[]> {
  try {
    const settings = await getSettings();
    const res = await fetch(`${BASE_URL}/search/multi?api_key=${settings.tmdbApiKey}&query=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    const results = data.results.filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv').slice(0, 15);
    return processResults(results, 'movie');
  } catch (e) {
    console.error("Search failed", e);
    return [];
  }
}

export async function getTrendingMovies(): Promise<MediaItem[]> {
  const settings = await getSettings();
  const cacheKey = `trending_movies_${settings.region}_${settings.allowedServices.sort().join(',')}`;
  const cached = getCache<MediaItem[]>(cacheKey);
  if (cached) return cached;

  try {
    const pages = [1, 2, 3, 4, 5];
    const responses = await Promise.all(
      pages.map(page => fetch(`${BASE_URL}/trending/movie/day?api_key=${settings.tmdbApiKey}&page=${page}`).then(res => res.json()))
    );
    const allResults = responses.flatMap(data => data.results || []);
    const processed = await processResults(allResults, 'movie');
    setCache(cacheKey, processed);
    return processed;
  } catch (e) {
    console.error("Trending movies failed", e);
    return [];
  }
}

export async function getTrendingTv(): Promise<MediaItem[]> {
  const settings = await getSettings();
  const cacheKey = `trending_tv_${settings.region}_${settings.allowedServices.sort().join(',')}`;
  const cached = getCache<MediaItem[]>(cacheKey);
  if (cached) return cached;

  try {
    const pages = [1, 2, 3, 4, 5];
    const responses = await Promise.all(
      pages.map(page => fetch(`${BASE_URL}/trending/tv/day?api_key=${settings.tmdbApiKey}&page=${page}`).then(res => res.json()))
    );
    const allResults = responses.flatMap(data => data.results || []);
    const processed = await processResults(allResults, 'tv');
    setCache(cacheKey, processed);
    return processed;
  } catch (e) {
    console.error("Trending tv failed", e);
    return [];
  }
}

export async function getMediaDetails(id: string, type: 'movie' | 'tv'): Promise<MediaItem | null> {
  try {
    const settings = await getSettings();
    const res = await fetch(`${BASE_URL}/${type}/${id}?api_key=${settings.tmdbApiKey}`);
    if (!res.ok) return null;
    const item = await res.json();
    
    const baseItem = formatMediaItem(item, type);
    const services = await getProviders(item.id, type, baseItem.title);
    
    if (services.length === 0) return null;
    
    return { ...baseItem, services };
  } catch (e) {
    return null;
  }
}
