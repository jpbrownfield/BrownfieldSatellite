export interface StreamingService {
  name: string;
  url: string;
}

export interface MediaItem {
  id: string;
  title: string;
  type: 'movie' | 'tv' | 'live';
  description: string;
  year: string;
  posterUrl: string;
  backdropUrl: string;
  services: StreamingService[];
  startTime?: string; // ISO string
  status?: string;
  league?: 'NFL' | 'NBA' | 'MLB' | 'MLS';
}
