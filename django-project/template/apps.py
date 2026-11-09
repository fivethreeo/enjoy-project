import logging

from django.apps import AppConfig
from django.conf import settings


logger = logging.getLogger(__name__)


class TemplateConfig(AppConfig):
    name = 'template'

    def ready(self):
        if not settings.INTERNAL_AUTH_TOKEN:
            logger.warning(
                'DJANGO_INTERNAL_AUTH_TOKEN is not set; internal session authentication '
                'is disabled (/internal/auth/ returns 503).'
            )
        if not settings.WS_INTERNAL_URL or not settings.WS_INTERNAL_NOTIFY_TOKEN:
            logger.warning(
                'WS_INTERNAL_URL or WS_INTERNAL_NOTIFY_TOKEN is not set; '
                'Celery WebSocket notifications are disabled.'
            )
