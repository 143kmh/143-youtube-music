# OBS Overlay

143 Music exposes a local transparent now-playing page for OBS Browser Source.

## OBS setup

1. Keep 143 Music running.
2. In OBS, add **Browser** as a source.
3. Set URL to `http://127.0.0.1:14321/overlay`.
4. Use `520` × `140` as the initial Browser Source size.
5. Leave custom CSS empty. The page itself has a transparent background.

The overlay shows the current cover, title, artist, album, play/pause state, and a smooth progress bar. It disappears when no track is available.

Everything is served only on `127.0.0.1`; no now-playing data is uploaded anywhere.

Useful local endpoints:

- `/overlay` — OBS page.
- `/state` — current now-playing JSON.
- `/events` — live Server-Sent Events stream.
- `/health` — simple local health check.
