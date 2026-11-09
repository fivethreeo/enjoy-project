# template-project

A starter with Django, an Rsbuild TypeScript frontend, HTTP and WebSocket
backends, and Celery. The frontend includes only Every Layout styling and
initialization, a JavaScript-availability marker, and an optional docs navigation
toggle. Django serves a minimal HTML shell with an empty `#root` element.

django-filer and easy-thumbnails remain available in Django admin. The icon
sources, generator, and automatic icon build are retained. The editor,
playground, Pages app, custom styles, fonts, and decorative images are removed.

## Development

Run the projects present in the checkout with `python run.py parallel`.
`python run.py setup` likewise installs dependencies only for existing project
directories. Remove any of the TypeScript project directories to omit that
component; removing `django-project/` omits both Django and Celery. Django and
its Celery worker always start together in parallel mode.

With all components present, the web services bind to `127.0.0.1` on
ports 8000, 3000, 8001 and 8002 respectively. Override the host and ports, for example:

```sh
python run.py parallel HOST=0.0.0.0 DJANGO_PORT=8100 RSBUILD_PORT=3100 TS_BACKEND_PORT=8101 TS_WS_BACKEND_PORT=8102
```

Rsbuild watches and rebuilds frontend assets; both backends use `tsx watch` to
reload TypeScript and restart on source changes. Django's development server
reloads Python changes. Press Ctrl+C to stop all running services, including their child
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
and production builds. Parallel mode requires Django's autoreloader only when
both Django and the frontend are present; Django without frontend accepts
`--noreload`.

Changes to `assets/master_icons.svg` regenerate
`typescript-frontend/src/icons.ts` automatically; unchanged generated output
is not rewritten. Thus, a manual icon generation run restarts Django only when
Rsbuild emits a changed bundle. Icon watching is skipped when the frontend,
master SVG, or generator is absent.

Ports for present components must be different and between 1 and 65535;
assignments for absent components are ignored. `HOST` controls where
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
the Django and HTTP TypeScript backend origins derived from `PUBLIC_HOST`,
`DJANGO_PORT`, and `TS_BACKEND_PORT`, allowing frontend assets to load from
port 3000 into pages served by either service.
Override either direction when needed:

```sh
# Override the allowed origins for requests to Django.
python run.py parallel DJANGO_CORS_ALLOWED_ORIGINS=http://localhost:3000

# Override the comma-separated origins allowed to load Rsbuild assets.
python run.py parallel RSBUILD_CORS_ORIGIN=http://localhost:8000,http://localhost:8001
```

An explicit empty `DJANGO_CORS_ALLOWED_ORIGINS` disables Django's dev defaults.
An explicit empty `RSBUILD_CORS_ORIGIN` disables the launcher's Rsbuild CORS default.
Cookie-authenticated cross-origin requests additionally need
`DJANGO_CORS_ALLOW_CREDENTIALS=true`, matching `DJANGO_CSRF_TRUSTED_ORIGINS` and
the normal CSRF token; CORS does not bypass CSRF protection. In parallel mode, use
the environment assignments instead of passing shared `--host`, `--port`, or
`--addrport` arguments. The TypeScript starters do not enable cross-origin HTTP
access automatically.

### Django without frontend

Removing `typescript-frontend/` automatically disables Django's frontend
integration. Its page and admin still work, and `collectstatic` still collects
Django/admin assets without needing a frontend build. Alternatively, set
`DJANGO_FRONTEND_ENABLED=false` to disable asset integration while keeping the
directory. When frontend integration is enabled, a missing manifest still
raises the usual build/dev-server error.

For code deployment, select Django without frontend explicitly:

```yaml
app_django_enabled: true
app_frontend_enabled: false
```

The Ansible code deployment pairs the Celery worker with Django; Beat remains
optional. Deployment component switches remain explicit rather than inferred
from deleted directories. Parallel mode leaves absent backends' generated URLs
empty; explicit URLs for externally hosted services still work.

## Standalone frontend HTML

Edit `typescript-frontend/src/index.html` for a page served without Django.
Rsbuild generates `dist/index.html` and inserts the built CSS and JavaScript
automatically; Django continues to use its own template.

For frontend deployment at `/template/` with assets at `/template/static/`, build
from the repository root with the matching asset prefix:

```sh
RSBUILD_ASSET_PREFIX=/template/static/ python3 run.py npm run build
```

In the Ansible application configuration:

```yaml
app_django_enabled: false
app_frontend_enabled: true
app_frontend_html_location: /template/
app_static_location: /template/static/
celery_enabled: false
celery_beat_enabled: false
```

HTML serving defaults to enabled when frontend is enabled without Django.
Set `app_frontend_html_enabled: false` for assets only, with HTML hosted
elsewhere. The page location defaults to `app_django_location`; this does not
enable Django. The standalone page has no automatic Django context or backend
URL data attributes, and unknown page paths return 404 rather than an SPA fallback.

To update only frontend on an existing application without restarting its
backends, use the Ansible code playbook with `app_frontend_only_update: true`
and the application's existing configuration. This also enables the built HTML
by default, while retaining nested Django admin, media, API and WebSocket routes.

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
ports 8001/8002, and app name `template`.

Install and build locally from the repository root:

```sh
python run.py npm-backend ci
python run.py npm-backend run build
python run.py npm-ws-backend ci
python run.py npm-ws-backend run build
```

For development, use `npm-backend run dev` or `npm-ws-backend run dev` through
the wrapper. Append `HOST=127.0.0.1 PORT=8001 APP_NAME=template` assignments to
override the environment. Each directory also has its own `.env.example`;
after building, Node's `--env-file=.env` option can load a local file explicitly.
Run `python run.py npm-backend test` and `python run.py npm-ws-backend test` for
the service tests.

Both starters optionally identify users through Django's internal
session-authentication endpoint. HTTP `/` and WebSocket upgrades also support
anonymous clients; `/healthz` remains public. The WebSocket starter limits messages to 1 MB, checks browser
Origin, and uses heartbeats to detect dead connections. Add application-specific
handlers and authorization before using them for private data.

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

The HTML shell exposes these on `<body>`:

```html
<body data-ts-backend-url="/api/" data-ts-ws-backend-url="/ws/">
```

JavaScript reads `document.body.dataset.tsBackendUrl` and
`document.body.dataset.tsWsBackendUrl`. Resolve relative locations against the
page URL; for WebSockets use `ws:` for HTTP pages and `wss:` for HTTPS pages.
This advertises endpoints only; it does not enable CORS or authentication.

### Internal session authentication

`GET /internal/auth/` validates a Django session for a trusted backend.
Set `DJANGO_INTERNAL_AUTH_TOKEN` to a server-only shared token. The caller
sends `Authorization: Bearer <token>` and the browser's Django session cookie.
Success returns `{"user_id": ...}`; invalid service credentials return 403,
an invalid session returns 401, and an unset token disables the endpoint with
503 and logs a startup warning. Responses must not be cached.

Both TypeScript backends call this endpoint; they do not decode or validate
sessions locally. Set the same `DJANGO_INTERNAL_AUTH_TOKEN` in the environment
of Django and both Node processes, and set their server-only
`DJANGO_INTERNAL_URL` to Django's internal base URL (include any gateway mount
prefix). A token in Django's `.env` alone is not passed to Node by the launcher.
Missing/invalid sessions, no token, an unreachable auth endpoint, or an
unusable response fall back to anonymous access (`userId: null`); calls time
out after three seconds. Only a valid Django response supplies a user ID.
Each Node backend warns once at startup if its auth token or internal Django
URL is missing, disables session authentication, and retains anonymous access.
If multiple Django apps share a browser origin, give each a distinct
`DJANGO_SESSION_COOKIE_NAME` and `DJANGO_CSRF_COOKIE_NAME`, with
`DJANGO_SESSION_COOKIE_PATH` and `DJANGO_CSRF_COOKIE_PATH` scoped to its mount.
Set the same session cookie name in both Node environments; only that named
cookie is forwarded to Django. Defaults remain `sessionid`, `csrftoken`, and `/`.
Use `DJANGO_STATIC_URL` and `DJANGO_MEDIA_URL` for namespaced public asset/media
paths, and set `RSBUILD_BASE_URL` to the public static prefix without its trailing
slash. Configure the gateway to serve these prefixes from the app's own roots.

`parallel` supplies the internal URL from its bind host and Django port,
using loopback for wildcard binds. It also supplies `WS_ALLOWED_ORIGINS` from
the public Django, HTTP backend, and Rsbuild origins. Explicit environment or
command-line values override these defaults. Standalone WS deployments must
configure an exact comma-separated Origin allowlist; absent or unlisted
origins are rejected. Only the session cookie is forwarded, not other browser
cookies or the browser's Authorization header.

Keep the auth route private at the gateway and use HTTPS between machines.
HTTP `/` requests and WS connections have a `userId` property, which is null
for anonymous clients. Require a non-null ID for user-specific operations
and subscription authorization; never trust a browser-supplied ID. WS identity
is checked at upgrade only; logout does not disconnect connections automatically. HTTP CORS is
not enabled by these starters; use a same-origin gateway or configure
credentialed CORS separately for cross-origin browser requests.

### Job records and bulk results

`template.models.Job` records a user, unique Celery task ID, and creation time.
Records are not created automatically: after submitting a task, save its ID
with `Job.objects.create(user=request.user, task_id=task.id)`. Run
`python run.py manage migrate` to create the table.

`GET /jobs/results/?page=1` returns only the logged-in user's jobs, newest
first, in pages of 25. Authenticate using the Django session cookie. The
response contains `count`, `page`, `pages`, and `results`; each result includes
the job ID, task ID, creation time, Celery status, and a JSON-compatible result
for successful tasks. Other statuses have a null result; exception details
and tracebacks are not returned.

Configure `CELERY_RESULT_BACKEND` to retrieve results, for example
`db+sqlite:///celery-results.sqlite3` for local development. Missing/unavailable
result storage returns 503 for nonempty pages. Unknown or expired task results
can appear as `PENDING`. The endpoint batches results into one HTTP response,
but looks up each task separately in the Celery backend.

### Internal WebSocket notifications

`POST /internal/notify/` on the WS backend accepts JSON such as
`{"user_id": 42, "event": "addition.finished", "result": 5}`.
Set `WS_INTERNAL_NOTIFY_TOKEN` in the WS process and trusted sender's
environment, and send it as `Authorization: Bearer <token>`. This token is
separate from Django's internal auth token; an empty value disables the route
with 503 and logs one warning when the WS backend starts. Keep the route private
at the gateway and use HTTPS between machines.

Bodies are limited to 64 KiB. Invalid JSON/notification fields return 400,
invalid credentials return 403, and oversized bodies return 413. Each open
connection with the matching Django-validated user ID receives
`{"event": "addition.finished", "result": 5}`. Other users and anonymous clients
do not receive it.

The response is `202 {"matched_connections": ...}`, including zero when the
user is offline. This counts matched sockets, not browser acknowledgements.
Notifications are not persisted or deduplicated; retries can deliver duplicates.

`template.tasks.notify(result, user_id, event='task.finished')` is a Celery
sender task. Configure `WS_INTERNAL_URL` as the private WS HTTP base URL,
for example `http://127.0.0.1:8002/`, and set the same
`WS_INTERNAL_NOTIFY_TOKEN` in Django/Celery and the WS process. `parallel`
supplies the private URL using the configured WS port; it does not generate
or copy a token from Django's `.env` into Node.

```python
from celery import chain
from template.tasks import notify

# work is your existing Celery task; its result becomes notify's first argument.
chain(work.s(), notify.s(request.user.pk, 'work.finished')).apply_async()
```

Only successful work triggers the notification. The sender returns the original
result and accepts HTTP 202 even when no sockets are connected. Network failures,
HTTP 429 and HTTP 5xx retry up to five times with exponential delays; redirects,
other HTTP failures and invalid/oversized payloads do not retry. Redirects and
environment proxies are disabled so private service credentials stay on the
configured destination. Missing URL/token disables delivery, returns the original
result, and logs a startup warning rather than warning for every task.

Ansible forwards this private URL and token to Django/Celery and the TS HTTP
backend when WS is enabled. These values are server-only and are not added to
the frontend or page data attributes. The HTTP starter does not send notifications
automatically.

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
`DJANGO_CACHE_KEY_PREFIX` to a distinct deployment name, such as `template` or
`template_staging`, when sharing a cache server. Code accesses it through
`django.core.cache.cache`; this does not automatically cache views or sessions.
Keep Memcached private and treat its data as disposable, not persistent storage.

Celery uses `template` as its app and autodiscovers `tasks.py` in installed
Django apps. Configure `CELERY_BROKER_URL` with your RabbitMQ user/vhost and,
if needed, `CELERY_RESULT_BACKEND`:

```sh
cd django-project
DJANGO_ENV_FILE=/path/to/runtime.env .venv/bin/celery -A template worker --loglevel=INFO
DJANGO_ENV_FILE=/path/to/runtime.env .venv/bin/celery -A template beat --loglevel=INFO \
  --schedule=/path/to/persistent/celerybeat-schedule
```

Run only one Beat instance per application schedule. For production, use
Gunicorn (`template.wsgi:application`) and systemd rather than development
servers.

Build the frontend on your workstation before deployment. The matching
`ansible-home-cluster/deploy-app/deploy-code.yml` uploads this checkout's Django
source and prebuilt frontend output, writes Vault-backed settings, runs
PostgreSQL migrations and `collectstatic`, and manages Gunicorn/Celery.
It does not run the frontend build on the deployment host.
