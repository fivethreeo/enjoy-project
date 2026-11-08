import json

from django.core.exceptions import FieldDoesNotExist
from filer.models import File, Image


_MEDIA_NODE_TYPES = {
    'image_media': Image,
    'video_media': File,
}


def _media_id(value):
    if isinstance(value, bool):
        return None
    try:
        media_id = int(value)
    except (TypeError, ValueError):
        return None
    return media_id if media_id > 0 else None


def _asset_data(asset):
    return {
        'filerId': asset.pk,
        'src': asset.url,
        'name': asset.name or asset.original_filename or '',
        'mimeType': asset.mime_type or '',
    }


def _assets_by_node_type(document):
    ids_by_type = {node_type: set() for node_type in _MEDIA_NODE_TYPES}

    def collect(node):
        if not isinstance(node, dict):
            return
        node_type = node.get('type')
        attrs = node.get('attrs')
        if node_type in ids_by_type and isinstance(attrs, dict):
            media_id = _media_id(attrs.get('filerId'))
            if media_id is not None:
                ids_by_type[node_type].add(media_id)
        for child in node.get('content', []):
            collect(child)

    collect(document)
    return {
        'image_media': Image.objects.in_bulk(ids_by_type['image_media']),
        'video_media': File.objects.filter(
            pk__in=ids_by_type['video_media'],
            mime_type__istartswith='video/',
        ).in_bulk(),
    }


def _reconcile_node(node, assets_by_node_type):
    if not isinstance(node, dict):
        return node

    node_type = node.get('type')
    attrs = node.get('attrs')
    if node_type in _MEDIA_NODE_TYPES and isinstance(attrs, dict):
        media_id = _media_id(attrs.get('filerId'))
        if media_id is not None:
            asset = assets_by_node_type[node_type].get(media_id)
            if asset is None:
                return None
            node = {**node, 'attrs': {**attrs, **_asset_data(asset)}}

    content = node.get('content')
    if isinstance(content, list):
        reconciled_content = [
            child for child in (
                _reconcile_node(child, assets_by_node_type) for child in content
            )
            if child is not None
        ]
        node = {**node, 'content': reconciled_content}

    if node_type == 'figure' and not any(
        child.get('type') in _MEDIA_NODE_TYPES
        for child in node.get('content', [])
        if isinstance(child, dict)
    ):
        return None
    return node


def reconcile_model_field_media(instance, field_name):
    """Refresh filer-backed media in a version 1 document field in place."""
    try:
        field = instance._meta.get_field(field_name)
    except FieldDoesNotExist as error:
        raise ValueError(f'{instance._meta.label_lower} has no {field_name!r} field.') from error
    if not isinstance(getattr(instance, field.attname), str):
        raise ValueError(f'{instance._meta.label_lower}.{field_name} must contain JSON text.')

    value = getattr(instance, field.attname)
    try:
        stored = json.loads(value)
    except json.JSONDecodeError:
        return False
    if not isinstance(stored, dict) or stored.get('version') != 1:
        return False
    document = stored.get('document')
    if not isinstance(document, dict) or document.get('type') != 'doc':
        return False

    reconciled_document = _reconcile_node(document, _assets_by_node_type(document))
    if reconciled_document == document:
        return False
    setattr(instance, field.attname, json.dumps({
        **stored,
        'document': reconciled_document,
    }, separators=(',', ':')))
    return True
