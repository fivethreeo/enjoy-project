from django.conf import settings
from django.core.cache import caches
from django.core.cache.backends.dummy import DummyCache


def model_field_cache():
    if not settings.is_overridden('CACHES') or 'default' not in settings.CACHES:
        return None
    cache = caches['default']
    return None if isinstance(cache, DummyCache) else cache


def model_field_cache_key(instance, field_name):
    if instance.pk is None:
        raise ValueError('Cannot cache a field of an unsaved model instance.')
    instance._meta.get_field(field_name)
    return f'model-field:{instance._meta.label_lower}:{instance.pk}:{field_name}'


def cached_model_field(instance, field_name, render):
    instance._meta.get_field(field_name)
    cache = model_field_cache()
    if cache is None:
        return render(getattr(instance, field_name))

    key = model_field_cache_key(instance, field_name)
    missing = object()
    cached = cache.get(key, missing)
    if cached is not missing:
        return cached

    rendered = render(getattr(instance, field_name))
    cache.set(key, rendered, timeout=None)
    return rendered


def clear_model_field_cache(instance, field_name):
    cache = model_field_cache()
    if cache is not None:
        cache.delete(model_field_cache_key(instance, field_name))
