import { app, dialog, shell } from 'electron';
import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { extname, basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { OfflineLibrarySnapshot, OfflineTrack } from './types';

const AUDIO_EXTENSIONS = new Set([
  '.aac',
  '.flac',
  '.m4a',
  '.mp3',
  '.oga',
  '.ogg',
  '.opus',
  '.wav',
  '.webm',
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg; codecs=opus',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
};

type Manifest = {
  version: 1;
  tracks: OfflineTrack[];
};

const root = () => join(app.getPath('userData'), '143-music-offline');
const tracksDir = () => join(root(), 'tracks');
const manifestPath = () => join(root(), 'library.json');

const ensureStorage = async () => {
  await mkdir(tracksDir(), { recursive: true });
};

const readManifest = async (): Promise<Manifest> => {
  await ensureStorage();
  try {
    const parsed = JSON.parse(await readFile(manifestPath(), 'utf8')) as Partial<Manifest>;
    return {
      version: 1,
      tracks: Array.isArray(parsed.tracks) ? (parsed.tracks as OfflineTrack[]) : [],
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    return { version: 1, tracks: [] };
  }
};

const writeManifest = async (manifest: Manifest) => {
  await ensureStorage();
  const target = manifestPath();
  const temporary = `${target}.tmp`;
  await writeFile(temporary, JSON.stringify(manifest, null, 2), 'utf8');
  await rename(temporary, target);
};

export const getOfflineLibrary = async (): Promise<OfflineLibrarySnapshot> => {
  const manifest = await readManifest();
  return {
    tracks: manifest.tracks,
    totalBytes: manifest.tracks.reduce((sum, track) => sum + track.bytes, 0),
  };
};

export const importLocalAudio = async (): Promise<OfflineLibrarySnapshot> => {
  const result = await dialog.showOpenDialog({
    title: 'Import audio to 143 Music',
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Audio',
        extensions: [...AUDIO_EXTENSIONS].map((extension) => extension.slice(1)),
      },
    ],
  });
  if (result.canceled || !result.filePaths.length) return getOfflineLibrary();

  const manifest = await readManifest();
  for (const sourcePath of result.filePaths) {
    const extension = extname(sourcePath).toLocaleLowerCase();
    if (!AUDIO_EXTENSIONS.has(extension)) continue;

    const info = await stat(sourcePath);
    if (!info.isFile()) continue;

    const id = randomUUID();
    const fileName = `${id}${extension}`;
    const destination = join(tracksDir(), fileName);
    await copyFile(sourcePath, destination);

    const title = basename(sourcePath, extension).trim() || 'Untitled';
    manifest.tracks.unshift({
      id,
      title,
      artist: '',
      album: '',
      artwork: '',
      fileName,
      filePath: destination,
      mimeType: MIME_BY_EXTENSION[extension] ?? 'application/octet-stream',
      bytes: info.size,
      provider: 'local-file',
      sourceId: sourcePath,
      addedAt: new Date().toISOString(),
    });
  }

  await writeManifest(manifest);
  return getOfflineLibrary();
};

export const removeOfflineTrack = async (id: string): Promise<OfflineLibrarySnapshot> => {
  const manifest = await readManifest();
  const target = manifest.tracks.find((track) => track.id === id);
  if (!target) return getOfflineLibrary();

  try {
    await unlink(target.filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  manifest.tracks = manifest.tracks.filter((track) => track.id !== id);
  await writeManifest(manifest);
  return getOfflineLibrary();
};

export const revealOfflineTrack = async (id: string) => {
  const manifest = await readManifest();
  const target = manifest.tracks.find((track) => track.id === id);
  if (!target) return false;
  shell.showItemInFolder(target.filePath);
  return true;
};
