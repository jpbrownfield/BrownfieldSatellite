// Note: The platform injects GEMINI_API_KEY into the environment.
// We use a fallback to ensure it works in both local dev and production build.
const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-3.1-flash-lite-preview";
const CACHE_KEY = 'direct_links_cache_v1';
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Direct fetch implementation to bypass SDK-specific CORS issues
async function callGemini(prompt: string, useSearch: boolean = false) {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  // Using v1beta because google_search_retrieval is a beta feature
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
  
  const body: any = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  if (useSearch) {
    // Correct REST syntax for Google Search grounding
    body.tools = [{
      google_search_retrieval: {
        dynamic_retrieval_config: {
          mode: "MODE_DYNAMIC",
          dynamic_threshold: 0.3
        }
      }
    }];
  }

  const response = await fetch(url, {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("Gemini API Error Details:", errorData);
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

function getFromCache<T>(key: string): T | null {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (!stored) return null;
    const cache = JSON.parse(stored);
    const entry = cache[key] as CacheEntry<T>;
    if (!entry) return null;
    
    if (Date.now() > entry.expiry) {
      delete cache[key];
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      return null;
    }
    return entry.data;
  } catch (e) {
    console.warn("Cache read error", e);
    return null;
  }
}

function saveToCache<T>(key: string, data: T) {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    const cache = stored ? JSON.parse(stored) : {};
    cache[key] = {
      data,
      expiry: Date.now() + ONE_WEEK_MS
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn("Cache write error", e);
  }
}

export async function findDirectSportsLink(matchup: string, league: string): Promise<string | null> {
  const cacheKey = `sports:${league}:${matchup}`;
  const cached = getFromCache<string>(cacheKey);
  if (cached) return cached;

  try {
    const prompt = `Find the direct streaming URL for the ${league} game: ${matchup}. 
    I am looking for a direct link to the specific event page on either DirecTV Stream (directv.com) or Apple TV (tv.apple.com) if it's MLS. 
    A direct link usually ends with an ID or a slug for that specific game. 
    Example DirecTV: https://www.directv.com/stream/live/12345 or https://www.directv.com/watch/live/12345
    Example Apple TV: https://tv.apple.com/sporting-event/atlanta-united-vs-inter-miami/umc.cse.12345
    Return ONLY the URL if you can find a direct event link. 
    If you can only find a search page, return "NOT_FOUND".`;

    const text = await callGemini(prompt, true);
    const trimmedText = text.trim();

    if (trimmedText && trimmedText !== "NOT_FOUND" && (trimmedText.startsWith("http://") || trimmedText.startsWith("https://"))) {
      const urlMatch = trimmedText.match(/https?:\/\/[^\s`]+(?:\/[^\s`]+)*/);
      const result = urlMatch ? urlMatch[0] : null;
      if (result) saveToCache(cacheKey, result);
      return result;
    }
    return null;
  } catch (error) {
    console.error("Failed to find sports deep link:", error);
    return null;
  }
}

export async function findDirectMediaLink(title: string, type: 'movie' | 'tv', year?: string): Promise<{ service: string, url: string } | null> {
  const cacheKey = `media:${type}:${title}:${year || 'any'}`;
  const cached = getFromCache<{ service: string, url: string }>(cacheKey);
  if (cached) return cached;

  try {
    const prompt = `Find the direct streaming URL for the ${type}: "${title}" ${year ? `(${year})` : ''}. 
    I am looking for a direct link to the movie or show page on a major streaming service (Netflix, Disney+, Hulu, Max, Amazon Prime Video, Apple TV+, etc.). 
    A direct link usually ends with an ID or a slug for that specific title. 
    Example Netflix: https://www.netflix.com/title/12345678
    Example Disney+: https://www.disneyplus.com/movies/title-slug/12345678
    Return ONLY the name of the service and the URL separated by a pipe character, e.g., "Netflix|https://www.netflix.com/title/12345678".
    If you cannot find a direct link, return "NOT_FOUND".`;

    const text = await callGemini(prompt, true);
    const trimmedText = text.trim();

    if (trimmedText && trimmedText !== "NOT_FOUND" && trimmedText.includes('|')) {
      const [service, url] = trimmedText.split('|').map(s => s.trim());
      if (url.startsWith("http://") || url.startsWith("https://")) {
        const urlMatch = url.match(/https?:\/\/[^\s`]+(?:\/[^\s`]+)*/);
        if (urlMatch) {
          const result = { service, url: urlMatch[0] };
          saveToCache(cacheKey, result);
          return result;
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Failed to find media deep link:", error);
    return null;
  }
}
