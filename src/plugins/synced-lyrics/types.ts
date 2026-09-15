import type { ProviderName } from './providers';
import type { SongInfo } from '@/providers/song-info';

export type SyncedLyricsFeatureConfig = {
  enabled: boolean;
  preferredProvider?: ProviderName;
  preciseTiming: boolean;
  showTimeCodes: boolean;
  defaultTextString: string | string[];
  showLyricsEvenIfInexact: boolean;
  lineEffect: LineEffect;
  romanization: boolean;
  convertChineseCharacter?:
    | 'simplifiedToTraditional'
    | 'traditionalToSimplified'
    | 'disabled';
};

// Temporary compatibility alias while the retained lyrics implementation is
// migrated away from inherited plugin terminology.
export type SyncedLyricsPluginConfig = SyncedLyricsFeatureConfig;

export type LineLyricsStatus = 'previous' | 'current' | 'upcoming';

export type LineWordTiming = {
  timeInMs: number;
  word: string;
};

export type LineLyrics = {
  time: string;
  timeInMs: number;
  duration: number;

  text: string;
  words?: LineWordTiming[];
  status: LineLyricsStatus;
};

export type LineEffect = 'fancy' | 'scale' | 'offset' | 'focus';

export interface LyricResult {
  title: string;
  artists: string[];

  lyrics?: string;
  lines?: LineLyrics[];
}

// prettier-ignore
export type SearchSongInfo = Pick<SongInfo, 'title' | 'alternativeTitle' | 'artist' | 'album' | 'songDuration' | 'videoId' | 'tags'>;

export interface LyricProvider {
  name: string;
  baseUrl: string;

  search(songInfo: SearchSongInfo): Promise<LyricResult | null>;
}
