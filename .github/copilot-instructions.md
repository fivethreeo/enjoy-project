# Prosango repository instructions

## Setup and commands

- Bootstrap all four projects from the repository root with `python run.py setup`. It installs frontend and both TypeScript backend dependencies and creates `django-project/.venv` with the Python dependencies.
- Start Django, Rsbuild, the HTTP backend and the WebSocket backend together with `python run.py parallel`. They bind to `127.0.0.1` on ports 8000, 3000, 8001 and 8002 respectively. Configure them with `HOST`, `DJANGO_PORT`, `RSBUILD_PORT`, `TS_BACKEND_PORT` and `TS_WS_BACKEND_PORT` assignments; all four ports must differ and be between 1 and 65535. If the browser reaches the frontend through a different address, set `PUBLIC_HOST` as well—for example, `PUBLIC_HOST=192.168.1.2` for LAN HMR while binding to `0.0.0.0`. Do not pass shared `--host`, `--port`, or `--addrport` flags to `parallel`. Backend dev URLs use their own ports, without the production Nginx prefixes.
- `parallel` also starts a solo Celery worker using the same Django settings/database. Its default SQLite broker is `django-project/celery-broker.sqlite3`, separate from Django's `db.sqlite3`; explicit `CELERY_BROKER_URL` overrides it. Run `python run.py manage migrate` for a fresh dev database. No database/broker service or Beat is started. Restart the launcher for task-code changes; SQLite transport is development-only.
- Run launcher regression tests with `python -m unittest test_run`. Both TypeScript backends use `tsx watch` in parallel mode; Ctrl+C stops all five process trees.
- On Unix, `parallel` starts Django first and passes its stable autoreloader parent PID to Rsbuild as `DJANGO_PID`. Successful dev rebuilds send SIGHUP; `manage.py` touches the watched `DJANGO_RELOAD_TRIGGER` file to restart the serving child safely. Initial/failed builds do not signal it. No production or Celery signal handlers are changed. Test the hook with `node --test typescript-frontend/scripts/django-reload.test.mjs`.
- Run Django management commands through the project wrapper, for example `python run.py manage migrate` or `python run.py manage test`. To run one Django test, use its dotted label: `python run.py manage test package.tests.TestCase.test_method`.
- Work on just the backend with `python run.py py` (forwarding Django `runserver` arguments), or just the frontend with `python run.py ts`. Run arbitrary frontend npm commands through `python run.py npm <args>`.
- Frontend commands run from `typescript-frontend/`: `npm run dev`, `npm run build`, and `npm run preview`. `npm run build` is the frontend’s available production build/type-checking validation. There is currently no separate lint script or frontend test runner.

## Architecture

- Django (`django-project/prosango`) owns HTTP routing, the admin, configuration, database access, and the HTML shell. The root URL is a `TemplateView` for `templates/index.html`; the browser application mounts into that template’s `#root` element from `typescript-frontend/src/index.ts`.
- Rsbuild produces the browser assets and `typescript-frontend/dist/manifest.json`. The `{% rsbuild_entry 'index' %}` tag in the Django template reads that manifest and emits its CSS and deferred JavaScript URLs. New frontend entry points must be represented both in Rsbuild’s manifest and in the consuming Django template tag.
- In development, Rsbuild writes the manifest to disk and Django loads its URLs from `RSBUILD_BASE_URL` (normally `http://localhost:3000`). Therefore start the frontend server or build the frontend before rendering Django pages; otherwise the template tag raises a clear manifest error.
- In production, run the frontend build before Django static-file collection. `STATICFILES_DIRS` includes the frontend `dist` directory, `collectstatic` copies the manifest/assets to `STATIC_ROOT`, and production configuration reads the manifest from there.

## Repository conventions

- Runtime configuration is environment-based in `prosango/local_settings.py`. Use the `DJANGO_*` variables for debug mode, secret key, hosts, database, static root, and CORS settings rather than editing committed settings for deployments. A non-debug process requires `DJANGO_SECRET_KEY`.
- Development CORS is disabled by default. Django does not load `django-cors-headers` unless `DJANGO_CORS_ALLOWED_ORIGINS` is set; enable Rsbuild asset CORS with `RSBUILD_CORS_ORIGIN`. Set either or both explicitly as needed. `PUBLIC_HOST` drives `RSBUILD_BASE_URL` and the HMR WebSocket host.
- TypeScript uses native ESM/bundler resolution and treats unused locals and parameters as errors. Keep frontend source under `typescript-frontend/src`; the generated `dist` contents are build output.
