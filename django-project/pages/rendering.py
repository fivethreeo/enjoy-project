import json
import re
from urllib.parse import urlparse

from django.utils.html import conditional_escape, format_html
from django.utils.safestring import mark_safe


_CLASS_NAME = re.compile(r'^[A-Za-z_][\w:-]*$')
_LAYOUT_CLASSES = {
    'box': 'box',
    'center': 'center',
    'cluster': 'cluster',
    'cover': 'cover',
    'frame': 'frame',
    'grid': 'grid',
    'reel': 'reel',
    'sidebar': 'with-sidebar',
    'stack': 'stack',
    'switcher': 'switcher',
}
_BASE_BLOCK_TAGS = {
    'div', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'main',
}


def _safe_url(value, *, media=False):
    if not isinstance(value, str):
        return ''
    parsed = urlparse(value)
    allowed_schemes = {'http', 'https'} if media else {'http', 'https', 'mailto'}
    if parsed.scheme and parsed.scheme not in allowed_schemes:
        return ''
    return value


def _classes(attrs, *, base_block=False):
    values = [
        value for value in attrs.get('customClasses', [])
        if isinstance(value, str) and _CLASS_NAME.fullmatch(value)
    ]
    if attrs.get('visuallyHidden'):
        values.append('vh')
    if base_block:
        layouts = [
            layout for layout in attrs.get('layouts', [])
            if layout in _LAYOUT_CLASSES
        ]
        values.extend(_LAYOUT_CLASSES[layout] for layout in layouts)
        if attrs.get('measure'):
            values.append(f'measure:{attrs["measure"]}')
        if {'stack', 'cover'} & set(layouts):
            values.append(f'space-s{attrs.get("space", 1)}')
        if {'box', 'center'} & set(layouts):
            values.append(f'padding-s{attrs.get("padding", 1)}')
        if 'box' in layouts and attrs.get('boxInvert'):
            values.append('box:invert')
        if 'box' in layouts and attrs.get('boxBorder'):
            values.append('box:border')
        if 'center' in layouts:
            if attrs.get('centerIntrinsic', True):
                values.append('center:intrinsic')
            if attrs.get('centerText'):
                values.append('center:text')
        if {'cluster', 'grid', 'reel', 'sidebar', 'switcher'} & set(layouts):
            values.append(f'gap-s{attrs.get("gap", 1)}')
        if 'grid' in layouts:
            values.append(f'grid-min-{attrs.get("gridMin", 16)}')
        if 'sidebar' in layouts:
            if attrs.get('sidebarPosition') == 'right':
                values.append('with-sidebar:right')
            values.append(f'content-min-{attrs.get("sidebarBreakpoint", 66)}')
            if attrs.get('sidebarWidth', 'auto') != 'auto':
                values.append(f'sidebar-width-{attrs["sidebarWidth"]}')
        if 'switcher' in layouts:
            values.append(f'switcher:max{attrs.get("switcherMax", 5)}')
            values.append(f'switcher-threshold-{attrs.get("switcherThreshold", 30)}')
        if 'frame' in layouts and attrs.get('frameRatio', '16-9') != '16-9':
            values.append(f'frame:{attrs["frameRatio"]}')
    else:
        if attrs.get('measure'):
            values.append(f'measure:{attrs["measure"]}')
        if attrs.get('box'):
            values.append('box')
            if attrs.get('boxInvert'):
                values.append('box:invert')
            if attrs.get('boxBorder'):
                values.append('box:border')
        if attrs.get('center'):
            values.append('center')
            if attrs.get('centerIntrinsic', True):
                values.append('center:intrinsic')
            if attrs.get('centerText'):
                values.append('center:text')
        if attrs.get('box') or attrs.get('center'):
            values.append(f'padding-s{attrs.get("padding", 1)}')
    return ' '.join(dict.fromkeys(values))


def _attributes(attrs, *, base_block=False):
    values = {}
    if attrs.get('id'):
        values['id'] = attrs['id']
    if attrs.get('hidden'):
        values['hidden'] = ''
    if attrs.get('ariaHidden'):
        values['aria-hidden'] = 'true'
    if base_block and attrs.get('ariaLabelledBy'):
        values['aria-labelledby'] = attrs['ariaLabelledBy']
    classes = _classes(attrs, base_block=base_block)
    if classes:
        values['class'] = classes
    return values


def _render_marks(text, marks):
    rendered = text
    aria_hidden = any(
        mark.get('type') == 'visibility'
        and mark.get('attrs', {}).get('state') == 'ariahidden'
        for mark in marks
    )
    aria_applied = False

    def aria_hidden_attribute():
        nonlocal aria_applied
        if not aria_hidden or aria_applied:
            return ''
        aria_applied = True
        return mark_safe(' aria-hidden="true"')

    def visibility_attribute(attrs):
        state = attrs.get('visibilityState')
        return mark_safe(
            ' hidden' if state == 'hidden'
            else ' class="vh"' if state == 'visuallyhidden'
            else ' aria-hidden="true"' if state == 'ariahidden'
            else '',
        )

    for mark in marks:
        mark_type = mark.get('type')
        attrs = mark.get('attrs', {})
        if mark_type == 'strong':
            rendered = format_html(
                '<strong{}{}>{}</strong>',
                visibility_attribute(attrs),
                aria_hidden_attribute(),
                rendered,
            )
        elif mark_type == 'em':
            rendered = format_html(
                '<em{}{}>{}</em>',
                visibility_attribute(attrs),
                aria_hidden_attribute(),
                rendered,
            )
        elif mark_type == 'code':
            rendered = format_html(
                '<code{}{}>{}</code>',
                visibility_attribute(attrs),
                aria_hidden_attribute(),
                rendered,
            )
        elif mark_type == 'link':
            href = _safe_url(attrs.get('href'))
            if href:
                rendered = format_html(
                    '<a href="{}" title="{}"{}{}>{}</a>',
                    href,
                    attrs.get('title') or '',
                    visibility_attribute(attrs),
                    aria_hidden_attribute(),
                    rendered,
                )
        elif mark_type == 'visibility':
            state = attrs.get('state')
            if state == 'hidden':
                rendered = format_html('<span hidden>{}</span>', rendered)
            elif state == 'visuallyhidden':
                rendered = format_html('<span class="vh">{}</span>', rendered)
    if aria_hidden and not aria_applied:
        rendered = format_html('<span aria-hidden="true">{}</span>', rendered)
    return rendered


def _render_node(node):
    node_type = node.get('type')
    attrs = node.get('attrs', {})
    content = mark_safe(''.join(_render_node(child) for child in node.get('content', [])))
    if node_type == 'doc':
        return content
    if node_type == 'text':
        return _render_marks(conditional_escape(node.get('text', '')), node.get('marks', []))
    if node_type == 'hard_break':
        return mark_safe('<br>')
    if node_type == 'horizontal_rule':
        return mark_safe('<hr>')
    if node_type == 'paragraph':
        return format_html('<p{}>{}</p>', mark_safe(_html_attributes(_attributes(attrs))), content)
    if node_type == 'heading':
        level = attrs.get('level', 1)
        level = level if isinstance(level, int) and 1 <= level <= 6 else 1
        return format_html(
            '<h{}{}>{}</h{}>',
            level,
            mark_safe(_html_attributes(_attributes(attrs))),
            content,
            level,
        )
    if node_type == 'blockquote':
        return format_html('<blockquote{}>{}</blockquote>', mark_safe(_html_attributes(_attributes(attrs))), content)
    if node_type == 'bullet_list':
        return format_html('<ul{}>{}</ul>', mark_safe(_html_attributes(_attributes(attrs))), content)
    if node_type == 'ordered_list':
        return format_html('<ol{}>{}</ol>', mark_safe(_html_attributes(_attributes(attrs))), content)
    if node_type == 'list_item':
        return format_html('<li{}>{}</li>', mark_safe(_html_attributes(_attributes(attrs))), content)
    if node_type == 'base_block':
        tag = attrs.get('tag', 'div')
        tag = tag if tag in _BASE_BLOCK_TAGS else 'div'
        return format_html(
            '<{}{}>{}</{}>',
            tag,
            mark_safe(_html_attributes(_attributes(attrs, base_block=True))),
            content,
            tag,
        )
    if node_type == 'figcaption':
        return format_html('<figcaption{}>{}</figcaption>', mark_safe(_html_attributes(_attributes(attrs))), content)
    if node_type == 'figure':
        return format_html('<figure{}>{}</figure>', mark_safe(_html_attributes(_attributes(attrs, base_block=True))), content)
    if node_type == 'image_media':
        return format_html(
            '<img{} src="{}" alt="{}">',
            mark_safe(_html_attributes(_attributes(attrs))),
            _safe_url(attrs.get('src'), media=True),
            attrs.get('alt') or attrs.get('name') or '',
        )
    if node_type == 'video_media':
        return format_html(
            '<video{} src="{}" controls></video>',
            mark_safe(_html_attributes(_attributes(attrs))),
            _safe_url(attrs.get('src'), media=True),
        )
    raise ValueError(f'Unsupported published document node: {node_type!r}')


def _html_attributes(attributes):
    return ''.join(
        f' {name}="{conditional_escape(value)}"'
        for name, value in attributes.items()
    )


def render_document(content):
    stored = json.loads(content)
    if not isinstance(stored, dict) or stored.get('version') != 1:
        raise ValueError('Published page content must be a version 1 editor document.')
    document = stored.get('document')
    if not isinstance(document, dict) or document.get('type') != 'doc':
        raise ValueError('Published page content must contain an editor document.')
    return mark_safe(_render_node(document))
