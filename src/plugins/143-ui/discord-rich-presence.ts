import { Client as DiscordClient } from '@xhayper/discord-rpc';

import type { SetActivity } from '@xhayper/discord-rpc/dist/structures/ClientUser';

export type DiscordPresenceSettings = Readonly<{
  enabled: boolean;
  applicationId: string;
  autoReconnect: boolean;
  showRemainingTime: boolean;
  clearOnPause: boolean;
  pauseTimeoutMinutes: number;
  playButton: boolean;
}>;

export type DiscordPresenceTrack = Readonly<{
  id: string;
  title: string;
  artist: string;
  artwork: string;
  playing: boolean;
  elapsed: number;
  duration: number;
}>;

export type DiscordPresenceStatus =
  | 'disabled'
  | 'needs-application-id'
  | 'connecting'
  | 'connected'
  | 'disconnected';

const RETRY_DELAY_MS = 5000;
const DISCORD_TEXT_LIMIT = 128;

const cleanText = (value: string, fallback: string) => {
  const normalized = value.replaceAll(/\s+/g, ' ').trim() || fallback;
  const clipped = normalized.slice(0, DISCORD_TEXT_LIMIT);
  return clipped.length === 1 ? `${clipped}\u200b` : clipped;
};

const normalizeSettings = (
  value: DiscordPresenceSettings,
): DiscordPresenceSettings => ({
  enabled: Boolean(value.enabled),
  applicationId: value.applicationId.trim(),
  autoReconnect: Boolean(value.autoReconnect),
  showRemainingTime: Boolean(value.showRemainingTime),
  clearOnPause: Boolean(value.clearOnPause),
  pauseTimeoutMinutes: Math.max(
    0,
    Math.min(
      1440,
      Number.isFinite(value.pauseTimeoutMinutes) ? value.pauseTimeoutMinutes : 10,
    ),
  ),
  playButton: Boolean(value.playButton),
});

const validApplicationId = (value: string) => /^\d{15,22}$/u.test(value);

export class DiscordRichPresence {
  private rpc: DiscordClient | null = null;
  private ready = false;
  private connecting = false;
  private clientId = '';
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private clearTimer: ReturnType<typeof setTimeout> | null = null;
  private settings: DiscordPresenceSettings = {
    enabled: false,
    applicationId: '',
    autoReconnect: true,
    showRemainingTime: true,
    clearOnPause: true,
    pauseTimeoutMinutes: 10,
    playButton: true,
  };
  private lastTrack: DiscordPresenceTrack | null = null;
  private pauseStartedAt = 0;
  private status: DiscordPresenceStatus = 'disabled';
  private disposed = false;

  getStatus(): DiscordPresenceStatus {
    return this.status;
  }

  applySettings(value: DiscordPresenceSettings) {
    const next = normalizeSettings(value);
    const idChanged = next.applicationId !== this.clientId;
    this.settings = next;

    if (!next.enabled) {
      this.status = 'disabled';
      this.disconnect();
      return;
    }

    if (!validApplicationId(next.applicationId)) {
      this.status = 'needs-application-id';
      this.disconnect();
      return;
    }

    if (idChanged || !this.rpc) this.createClient(next.applicationId);
    if (!this.ready) this.connect();
    else if (this.lastTrack) this.updateActivity(this.lastTrack);
  }

  updateTrack(track: DiscordPresenceTrack) {
    if (this.disposed) return;
    const previous = this.lastTrack;
    this.lastTrack = {
      ...track,
      elapsed: Math.max(0, Number.isFinite(track.elapsed) ? track.elapsed : 0),
      duration: Math.max(0, Number.isFinite(track.duration) ? track.duration : 0),
    };

    if (!this.lastTrack.id || !this.lastTrack.title) {
      this.pauseStartedAt = 0;
      this.clearPauseTimer();
      this.clearActivity();
      return;
    }

    if (this.lastTrack.playing) {
      this.pauseStartedAt = 0;
      this.clearPauseTimer();
    } else if (
      previous?.playing !== false ||
      previous.id !== this.lastTrack.id ||
      this.pauseStartedAt === 0
    ) {
      this.pauseStartedAt = Date.now();
    }

    if (
      !this.settings.enabled ||
      !validApplicationId(this.settings.applicationId)
    )
      return;

    if (!this.ready) {
      this.connect();
      return;
    }

    this.updateActivity(this.lastTrack);
  }

  dispose() {
    this.disposed = true;
    this.clearRetryTimer();
    this.clearPauseTimer();
    this.clearActivity();
    this.destroyClient();
  }

  private createClient(clientId: string) {
    this.destroyClient();
    this.clientId = clientId;
    this.ready = false;
    this.connecting = false;

    const rpc = new DiscordClient({ clientId });
    this.rpc = rpc;

    rpc.on('ready', () => {
      if (this.disposed || this.rpc !== rpc) return;
      this.ready = true;
      this.connecting = false;
      this.status = 'connected';
      this.clearRetryTimer();
      if (this.lastTrack) this.updateActivity(this.lastTrack);
    });

    rpc.on('disconnected', () => {
      if (this.disposed || this.rpc !== rpc) return;
      this.ready = false;
      this.connecting = false;
      this.status = 'disconnected';
      this.scheduleReconnect();
    });
  }

  private connect() {
    if (
      this.disposed ||
      !this.settings.enabled ||
      !validApplicationId(this.settings.applicationId) ||
      this.ready ||
      this.connecting
    )
      return;

    if (!this.rpc || this.clientId !== this.settings.applicationId)
      this.createClient(this.settings.applicationId);
    const rpc = this.rpc;
    if (!rpc) return;

    this.connecting = true;
    this.status = 'connecting';
    this.clearRetryTimer();
    void rpc.login().catch(() => {
      if (this.disposed || this.rpc !== rpc) return;
      this.ready = false;
      this.connecting = false;
      this.status = 'disconnected';
      this.destroyClient();
      if (
        this.settings.enabled &&
        validApplicationId(this.settings.applicationId)
      )
        this.createClient(this.settings.applicationId);
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect() {
    this.clearRetryTimer();
    if (
      this.disposed ||
      !this.settings.enabled ||
      !this.settings.autoReconnect ||
      !validApplicationId(this.settings.applicationId)
    )
      return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, RETRY_DELAY_MS);
  }

  private updateActivity(track: DiscordPresenceTrack) {
    if (!this.rpc || !this.ready || !this.rpc.isConnected) return;

    if (!track.playing && this.settings.clearOnPause) {
      const timeoutMs = this.settings.pauseTimeoutMinutes * 60_000;
      if (timeoutMs <= 0) {
        this.clearActivity();
        return;
      }
      this.schedulePauseClear(timeoutMs);
    } else {
      this.clearPauseTimer();
    }

    const activity: SetActivity = {
      type: 2 as SetActivity['type'],
      details: cleanText(track.title, 'Unknown track'),
      state: cleanText(track.artist, 'Unknown artist'),
      largeImageKey: track.artwork || undefined,
      largeImageText: track.playing
        ? 'YouTube Music'
        : 'Paused · YouTube Music',
    };

    if (this.settings.playButton && track.id) {
      activity.buttons = [
        {
          label: 'Play on YouTube Music',
          url: `https://music.youtube.com/watch?v=${encodeURIComponent(track.id)}`,
        },
      ];
    }

    if (
      track.playing &&
      this.settings.showRemainingTime &&
      track.duration > 0
    ) {
      const elapsed = Math.min(track.duration, Math.max(0, track.elapsed));
      const start = Date.now() - elapsed * 1000;
      activity.startTimestamp = Math.floor(start / 1000);
      activity.endTimestamp = Math.floor((start + track.duration * 1000) / 1000);
    }

    void this.rpc.user?.setActivity(activity).catch((error) => {
      console.warn('[143 Music] Discord presence update failed', error);
    });
  }

  private schedulePauseClear(timeoutMs: number) {
    if (this.clearTimer) return;
    const started = this.pauseStartedAt || Date.now();
    const remaining = Math.max(0, timeoutMs - (Date.now() - started));
    if (remaining === 0) {
      this.clearActivity();
      return;
    }
    this.clearTimer = setTimeout(() => {
      this.clearTimer = null;
      if (this.lastTrack?.playing === false) this.clearActivity();
    }, remaining);
  }

  private clearActivity() {
    if (this.rpc?.isConnected && this.ready)
      void this.rpc.user?.clearActivity().catch(() => {});
  }

  private disconnect() {
    this.clearRetryTimer();
    this.clearPauseTimer();
    this.clearActivity();
    this.destroyClient();
  }

  private destroyClient() {
    const rpc = this.rpc;
    this.rpc = null;
    this.ready = false;
    this.connecting = false;
    if (!rpc) return;
    try {
      rpc.removeAllListeners();
      rpc.destroy();
    } catch {
      // Discord may already have closed the local IPC pipe.
    }
  }

  private clearRetryTimer() {
    if (!this.retryTimer) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private clearPauseTimer() {
    if (!this.clearTimer) return;
    clearTimeout(this.clearTimer);
    this.clearTimer = null;
  }
}
