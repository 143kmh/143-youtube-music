export const DISCORD_STATUS_MODE_OPTIONS = [
  { value: 'listening-143', label: 'Listening to 143 Music' },
  { value: 'listening-youtube', label: 'Listening to YouTube Music' },
  { value: 'listening-artist', label: 'Listening to artist' },
] as const;

export type DiscordStatusMode =
  (typeof DISCORD_STATUS_MODE_OPTIONS)[number]['value'];

export const isDiscordStatusMode = (
  value: unknown,
): value is DiscordStatusMode =>
  DISCORD_STATUS_MODE_OPTIONS.some((option) => option.value === value);
