import os
from pathlib import Path
import runpy
import signal
import tempfile
from unittest.mock import Mock, patch

from celery import shared_task
from django.core.exceptions import ImproperlyConfigured
from django.core.cache.backends.memcached import PyMemcacheCache
from django.test import SimpleTestCase, override_settings
from django.urls import get_script_prefix, set_script_prefix

from .celery import app


@shared_task
def runtime_test_task(value):
    return value.upper()


class RuntimeSettingsTests(SimpleTestCase):
    def configuration(self, environment=None, contents=''):
        with tempfile.TemporaryDirectory() as directory:
            env_file = Path(directory) / '.env'
            env_file.write_text(contents)
            values = {'DJANGO_ENV_FILE': str(env_file), **(environment or {})}
            with patch.dict(os.environ, values, clear=True):
                return runpy.run_path(str(Path(__file__).with_name('local_settings.py')))

    def test_dotenv_configures_postgresql_and_preserves_literal_passwords(self):
        config = self.configuration(contents=(
            'DJANGO_DEBUG=false\n'
            'DJANGO_SECRET_KEY=test-only-key\n'
            'DJANGO_ALLOWED_HOSTS=example.com,192.0.2.1\n'
            'DJANGO_DATABASE_NAME=prosango\n'
            'DJANGO_DATABASE_USER=app_user\n'
            'DJANGO_DATABASE_PASSWORD="literal-${UNCHANGED}-password"\n'
            'DJANGO_DATABASE_HOST=database.example\n'
            'DJANGO_DATABASE_PORT=5432\n'
        ))
        self.assertFalse(config['DEBUG'])
        self.assertEqual(config['ALLOWED_HOSTS'], ['example.com', '192.0.2.1'])
        database = config['DATABASES']['default']
        self.assertEqual(database['ENGINE'], 'django.db.backends.postgresql')
        self.assertEqual(database['NAME'], 'prosango')
        self.assertEqual(database['PASSWORD'], 'literal-${UNCHANGED}-password')

    def test_process_environment_wins_over_dotenv(self):
        config = self.configuration(
            {'DJANGO_DEBUG': 'true', 'DJANGO_SECRET_KEY': 'process-test-key'},
            'DJANGO_DEBUG=false\nDJANGO_SECRET_KEY=file-test-key\n',
        )
        self.assertTrue(config['DEBUG'])
        self.assertEqual(config['SECRET_KEY'], 'process-test-key')

    def test_unconfigured_development_keeps_base_sqlite_database(self):
        self.assertNotIn('DATABASES', self.configuration())

    def test_development_cors_allows_loopback_and_configured_frontend_origin(self):
        config = self.configuration({'RSBUILD_BASE_URL': 'http://192.0.2.10:3300/assets/'})
        self.assertEqual(config['CORS_ALLOWED_ORIGINS'], [
            'http://localhost:3000', 'http://127.0.0.1:3000', 'http://192.0.2.10:3300',
        ])
        self.assertFalse(config['CORS_ALLOW_CREDENTIALS'])
        self.assertEqual(config['CSRF_TRUSTED_ORIGINS'], [])

    def test_cors_defaults_do_not_override_explicit_configuration_or_production(self):
        for value, expected in [
            ('https://frontend.example', ['https://frontend.example']), ('', []),
        ]:
            with self.subTest(value=value):
                config = self.configuration({'DJANGO_CORS_ALLOWED_ORIGINS': value})
                self.assertEqual(config['CORS_ALLOWED_ORIGINS'], expected)
        config = self.configuration({
            'DJANGO_DEBUG': 'false', 'DJANGO_SECRET_KEY': 'test-only-key',
            'DJANGO_DATABASE_NAME': 'production-database',
            'RSBUILD_BASE_URL': 'https://frontend.example/assets/',
        })
        self.assertEqual(config['CORS_ALLOWED_ORIGINS'], [])

    def test_development_sqlite_broker_is_separate_from_djangos_database(self):
        for contents in ['', 'CELERY_BROKER_URL=\n']:
            with self.subTest(contents=contents):
                config = self.configuration(contents=contents)
                self.assertNotIn('DATABASES', config)
                self.assertTrue(config['CELERY_BROKER_URL'].startswith('sqla+sqlite:///'))
                self.assertTrue(config['CELERY_BROKER_URL'].endswith('/celery-broker.sqlite3'))

    def test_production_and_explicit_brokers_do_not_switch_to_sqlite(self):
        config = self.configuration({
            'DJANGO_DEBUG': 'false', 'DJANGO_SECRET_KEY': 'test-only-key',
            'DJANGO_DATABASE_NAME': 'production-database',
        })
        self.assertEqual(config['CELERY_BROKER_URL'], 'amqp://localhost')
        config = self.configuration({'CELERY_BROKER_URL': 'amqp://dev-broker/dev'})
        self.assertEqual(config['CELERY_BROKER_URL'], 'amqp://dev-broker/dev')

    def test_memcached_is_opt_in(self):
        for environment in [{}, {'DJANGO_MEMCACHED_LOCATION': ''}]:
            with self.subTest(environment=environment):
                self.assertNotIn('CACHES', self.configuration(environment))

    def test_django_mount_prefix_configures_reversed_urls(self):
        self.assertIsNone(self.configuration()['FORCE_SCRIPT_NAME'])
        config = self.configuration({'DJANGO_SCRIPT_NAME': '/django'})
        self.assertEqual(config['FORCE_SCRIPT_NAME'], '/django')

    def test_backend_locations_load_from_env_in_dev_and_production(self):
        self.assertEqual(self.configuration()['TS_BACKEND_URL'], '')
        self.assertEqual(self.configuration()['TS_WS_BACKEND_URL'], '')
        for debug, http_url, ws_url in [
            ('true', 'http://localhost:8001/', 'ws://localhost:8002/'),
            ('false', '/v1/', '/socket/'),
        ]:
            with self.subTest(debug=debug):
                config = self.configuration(contents=(
                    f'DJANGO_DEBUG={debug}\n'
                    'DJANGO_SECRET_KEY=test-only-key\n'
                    'DJANGO_DATABASE_NAME=test-only-database\n'
                    f'DJANGO_TS_BACKEND_URL={http_url}\n'
                    f'DJANGO_TS_WS_BACKEND_URL={ws_url}\n'
                ))
                self.assertEqual(config['TS_BACKEND_URL'], http_url)
                self.assertEqual(config['TS_WS_BACKEND_URL'], ws_url)

    def test_memcached_uses_distinct_deployment_namespaces(self):
        keys = []
        for prefix in ['prosango', 'prosango_staging']:
            config = self.configuration(contents=(
                'DJANGO_MEMCACHED_LOCATION=127.0.0.1:11211\n'
                f'DJANGO_CACHE_KEY_PREFIX={prefix}\n'
            ))
            backend = config['CACHES']['default']
            self.assertEqual(
                backend['BACKEND'], 'django.core.cache.backends.memcached.PyMemcacheCache',
            )
            cache = PyMemcacheCache(backend['LOCATION'], backend)
            keys.append(cache.make_key('same-key'))
        self.assertNotEqual(*keys)

    def test_production_requires_secret_and_database(self):
        for environment in [
            {'DJANGO_DEBUG': 'false'},
            {'DJANGO_DEBUG': 'false', 'DJANGO_SECRET_KEY': ''},
            {'DJANGO_DEBUG': 'false', 'DJANGO_SECRET_KEY': 'test-only-key'},
        ]:
            with self.subTest(environment=environment):
                with self.assertRaises(ImproperlyConfigured):
                    self.configuration(environment)

    def test_legacy_database_variables_still_work(self):
        config = self.configuration({
            'DATABASE_NAME': 'legacy.sqlite3',
            'DATABASE_ENGINE': 'django.db.backends.sqlite3',
        })
        self.assertEqual(config['DATABASES']['default']['ENGINE'], 'django.db.backends.sqlite3')
        self.assertEqual(config['DATABASES']['default']['NAME'], 'legacy.sqlite3')

    def test_persistent_files_and_proxy_configuration(self):
        config = self.configuration({
            'DJANGO_DEBUG': 'false',
            'DJANGO_SECRET_KEY': 'test-only-key',
            'DJANGO_DATABASE_NAME': 'prosango',
            'DJANGO_STATIC_ROOT': '/srv/prosango/static',
            'DJANGO_MEDIA_ROOT': '/srv/prosango/media',
            'DJANGO_TRUST_PROXY_HEADERS': 'true',
        })
        self.assertEqual(config['RSBUILD_MANIFEST'], Path('/srv/prosango/static/manifest.json'))
        self.assertEqual(config['MEDIA_ROOT'], '/srv/prosango/media')
        self.assertEqual(config['FILE_UPLOAD_PERMISSIONS'], 0o640)
        self.assertEqual(config['FILE_UPLOAD_DIRECTORY_PERMISSIONS'], 0o2750)
        self.assertEqual(config['SECURE_PROXY_SSL_HEADER'], ('HTTP_X_FORWARDED_PROTO', 'https'))


class DevelopmentCorsTests(SimpleTestCase):
    @override_settings(CORS_ALLOWED_ORIGINS=['http://localhost:3000', 'http://127.0.0.1:3000'])
    def test_port_3000_receives_cors_headers_on_real_responses(self):
        for origin in ['http://localhost:3000', 'http://127.0.0.1:3000']:
            with self.subTest(origin=origin):
                response = self.client.get('/admin/login/', HTTP_ORIGIN=origin)
                self.assertEqual(response['Access-Control-Allow-Origin'], origin)
        response = self.client.get('/admin/login/', HTTP_ORIGIN='http://localhost:3001')
        self.assertNotIn('Access-Control-Allow-Origin', response)

    @override_settings(CORS_ALLOWED_ORIGINS=['http://localhost:3000'])
    def test_frontend_preflight_allows_post_and_csrf_header(self):
        response = self.client.options(
            '/', HTTP_ORIGIN='http://localhost:3000',
            HTTP_ACCESS_CONTROL_REQUEST_METHOD='POST',
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS='content-type,x-csrftoken',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Access-Control-Allow-Origin'], 'http://localhost:3000')
        self.assertIn('POST', response['Access-Control-Allow-Methods'])
        self.assertIn('x-csrftoken', response['Access-Control-Allow-Headers'])


class CeleryIntegrationTests(SimpleTestCase):
    @override_settings(
        CELERY_TASK_ALWAYS_EAGER=True,
        CELERY_TASK_EAGER_PROPAGATES=True,
        CELERY_BROKER_URL='memory://',
    )
    def test_shared_task_uses_django_celery_configuration(self):
        self.assertTrue(app.conf.task_always_eager)
        result = runtime_test_task.delay('prosango')
        self.assertEqual(result.get(), 'PROSANGO')


class DjangoMountTests(SimpleTestCase):
    @override_settings(FORCE_SCRIPT_NAME='/django')
    def test_homepage_and_admin_links_respect_the_mount_prefix(self):
        prefix = get_script_prefix()
        self.addCleanup(set_script_prefix, prefix)
        set_script_prefix('/django/')
        response = self.client.get('/')
        self.assertContains(response, 'href="/django/"')
        self.assertContains(response, 'href="/django/admin/"')
        self.assertNotContains(response, 'href="/admin/"')
        response = self.client.get('/admin/login/')
        self.assertContains(response, 'action="/django/admin/login/"')

    def test_body_exposes_backend_urls_in_dev_prod_and_disabled_cases(self):
        for http_url, ws_url in [
            ('http://localhost:8001/', 'ws://localhost:8002/'),
            ('/api/', '/ws/'),
            ('', ''),
        ]:
            with self.subTest(http_url=http_url), override_settings(
                TS_BACKEND_URL=http_url, TS_WS_BACKEND_URL=ws_url,
            ):
                response = self.client.get('/')
                self.assertContains(
                    response,
                    f'<body data-ts-backend-url="{http_url}" data-ts-ws-backend-url="{ws_url}">',
                )


class FrontendReloadTests(SimpleTestCase):
    def configure_reload(self):
        return runpy.run_path(str(Path(__file__).resolve().parents[1] / 'manage.py'))['configure_frontend_reload']

    def test_dev_hup_touches_a_file_watched_by_the_django_autoreloader(self):
        with tempfile.TemporaryDirectory() as directory:
            trigger = Path(directory) / 'reload'
            with (
                patch.dict(os.environ, {'DJANGO_RELOAD_TRIGGER': str(trigger)}),
                patch('signal.signal') as install,
                patch('django.utils.autoreload.autoreload_started.connect') as connect,
            ):
                self.configure_reload()()
            self.assertTrue(trigger.exists())
            self.assertEqual(install.call_args.args[0], signal.SIGHUP)
            reloader = Mock(extra_files=set())
            connect.call_args.args[0](sender=reloader)
            self.assertIn(trigger, reloader.extra_files)
            trigger.unlink()
            install.call_args.args[1](signal.SIGHUP, None)
            self.assertTrue(trigger.exists())

    def test_normal_django_commands_do_not_install_a_hup_handler(self):
        with patch.dict(os.environ, {'DJANGO_RELOAD_TRIGGER': ''}), patch('signal.signal') as install:
            self.configure_reload()()
        install.assert_not_called()
