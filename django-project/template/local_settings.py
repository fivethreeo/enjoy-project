"""Twelve-factor configuration: values are read from environment variables."""
import os
from pathlib import Path
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv


load_dotenv(
    os.environ.get('DJANGO_ENV_FILE', Path(__file__).resolve().parent.parent / '.env'),
    override=False,
    interpolate=False,
)


def env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ('1', 'true', 'yes', 'on')


def env_list(name, default=''):
    return [v.strip() for v in os.environ.get(name, default).split(',') if v.strip()]


DEBUG = env_bool('DJANGO_DEBUG', True)
if DEBUG:
    SECURE_CROSS_ORIGIN_OPENER_POLICY = None

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured('DJANGO_SECRET_KEY must be set when DEBUG is off')
    SECRET_KEY = 'django-insecure-dev-only-key'

ALLOWED_HOSTS = env_list('DJANGO_ALLOWED_HOSTS', '*' if DEBUG else '')

_database_name = os.environ.get('DJANGO_DATABASE_NAME', os.environ.get('DATABASE_NAME'))
if _database_name:
    DATABASES = {
        'default': {
            'ENGINE': os.environ.get(
                'DJANGO_DATABASE_ENGINE',
                os.environ.get('DATABASE_ENGINE', 'django.db.backends.postgresql'),
            ),
            'NAME': _database_name,
            'USER': os.environ.get('DJANGO_DATABASE_USER', os.environ.get('DATABASE_USER', '')),
            'PASSWORD': os.environ.get(
                'DJANGO_DATABASE_PASSWORD', os.environ.get('DATABASE_PASSWORD', ''),
            ),
            'HOST': os.environ.get('DJANGO_DATABASE_HOST', os.environ.get('DATABASE_HOST', '')),
            'PORT': os.environ.get('DJANGO_DATABASE_PORT', os.environ.get('DATABASE_PORT', '')),
            'CONN_MAX_AGE': int(os.environ.get('DJANGO_DATABASE_CONN_MAX_AGE', '60')),
        }
    }
elif not DEBUG:
    raise ImproperlyConfigured('DJANGO_DATABASE_NAME must be set when DEBUG is off')

# In dev, assets are served by the Rsbuild dev server; the manifest is still used.
FRONTEND_ENABLED = env_bool(
    'DJANGO_FRONTEND_ENABLED',
    (Path(__file__).resolve().parent.parent.parent / 'typescript-frontend').is_dir(),
)
RSBUILD_BASE_URL = os.environ.get(
    'RSBUILD_BASE_URL', 'http://localhost:3000' if DEBUG else '/static'
)
_cors_defaults = ['http://localhost:3000', 'http://127.0.0.1:3000'] if DEBUG and FRONTEND_ENABLED else []
if DEBUG and FRONTEND_ENABLED:
    _frontend_url = urlsplit(RSBUILD_BASE_URL)
    if _frontend_url.scheme in ('http', 'https') and _frontend_url.netloc:
        _frontend_origin = f'{_frontend_url.scheme}://{_frontend_url.netloc}'
        if _frontend_origin not in _cors_defaults:
            _cors_defaults.append(_frontend_origin)
CORS_ALLOWED_ORIGINS = env_list('DJANGO_CORS_ALLOWED_ORIGINS', ','.join(_cors_defaults))
CORS_ALLOW_CREDENTIALS = env_bool('DJANGO_CORS_ALLOW_CREDENTIALS', False)
CSRF_TRUSTED_ORIGINS = env_list('DJANGO_CSRF_TRUSTED_ORIGINS')
SECURE_PROXY_SSL_HEADER = (
    ('HTTP_X_FORWARDED_PROTO', 'https')
    if env_bool('DJANGO_TRUST_PROXY_HEADERS')
    else None
)
SESSION_COOKIE_SECURE = env_bool('DJANGO_SESSION_COOKIE_SECURE')
CSRF_COOKIE_SECURE = env_bool('DJANGO_CSRF_COOKIE_SECURE')
SESSION_COOKIE_NAME = os.environ.get('DJANGO_SESSION_COOKIE_NAME', 'sessionid')
CSRF_COOKIE_NAME = os.environ.get('DJANGO_CSRF_COOKIE_NAME', 'csrftoken')
SESSION_COOKIE_PATH = os.environ.get('DJANGO_SESSION_COOKIE_PATH', '/')
CSRF_COOKIE_PATH = os.environ.get('DJANGO_CSRF_COOKIE_PATH', '/')
STATIC_URL = os.environ.get('DJANGO_STATIC_URL', '/static/')
MEDIA_URL = os.environ.get('DJANGO_MEDIA_URL', '/media/')
TIME_ZONE = os.environ.get('DJANGO_TIME_ZONE', 'UTC')
FORCE_SCRIPT_NAME = os.environ.get('DJANGO_SCRIPT_NAME') or None
TS_BACKEND_URL = os.environ.get('DJANGO_TS_BACKEND_URL', '').strip()
TS_WS_BACKEND_URL = os.environ.get('DJANGO_TS_WS_BACKEND_URL', '').strip()
INTERNAL_AUTH_TOKEN = os.environ.get('DJANGO_INTERNAL_AUTH_TOKEN', '')
WS_INTERNAL_URL = os.environ.get('WS_INTERNAL_URL', '').strip()
WS_INTERNAL_NOTIFY_TOKEN = os.environ.get('WS_INTERNAL_NOTIFY_TOKEN', '')

_memcached_location = os.environ.get('DJANGO_MEMCACHED_LOCATION', '').strip()
if _memcached_location:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.memcached.PyMemcacheCache',
            'LOCATION': _memcached_location,
            'KEY_PREFIX': os.environ.get('DJANGO_CACHE_KEY_PREFIX') or 'template',
            'OPTIONS': {'connect_timeout': 1, 'timeout': 1},
        }
    }

CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL') or (
    f"sqla+sqlite:///{(Path(__file__).resolve().parent.parent / 'celery-broker.sqlite3').as_posix()}"
    if DEBUG else 'amqp://localhost'
)
CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND') or None
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE

# Production reads the manifest collected into STATIC_ROOT.
_static_root = os.environ.get('DJANGO_STATIC_ROOT')
if _static_root:
    STATIC_ROOT = _static_root
_media_root = os.environ.get('DJANGO_MEDIA_ROOT')
if _media_root:
    MEDIA_ROOT = _media_root
if not DEBUG or 'DJANGO_FILE_UPLOAD_PERMISSIONS' in os.environ:
    FILE_UPLOAD_PERMISSIONS = int(os.environ.get('DJANGO_FILE_UPLOAD_PERMISSIONS', '0o640'), 0)
if not DEBUG or 'DJANGO_FILE_UPLOAD_DIRECTORY_PERMISSIONS' in os.environ:
    FILE_UPLOAD_DIRECTORY_PERMISSIONS = int(
        os.environ.get('DJANGO_FILE_UPLOAD_DIRECTORY_PERMISSIONS', '0o2750'), 0,
    )
if not DEBUG:
    static_root = Path(
        os.environ.get(
            'DJANGO_STATIC_ROOT',
            Path(__file__).resolve().parent.parent / 'staticfiles',
        )
    )
    RSBUILD_MANIFEST = os.environ.get('RSBUILD_MANIFEST') or static_root / 'manifest.json'
