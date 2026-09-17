import { jaroWinkler } from '@skyra/jaro-winkler';
import * as z from 'zod';

import { LRC } from '../parsers/lrc';
import { parseRichsync } from '../parsers/richsync';
import { netFetch } from '../renderer';

import type { LyricProvider, LyricResult, SearchSongInfo } from '../types';

const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s*[-–]\s*topic$/u, '')
    .replace(/\((?:official\s+)?(?:audio|video|lyrics?)\)/gu, '')
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

const versions = (value: string) =>
  [
    ...normalize(value).matchAll(
      /\b(live|remix|acoustic|instrumental|karaoke|sped up|slowed|nightcore|radio edit)\b/gu,
    ),
  ]
    .map((match) => match[0])
    .sort()
    .join('|');

const splitArtists = (value: string) =>
  value
    .split(/\s*(?:&|,|feat\.?|ft\.?)\s*/iu)
    .map(normalize)
    .filter(Boolean);

export class MusixMatch implements LyricProvider {
  name = 'MusixMatch';
  baseUrl = 'https://www.musixmatch.com/';

  private api: MusixMatchAPI | undefined;

  async search(info: SearchSongInfo): Promise<LyricResult | null> {
    // late-init the API, to avoid an electron IPC issue
    // an added benefit is that if it has an error during init, the user can hit the retry button
    this.api ??= await MusixMatchAPI.new();
    await this.api.reinit();

    const data = await this.api.query(Endpoint.getMacroSubtitles, {
      q_track: info.alternativeTitle || info.title,
      q_artist: info.artist,
      q_duration: info.songDuration.toString(),
      ...(info.album ? { q_album: info.album } : {}),
      namespace: 'lyrics_richsynched',
      subtitle_format: 'lrc',
    });

    const { macro_calls: macroCalls } = data.body;

    // prettier-ignore
    const getter = <T extends keyof typeof macroCalls>(key: T): typeof macroCalls[T]['message']['body'] => macroCalls[key].message.body;

    const track = getter('matcher.track.get')?.track;
    const lyrics = getter('track.lyrics.get')?.lyrics?.lyrics_body;
    const subtitle = getter('track.subtitles.get')?.subtitle_list?.[0];

    // either no track found, or musixmatch's algorithm returned "Coldplay - Paradise" for no reason whatsoever
    if (
      !track ||
      track.track_id === 115264642 ||
      track.instrumental === 1 ||
      !matchesTrack(track, info)
    )
      return null;

    if (track.has_richsync === 1 && track.commontrack_id) {
      try {
        const richsync = await this.api.query(Endpoint.getRichsync, {
          commontrack_id: String(track.commontrack_id),
        });
        const body = richsync.body.richsync?.richsync_body;
        if (body) {
          const lines = parseRichsync(body);
          if (lines.some((line) => line.words?.length)) {
            return {
              title: track.track_name,
              artists: [track.artist_name],
              lines,
            };
          }
        }
      } catch {
        // RichSync is an optional upgrade. Keep the existing line/plain fallback.
      }
    }

    return {
      title: track.track_name,
      artists: [track.artist_name],
      lines: subtitle
        ? LRC.parse(subtitle.subtitle.subtitle_body).lines.map((line) => ({
            ...line,
            status: 'upcoming' as const,
          }))
        : undefined,
      lyrics,
    };
  }
}

// API Implementation, based on https://github.com/Strvm/musicxmatch-api/blob/main/src/musicxmatch_api/main.py

const zBoolean = z.union([z.literal(0), z.literal(1)]);
const Track = z.object({
  track_id: z.number(),
  commontrack_id: z.number().optional(),
  track_name: z.string(),
  artist_name: z.string(),
  album_name: z.string().optional(),
  track_length: z.number().optional(),
  has_richsync: zBoolean.optional(),
  instrumental: zBoolean.optional(),
});

type TrackData = z.infer<typeof Track>;

const matchesTrack = (track: TrackData, info: SearchSongInfo) => {
  const titles = [info.title, info.alternativeTitle].filter(
    (title): title is string => Boolean(title?.trim()),
  );
  const titleScore = Math.max(
    0,
    ...titles.map((title) =>
      jaroWinkler(normalize(title), normalize(track.track_name)),
    ),
  );
  const expectedArtists = splitArtists(info.artist);
  const actualArtists = splitArtists(track.artist_name);
  const artistScore = Math.max(
    0,
    ...actualArtists.flatMap((artist) =>
      expectedArtists.map((expected) => jaroWinkler(expected, artist)),
    ),
  );
  const versionMatches = titles.some(
    (title) => versions(title) === versions(track.track_name),
  );
  const durationMatches =
    info.songDuration <= 0 ||
    typeof track.track_length !== 'number' ||
    Math.abs(track.track_length - info.songDuration) <= 4;

  return (
    titleScore >= 0.93 &&
    artistScore >= 0.9 &&
    versionMatches &&
    durationMatches
  );
};

const Lyrics = z.object({
  instrumental: zBoolean,
  lyrics_body: z.string(),
  lyrics_language: z.string(),
  lyrics_language_description: z.string(),
});

const Subtitle = z.object({
  subtitle_body: z.string(),
  subtitle_length: z.number(),
  subtitle_language: z.string(),
});

const Richsync = z.object({
  richsync_body: z.string(),
});

enum Endpoint {
  getMacroSubtitles = 'macro.subtitles.get',
  getRichsync = 'track.richsync.get',
  searchTrack = 'track.search',
}

type Query = {
  q?: string;
  q_track?: string;
  q_artist?: string;
  q_album?: string;
  q_duration?: string;
};

type Params = {
  [Endpoint.getMacroSubtitles]: Query & {
    namespace: 'lyrics_richsynched';
    subtitle_format: 'lrc';
  };
  [Endpoint.getRichsync]: {
    commontrack_id: string;
  };
  [Endpoint.searchTrack]: {
    q: string;
    f_has_lyrics: 'true' | 'false';
    page_size: string;
    page: string;
  };
};

const ResponseSchema = {
  [Endpoint.searchTrack]: z.object({
    track_list: z.array(z.object({ track: Track })),
  }),
  [Endpoint.getRichsync]: z.object({
    richsync: Richsync.optional(),
  }),
  [Endpoint.getMacroSubtitles]: z.object({
    macro_calls: z.object({
      'track.lyrics.get': z.object({
        message: z.object({
          body: z
            .object({ lyrics: Lyrics })
            .or(
              z
                .instanceof(Array)
                .describe('default response for 404 status')
                .transform(() => undefined)
                .or(z.string().transform(() => undefined)),
            )
            .optional(),
        }),
      }),
      'track.subtitles.get': z.object({
        message: z.object({
          body: z
            .object({
              subtitle_list: z.array(z.object({ subtitle: Subtitle })),
            })
            .or(
              z
                .instanceof(Array)
                .describe('default response for 404 status')
                .transform(() => undefined)
                .or(z.string().transform(() => undefined)),
            )
            .optional(),
        }),
      }),
      'matcher.track.get': z.object({
        message: z.object({
          body: z
            .object({ track: Track })
            .or(
              z
                .instanceof(Array)
                .describe('default response for 404 status')
                .transform(() => undefined)
                .or(z.string().transform(() => undefined)),
            )
            .optional(),
        }),
      }),
    }),
  }),
} as const;

class MusixMatchAPI {
  private initPromise: Promise<void>;
  private cookie = 'x-mxm-user-id=';
  private token: string | null = null;

  private constructor() {
    this.initPromise = this.init();
  }

  public static async new() {
    const api = new MusixMatchAPI();
    await api.initPromise;
    return api;
  }

  public async reinit(force = false) {
    const [{ status }] = await Promise.allSettled([this.initPromise]);
    if (force || status === 'rejected') {
      this.cookie = 'x-mxm-user-id=';
      this.token = null;
      localStorage.removeItem(this.key);
      this.initPromise = this.init();
      await this.initPromise;
    }
  }

  // god I love typescript generics, they're so useful
  public async query<
    T extends Endpoint,
    R = {
      header: { status_code: number };
      body: T extends keyof typeof ResponseSchema
        ? z.infer<(typeof ResponseSchema)[T]>
        : unknown;
    },
  >(
    endpoint: T,
    params: Params[T],
    retryUnauthorized = true,
  ): Promise<R> {
    await this.initPromise;
    if (!this.token) throw new Error('Token not initialized');

    const url = `${this.baseUrl}${endpoint}`;

    const clonedParams = new URLSearchParams(
      Object.assign(
        {
          app_id: this.app_id,
          format: 'json',
          usertoken: this.token,
        },
        <Record<string, string>>params,
      ),
    );

    const [, json, headers] = await netFetch(`${url}?${clonedParams}`, {
      headers: { Cookie: this.cookie },
    });

    const setCookie = Object.entries(headers).find(
      ([key]) => key.toLowerCase() === 'set-cookie',
    );
    if (setCookie) {
      this.cookie = setCookie[1];
    }

    const response = JSON.parse(json);
    // prettier-ignore
    if (
      response && typeof response === 'object' &&
      'message' in response && response.message && typeof response.message === 'object' &&
      'header' in response.message && response.message.header && typeof response.message.header === 'object' &&
      'status_code' in response.message.header && typeof response.message.header.status_code === 'number' &&
      response.message.header.status_code === 401 && retryUnauthorized
    ) {
      await this.reinit(true);
      return this.query(endpoint, params, false);
    }

    const parsed = z
      .object({
        message: z.object({ body: ResponseSchema[endpoint] }),
      })
      .safeParse(response);

    if (!parsed.success) {
      console.error('Malformed response', response, parsed.error);
      throw new Error('Failed to parse response from MusixMatch API');
    }

    return parsed.data.message as R;
  }

  private savedTokenSchema = z.union([
    z.object({
      token: z.literal(null),
      expires: z.number().optional(),
    }),
    z.object({
      token: z.string(),
      expires: z.number(),
    }),
  ]);

  private key = 'ytm:synced-lyrics:mxm:token';
  private async init() {
    const { token, expires } = this.savedTokenSchema.parse(
      JSON.parse(localStorage.getItem(this.key) ?? '{ "token": null }'),
    );
    if (token && expires > Date.now()) {
      this.token = token;
      return;
    }

    localStorage.removeItem(this.key);

    this.token = await this.getToken();
    if (!this.token) throw new Error('Failed to get token');

    localStorage.setItem(
      this.key,
      JSON.stringify({
        token: this.token,
        expires: Date.now() + 6 * 60 * 60 * 1000,
      }),
    );
  }

  private tokenSchema = z.object({
    message: z.object({
      body: z
        .object({
          user_token: z.string(),
        })
        .optional(),
    }),
  });
  private async getToken() {
    const endpoint = 'token.get';
    const params = new URLSearchParams({ app_id: this.app_id });
    const [, json, headers] = await netFetch(
      `${this.baseUrl}${endpoint}?${params}`,
      {
        headers: Object.assign({ Cookie: this.cookie }, this.headers),
      },
    );

    const setCookie = Object.entries(headers).find(
      ([key]) => key.toLowerCase() === 'set-cookie',
    );
    if (setCookie) {
      this.cookie = setCookie[1];
    }

    const {
      message: { body },
    } = this.tokenSchema.parse(JSON.parse(json));
    return body?.user_token ?? '';
  }

  private readonly baseUrl = 'https://apic-desktop.musixmatch.com/ws/1.1/';
  private readonly app_id = 'web-desktop-app-v1.0';
  private readonly headers = {
    Authority: 'apic-desktop.musixmatch.com',
  };
}
