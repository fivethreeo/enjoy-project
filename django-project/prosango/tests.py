import os
from pathlib import Path
import runpy
import tempfile
from unittest.mock import patch

from celery import shared_task
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, override_settings

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
