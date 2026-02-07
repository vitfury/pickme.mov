const TMDB_BASE = 'https://image.tmdb.org/t/p';

export type PosterSize = 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original';
export type BackdropSize = 'w300' | 'w780' | 'w1280' | 'original';
export type ProfileSize = 'w45' | 'w185' | 'h632' | 'original';
export type LogoSize = 'w45' | 'w92' | 'w154' | 'w185' | 'w300' | 'w500' | 'original';

export function tmdbPoster(path: string | null, size: PosterSize = 'w500'): string {
  if (!path) return '/poster-placeholder.svg';
  return `${TMDB_BASE}/${size}${path}`;
}

export function tmdbBackdrop(path: string | null, size: BackdropSize = 'w1280'): string {
  if (!path) return '/backdrop-placeholder.svg';
  return `${TMDB_BASE}/${size}${path}`;
}

export function tmdbProfile(path: string | null, size: ProfileSize = 'w185'): string {
  if (!path) return '/profile-placeholder.svg';
  return `${TMDB_BASE}/${size}${path}`;
}

export function tmdbLogo(path: string | null, size: LogoSize = 'w92'): string {
  if (!path) return '/logo-placeholder.svg';
  return `${TMDB_BASE}/${size}${path}`;
}
