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

Run Django, Rsbuild, both TypeScript backends and a Celery worker together with
`python run.py parallel`. The web services bind to `127.0.0.1` on
ports 8000, 3000, 8001 and 8002 respectively. `python run.py setup` installs
dependencies for all four projects. Override the host and ports, for example:

```sh
python run.py parallel HOST=0.0.0.0 DJANGO_PORT=8100 RSBUILD_PORT=3100 TS_BACKEND_PORT=8101 TS_WS_BACKEND_PORT=8102
```

Rsbuild watches and rebuilds frontend assets; both backends use `tsx watch` to
reload TypeScript and restart on source changes. Django's development server
reloads Python changes. Press Ctrl+C to stop all five, including their child
processes. If a dev runner exits, the launcher stops the other services and
exits with a failure status.

Dev endpoints use separate ports: Django at `http://127.0.0.1:8000/`, HTTP health
at `http://127.0.0.1:8001/healthz`, and WebSockets at `ws://127.0.0.1:8002/`.
The production Nginx `/api/` and `/ws/` prefixes are not applied in this mode.

The development worker uses a local SQLite broker at
`django-project/celery-broker.sqlite3`; PostgreSQL, RabbitMQ and containers are
not required. Django's application data stays in `django-project/db.sqlite3`
when `DJANGO_DATABASE_NAME` is empty. For a fresh development database, run
`python run.py manage migrate` before starting the stack.

The worker initializes the same Django settings and database as the web server,
so tasks can use the Django ORM for reads and writes. It runs a single-process
solo pool without Beat. Restart `parallel` after changing task definitions;
Celery does not automatically reload them.

SQLite messaging is development-only and does not provide RabbitMQ's event or
remote-control features. Concurrent application database writes can encounter
SQLite locking. Production keeps PostgreSQL/RabbitMQ. Explicit
`CELERY_BROKER_URL` values override the development default; a result backend
remains optional.

In parallel mode, Rsbuild writes development JavaScript assets to disk. When
it completes a successful rebuild, its dev hook sends SIGHUP to `DJANGO_PID`,
which the launcher sets after starting Django first. Django's dev-only signal
handler touches an autoreloader-watched file: the serving child restarts while
the parent PID remains stable. The first compilation and failed builds do not
signal Django. This Unix-only hook is disabled for standalone Rsbuild, Windows
and production builds; parallel mode does not support `--noreload`.

Changes to `assets/master_icons.svg` regenerate
`typescript-frontend/src/icons.ts` automatically; unchanged generated output
is not rewritten. Thus, a manual icon generation run restarts Django only when
Rsbuild emits a changed bundle.

The standalone editor playground remains available directly from Rsbuild at
`http://<PUBLIC_HOST>:<RSBUILD_PORT>/playground.html`. Its runtime and HMR
assets are served under `/playground/`, independently of the Django app and
editor environments.

All four ports must be different and between 1 and 65535. `HOST` controls where
all services listen; use
`PUBLIC_HOST` when it differs from the address opened in a browser. For
example, to bind on all interfaces while accessing the application from the
local network:

```sh
python run.py parallel HOST=0.0.0.0 PUBLIC_HOST=192.168.1.2
```

`PUBLIC_HOST` is used for Rsbuild asset URLs and the HMR WebSocket. In development,
Django permits CORS from `http://localhost:3000`, `http://127.0.0.1:3000` and the
configured `RSBUILD_BASE_URL` origin (including custom hosts/ports). Production
still requires explicit origins. `parallel` also sets `RSBUILD_CORS_ORIGIN` to
the Django origin derived from `PUBLIC_HOST` and `DJANGO_PORT`, allowing fonts
and other frontend assets to load from port 3000 into Django-served pages.
Override either direction when needed:

```sh
# Override the allowed origins for requests to Django.
python run.py parallel DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:3000

# Override the Django origin allowed to load Rsbuild assets.
python run.py parallel RSBUILD_CORS_ORIGIN=http://localhost:8000
```

An explicit empty `DJANGO_CORS_ALLOWED_ORIGINS` disables Django's dev defaults.
An explicit empty `RSBUILD_CORS_ORIGIN` disables the launcher's Rsbuild CORS default.
Cookie-authenticated cross-origin requests additionally need
`DJANGO_CORS_ALLOW_CREDENTIALS=true`, matching `DJANGO_CSRF_TRUSTED_ORIGINS` and
the normal CSRF token; CORS does not bypass CSRF protection. In parallel mode, use
the environment assignments instead of passing shared `--host`, `--port`, or
`--addrport` arguments. The TypeScript starters do not enable cross-origin HTTP
access automatically.

## Independent TypeScript backends

The repository has four sibling project directories:

```text
django-project/
typescript-frontend/
typescript-backend/
typescript-ws-backend/
```

`typescript-backend` is a Node.js HTTP starter serving JSON at `/` and
`/healthz`. `typescript-ws-backend` serves `/healthz` over HTTP and echoes text
and binary WebSocket messages at `/`. Both require Node 20 or newer and read
`HOST`, `PORT`, and `APP_NAME` from the environment. Defaults are localhost,
ports 8001/8002, and app name `prosango`.

Install and build locally from the repository root:

```sh
python run.py npm-backend ci
python run.py npm-backend run build
python run.py npm-ws-backend ci
python run.py npm-ws-backend run build
```

For development, use `npm-backend run dev` or `npm-ws-backend run dev` through
the wrapper. Append `HOST=127.0.0.1 PORT=8001 APP_NAME=prosango` assignments to
override the environment. Each directory also has its own `.env.example`;
after building, Node's `--env-file=.env` option can load a local file explicitly.
Run `python run.py npm-backend test` and `python run.py npm-ws-backend test` for
the service tests.

These are deliberately minimal starters, not authenticated application APIs.
Add authentication, WebSocket origin checks, and application-specific handlers
before using them for private data. The WebSocket starter limits messages to
1 MB and uses heartbeats to detect dead connections.

The Ansible code deployment consumes each selected backend's prebuilt `dist`
and lockfile. It installs production Node dependencies but never compiles
TypeScript or runs frontend builds on the server.

### Backend locations in Django pages

Django reads `DJANGO_TS_BACKEND_URL` and `DJANGO_TS_WS_BACKEND_URL` into
`TS_BACKEND_URL` and `TS_WS_BACKEND_URL`. Parallel dev automatically sets
browser-facing URLs using `PUBLIC_HOST` and the backend ports (by default
`http://127.0.0.1:8001/` and `ws://127.0.0.1:8002/`). Explicit environment or
command-line values override these defaults.

Deployment sets the enabled services' public gateway paths, such as `/api/`
and `/ws/`, even when their servers are elsewhere. Disabled services have empty
values; private upstream addresses are never advertised to the browser.

The homepage and published pages expose these on `<body>`:

```html
<body data-ts-backend-url="/api/" data-ts-ws-backend-url="/ws/">
```

JavaScript reads `document.body.dataset.tsBackendUrl` and
`document.body.dataset.tsWsBackendUrl`. Resolve relative locations against the
page URL; for WebSockets use `ws:` for HTTP pages and `wss:` for HTTPS pages.
This advertises endpoints only; it does not enable CORS or authentication.

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

Memcached is optional. Set `DJANGO_MEMCACHED_LOCATION=127.0.0.1:11211` to use
Django's `PyMemcacheCache` backend, with one-second connection/read timeouts.
Leave it empty to retain Django's local-memory cache. Set
`DJANGO_CACHE_KEY_PREFIX` to a distinct deployment name, such as `prosango` or
`prosango_staging`, when sharing a cache server. Code accesses it through
`django.core.cache.cache`; this does not automatically cache views or sessions.
Keep Memcached private and treat its data as disposable, not persistent storage.

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
