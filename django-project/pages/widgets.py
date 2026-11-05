import json
from pathlib import Path

from django.contrib.admin.widgets import ForeignKeyRawIdWidget
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.forms import Media
from django.forms import Textarea
from django.utils.html import format_html


def _editor_media():
    manifest_path = Path(settings.RSBUILD_MANIFEST).parent / 'editor' / 'editor-manifest.json'
    try:
        with manifest_path.open(encoding='utf-8') as manifest_file:
            initial = json.load(manifest_file)['entries']['editor']['initial']
    except (OSError, KeyError, json.JSONDecodeError) as error:
        raise ImproperlyConfigured(
            f'Unable to load the Rsbuild editor manifest at {manifest_path}.'
        ) from error

    base_url = settings.RSBUILD_BASE_URL.rstrip('/')

    def asset_url(path):
        if path.startswith(('http://', 'https://')):
            return path
        if base_url.startswith(('http://', 'https://')):
            return f'{base_url}{path}'
        if path.startswith(settings.STATIC_URL):
            return path
        return f'{base_url}{path}'

    return Media(
        css={'all': [asset_url(path) for path in initial.get('css', [])]},
        js=[asset_url(path) for path in initial.get('js', [])],
    )


class PageContentWidget(Textarea):
    def __init__(self, attrs=None):
        attrs = {
            **(attrs or {}),
            'class': 'page-content-widget',
            'data-prosemirror': '',
        }
        super().__init__(attrs)

    def with_media_endpoints(self, endpoints):
        """Return this widget configured by the admin, without hard-coded URLs."""
        self.attrs.update({
            f'data-filer-{name}-url': url
            for name, url in endpoints.items()
        })
        return self

    @property
    def media(self):
        return super().media + _editor_media()


class FilerImagePreviewWidget(ForeignKeyRawIdWidget):
    class Media:
        css = {
            'all': ('pages/filer_image_preview.css',),
        }
        js = ('pages/filer_image_preview.js',)

    def __init__(self, rel, admin_site, preview_url, attrs=None, using=None):
        super().__init__(rel, admin_site, attrs=attrs, using=using)
        self.preview_url = preview_url

    def render(self, name, value, attrs=None, renderer=None):
        input_html = super().render(name, value, attrs, renderer)
        return format_html(
            '<span class="filer-image-preview-widget" data-preview-url="{}">'
            '{}'
            '<button type="button" class="filer-image-preview-button">Preview image</button>'
            '<img alt="" width="120" height="80" hidden>'
            '</span>',
            self.preview_url,
            input_html,
        )
