import { MediaItem } from "../types";

const ATLANTA_TEAMS = [
  { league: 'NFL', sport: 'football', id: '1', name: 'Falcons', logo: 'https://a.espncdn.com/i/teamlogos/nfl/500/atl.png' },
  { league: 'NBA', sport: 'basketball', id: '1', name: 'Hawks', logo: 'https://a.espncdn.com/i/teamlogos/nba/500/atl.png' },
  { league: 'MLB', sport: 'baseball', id: '15', name: 'Braves', logo: 'https://a.espncdn.com/i/teamlogos/mlb/500/atl.png' },
  { league: 'MLS', sport: 'soccer', id: '18418', name: 'Atlanta United', logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/18418.png' }
];

export async function getLiveSportsEvents(): Promise<MediaItem[]> {
  try {
    const fetchPromises = ATLANTA_TEAMS.map(async (team) => {
      try {
        const leagueSlug = team.league === 'MLS' ? 'usa.1' : team.league.toLowerCase();
        const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${team.sport}/${leagueSlug}/teams/${team.id}/schedule`);
        if (!res.ok) return [];
        const data = await res.json();
        
        const events = data.events || [];
        
        // Use a robust "start of today" for filtering
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const twoWeeksFromNow = new Date(startOfToday);
        twoWeeksFromNow.setDate(startOfToday.getDate() + 14);
        const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;

        return events.map((event: any) => {
          if (!event.competitions || event.competitions.length === 0) return null;
          
          const competition = event.competitions[0];
          if (!competition.competitors || competition.competitors.length < 2) return null;

          const eventDate = new Date(event.date);
          const isLive = competition.status?.type?.state === 'in';
          
          // Filter: 
          // 1. Filter out games that started more than 5 hours ago and are not live
          if (!isLive && (now.getTime() - eventDate.getTime() > FIVE_HOURS_MS)) return null;
          // 2. Filter out games more than 2 weeks in the future
          if (eventDate > twoWeeksFromNow) return null;

          const homeTeam = competition.competitors.find((c: any) => c.homeAway === 'home');
          const awayTeam = competition.competitors.find((c: any) => c.homeAway === 'away');
          
          if (!homeTeam || !awayTeam) return null;

          const status = competition.status?.type?.description || 'Scheduled';
          
          const title = `${awayTeam.team?.displayName || 'TBD'} @ ${homeTeam.team?.displayName || 'TBD'}`;
          const searchQuery = `${awayTeam.team?.displayName || ''} ${homeTeam.team?.displayName || ''}`.trim();
          
          // Use the Atlanta team's official logo as the primary image
          const logoUrl = team.logo;

          // Determine the streaming service based on the league
          const services = team.league === 'MLS' 
            ? [{ name: 'Apple TV (MLS Season Pass)', url: 'https://tv.apple.com/channel/tvs.sbd.7000' }]
            : [{ name: 'DirecTV', url: `https://www.directv.com/search?q=${encodeURIComponent(searchQuery)}` }];
          
          return {
            id: `espn-${event.id}`,
            title,
            description: `${event.name || title}. Status: ${status}. Venue: ${competition.venue?.fullName || 'TBD'}`,
            year: event.date ? new Date(event.date).getFullYear().toString() : new Date().getFullYear().toString(),
            posterUrl: logoUrl,
            backdropUrl: logoUrl,
            type: 'live',
            startTime: event.date,
            status: isLive ? 'LIVE' : status,
            league: team.league as any,
            services
          } as MediaItem;
        }).filter((item: any) => item !== null);
      } catch (e) {
        console.error(`Failed to fetch ${team.name} schedule`, e);
        return [];
      }
    });

    const results = await Promise.all(fetchPromises);
    const allEvents = results.flat();

    // Sort by date
    return allEvents.sort((a, b) => new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime());
  } catch (error) {
    console.error("Failed to fetch live sports events:", error);
    return [];
  }
}
