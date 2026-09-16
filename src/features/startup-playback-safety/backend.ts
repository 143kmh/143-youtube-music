import { createBackend } from '@/utils';

export default createBackend({
  start({ ipc }) {
    // Never mute the whole WebContents. On some fresh/release profiles the
    // renderer-side player-ready callback can arrive late or be missed, leaving
    // Electron globally muted forever. Ad muting is handled on the actual player.
    ipc.removeHandler('startup-playback-safety:mute');
    ipc.removeHandler('startup-playback-safety:unmute');

    ipc.handle('startup-playback-safety:mute', () => true);
    ipc.handle('startup-playback-safety:unmute', () => true);
  },

  stop({ ipc }) {
    ipc.removeHandler('startup-playback-safety:mute');
    ipc.removeHandler('startup-playback-safety:unmute');
  },
});
