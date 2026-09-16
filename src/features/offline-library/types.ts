export type OfflineTrack = Readonly<{
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  bytes: number;
  provider: string;
  sourceId: string;
  addedAt: string;
}>;

export type OfflineLibrarySnapshot = Readonly<{
  tracks: readonly OfflineTrack[];
  totalBytes: number;
}>;

export type OfflineAcquireRequest = Readonly<{
  sourceId: string;
  title?: string;
  artist?: string;
  album?: string;
  artwork?: string;
}>;

export type OfflineAcquireResult = Readonly<{
  filePath: string;
  fileName: string;
  mimeType: string;
  bytes: number;
}>;

/**
 * Source adapters plug into the offline library without coupling storage to a
 * specific service. Providers must only acquire media the application is
 * permitted to store locally.
 */
export interface OfflineProvider {
  readonly id: string;
  readonly name: string;
  canAcquire(request: OfflineAcquireRequest): boolean;
  acquire(request: OfflineAcquireRequest): Promise<OfflineAcquireResult>;
}
