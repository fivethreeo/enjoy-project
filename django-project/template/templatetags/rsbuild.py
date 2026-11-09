import json

from django import template
from django.conf import settings
from django.utils.html import format_html, format_html_join

register = template.Library()


def _load_manifest():
    with open(settings.RSBUILD_MANIFEST, encoding='utf-8') as f:
        return json.load(f)


def _asset_url(base, path):
    if path.startswith(('http://', 'https://')):
        return path
    return f'{base}{path}'


@register.simple_tag
def rsbuild_entry(name='index'):
    """Render CSS and JS tags for an Rsbuild entry, read from manifest.json.

    The manifest is used in dev as well as in production; only the base URL
    differs (RSBUILD_BASE_URL points at the dev server in dev).
    """
    try:
        initial = _load_manifest()['entries'][name]['initial']
    except (OSError, KeyError) as e:
        raise template.TemplateSyntaxError(
            f'Rsbuild manifest {settings.RSBUILD_MANIFEST} has no entry {name!r}; '
            'run the typescript-frontend dev server or build first'
        ) from e
    base = settings.RSBUILD_BASE_URL.rstrip('/')
    css = format_html_join(
        '', '<link rel="stylesheet" href="{}">', ((_asset_url(base, p),) for p in initial.get('css', []))
    )
    js = format_html_join(
        '', '<script defer src="{}"></script>', ((_asset_url(base, p),) for p in initial.get('js', []))
    )
    return format_html('{}{}', css, js)
