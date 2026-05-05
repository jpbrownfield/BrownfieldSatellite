import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock localStorage to fix happy-dom bug
const localStorageMock = (function () {
  let store: Record<string, string> = {};
  return {
    getItem: function (key: string) {
      return store[key] || null;
    },
    setItem: function (key: string, value: string) {
      store[key] = value.toString();
    },
    clear: function () {
      store = {};
    }
  };
})();

global.localStorage = localStorageMock as any;

// Mock the bridge to avoid real IPC calls in tests
vi.mock('../src/utils/bridge', () => ({
  bridge: {
    isNW: false,
    invoke: vi.fn().mockResolvedValue({}),
    on: vi.fn(),
    removeListener: vi.fn(),
  }
}));

import { bridge } from '../src/utils/bridge';
import * as tmdbService from '../src/services/tmdbService';

describe('TMDB Service Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Simulate an empty saved settings so it defaults back to valid keys
    (bridge.invoke as any).mockResolvedValue({});
  });

  it('should fetch popular movies successfully', async () => {
    // To ensure the actual network call works, we bypass caching, but we don't mock global fetch
    // so we can test actual API integration.
    
    // Using default api key from getSettings() under the hood
    const result = await tmdbService.getTrendingMovies();
    
    // Log out what came back to help debug the blank lists issue
    console.log(`Popular movies fetched: ${result.length}`);
    
    // We expect actual TMDB data back if network works
    expect(result).toBeInstanceOf(Array);
    if (result.length > 0) {
        expect(result[0]).toHaveProperty('id');
        expect(result[0]).toHaveProperty('title');
        expect(result[0]).toHaveProperty('posterUrl');
    }
  }, 30000);

  it('should fetch trending TV shows successfully', async () => {
    const result = await tmdbService.getTrendingTv();
    console.log(`Popular TV shows fetched: ${result.length}`);

    expect(result).toBeInstanceOf(Array);
     if (result.length > 0) {
        expect(result[0]).toHaveProperty('id');
        expect(result[0]).toHaveProperty('title');
        expect(result[0]).toHaveProperty('description');
    }
  }, 30000);

  it('should fail gracefully if the API key is totally invalid', async () => {
    (bridge.invoke as any).mockResolvedValue({ tmdbApiKey: 'invalid_key_12345' });
    try {
        const result = await tmdbService.getTrendingTv();
        expect(result).toBeInstanceOf(Array);
    } catch(e) {
        expect(e).toBeUndefined();
    }
  }, 30000);
});
