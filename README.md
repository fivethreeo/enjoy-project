# prosango-project

Prosango integrates a TypeScript ProseMirror editor with Django. Content is
managed through Django and django-admin, with django-filer providing image
attachments and previews. The editor supports fullscreen editing of Every
Layout components.

The public application and the editing experience share an Every Layout
philosophy: compose small, configurable layout primitives instead of building
one-off page structures. This keeps authored content and the application UI
consistent while allowing each to use the same Box, Cover, Grid, With sidebar,
Stack, and related primitives.

## Development

Run the Django and Rsbuild development servers together with `python run.py parallel`.
They bind to `127.0.0.1` and use ports 8000 and 3000 respectively. Override the
host and ports with `HOST`, `DJANGO_PORT`, and `RSBUILD_PORT`, for example:

```sh
python run.py parallel HOST=0.0.0.0 DJANGO_PORT=8001 RSBUILD_PORT=3001
```

In parallel mode, Rsbuild writes development JavaScript assets to disk. When
it emits updated JavaScript, the launcher restarts Django so admin asset
manifests are reloaded. Changes to `assets/master_icons.svg` regenerate
`typescript-frontend/src/icons.ts` automatically; unchanged generated output
is not rewritten. Thus, a manual icon generation run restarts Django only when
Rsbuild emits a changed bundle.

The standalone editor playground remains available directly from Rsbuild at
`http://<PUBLIC_HOST>:<RSBUILD_PORT>/playground.html`. Its runtime and HMR
assets are served under `/playground/`, independently of the Django app and
editor environments.

The ports must be different. `HOST` controls where both servers listen; use
`PUBLIC_HOST` when it differs from the address opened in a browser. For
example, to bind on all interfaces while accessing the application from the
local network:

```sh
python run.py parallel HOST=0.0.0.0 PUBLIC_HOST=192.168.1.2
```

`PUBLIC_HOST` is used for Rsbuild asset URLs and the HMR WebSocket. CORS is
disabled by default in development. Enable it independently when needed:

```sh
# Permit requests to Django from an Rsbuild origin.
python run.py parallel DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:3000

# Permit Django-served pages to load Rsbuild assets cross-origin.
python run.py parallel RSBUILD_CORS_ORIGIN=http://localhost:8000
```

Set both variables when both directions require CORS. In parallel mode, use
these variables instead of passing shared `--host`, `--port`, or `--addrport`
arguments.
