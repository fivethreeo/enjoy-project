# prosango-project

Prosango integrates a TypeScript ProseMirror editor with Django. Content is
managed through Django and django-admin, with django-filer providing image
attachments and previews. The editor supports fullscreen editing of Every
Layout components.

The Django admin Page editor also provides **Insert image** and **Insert video**
actions backed by django-filer. Its admin-only picker uses the PageAdmin
`filer-media/`, `filer-media/folders/`, and `filer-media/upload/` endpoints;
the standalone Every Layout playground deliberately has no filer dependency.

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

## Runtime configuration and production

Copy `django-project/.env.example` to `django-project/.env` for local settings.
Alternatively set `DJANGO_ENV_FILE` to a protected file outside the checkout.
Existing process environment variables take precedence over `.env`; values are
not interpolated, so credentials containing `${...}` are preserved literally.
Do not commit `.env` files or production credentials.

Development keeps SQLite unless a database name is configured. Production
(`DJANGO_DEBUG=false`) requires `DJANGO_SECRET_KEY` and
`DJANGO_DATABASE_NAME`. A configured database defaults to PostgreSQL; set
`DJANGO_DATABASE_USER`, `DJANGO_DATABASE_PASSWORD`, `DJANGO_DATABASE_HOST`,
and `DJANGO_DATABASE_PORT`. Legacy `DATABASE_*` names remain accepted, with
`DJANGO_DATABASE_*` taking precedence.

Set `DJANGO_STATIC_ROOT` and `DJANGO_MEDIA_ROOT` to persistent paths outside
the code checkout. Production upload permissions default to `0640` for files
and `2750` for directories, suitable for an app-owned directory shared with
Nginx through its group. Enable `DJANGO_TRUST_PROXY_HEADERS` only behind a
trusted proxy; secure-cookie settings can be enabled independently for HTTPS.

Celery uses `prosango` as its app and autodiscovers `tasks.py` in installed
Django apps. Configure `CELERY_BROKER_URL` with your RabbitMQ user/vhost and,
if needed, `CELERY_RESULT_BACKEND`:

```sh
cd django-project
DJANGO_ENV_FILE=/path/to/runtime.env .venv/bin/celery -A prosango worker --loglevel=INFO
DJANGO_ENV_FILE=/path/to/runtime.env .venv/bin/celery -A prosango beat --loglevel=INFO \
  --schedule=/path/to/persistent/celerybeat-schedule
```

Run only one Beat instance per application schedule. For production, use
Gunicorn (`prosango.wsgi:application`) and systemd rather than development
servers.

Build the frontend on your workstation before deployment. The matching
`ansible-home-cluster/deploy-app/deploy-code.yml` uploads this checkout's Django
source and prebuilt frontend output, writes Vault-backed settings, runs
PostgreSQL migrations and `collectstatic`, and manages Gunicorn/Celery.
It does not run the frontend build on the deployment host.
