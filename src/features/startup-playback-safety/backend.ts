import { createBackend } from '@/utils';

export default createBackend({
  start({ window, ipc }) {
    // Keep the entire WebContents silent from the moment the feature starts.
    // Renderer-side ad detection may not exist yet while YouTube is booting.
    window.webContents.setAudioMuted(true);

    ipc.removeHandler('startup-playback-safety:mute');
    ipc.removeHandler('startup-playback-safety:unmute');

    ipc.handle('startup-playback-safety:mute', () => {
      if (!window.isDestroyed()) window.webContents.setAudioMuted(true);
      return true;
    });

    ipc.handle('startup-playback-safety:unmute', () => {
      if (!window.isDestroyed()) window.webContents.setAudioMuted(false);
      return true;
    });
  },

  stop({ window, ipc }) {
    ipc.removeHandler('startup-playback-safety:mute');
    ipc.removeHandler('startup-playback-safety:unmute');
    if (!window.isDestroyed()) window.webContents.setAudioMuted(false);
  },
});
