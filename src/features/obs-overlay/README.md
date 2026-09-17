# OBS Overlay

143 Music exposes a local transparent now-playing page for OBS Browser Source.

## OBS setup

1. Keep 143 Music running.
2. In OBS, add **Browser** as a source.
3. Set URL to `http://127.0.0.1:14321/overlay`.
4. Use `720` × `220` as the initial Browser Source size.
5. Leave custom CSS empty. The page itself has a transparent background.

The overlay shows the current cover, title, artist, album, play/pause state, and a smooth progress bar. It disappears when no track is available.

In **Settings → Appearance → OBS overlay**, **Use accent color in OBS widget** can make the widget follow the current 143 Music accent color. The original purple widget theme remains the default.

Everything is served only on `127.0.0.1`; no now-playing data is uploaded anywhere.

## Recovery

The address stays on port `14321`. If another process temporarily occupies the
port, 143 Music retries it every two seconds instead of silently changing the URL.
A permanent conflict must be resolved by closing the other process using that port.

The page receives live events and falls back to a bounded `/state` request when
updates stop. It reconnects automatically after connection loss or an application
restart. Data older than 15 seconds is hidden until fresh updates arrive, rather
than showing a stale playing track indefinitely.

If OBS loaded the URL before 143 Music was running, it may have loaded a browser
error page instead of the widget. Start 143 Music and use **Refresh cache of current
page** in the Browser Source properties. The same one-time refresh loads updated
widget code after upgrading 143 Music. Enabling **Refresh browser source when scene
becomes active** also reloads the URL when returning to the scene.

For a blank source, check `/health` and `/state` in a browser. A healthy server with
an empty track means playback data is not available yet. With **Hide when paused**
enabled, the widget intentionally disappears after 30 seconds of paused playback.

Useful local endpoints:

- `/overlay` — OBS page.
- `/state` — current now-playing JSON.
- `/events` — live Server-Sent Events stream.
- `/health` — simple local health check.
