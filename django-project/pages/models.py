from django.db import models

from .model_field_cache import clear_model_field_cache
from .media_references import reconcile_model_field_media


class Page(models.Model):
    title = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True)
    author = models.ForeignKey(
        'auth.User',
        on_delete=models.PROTECT,
        related_name='pages',
    )
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    content = models.TextField()
    images = models.ManyToManyField('filer.Image', blank=True, related_name='pages')

    class Meta:
        ordering = ('-updated',)

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        media_changed = reconcile_model_field_media(self, 'content')
        if media_changed and kwargs.get('update_fields') is not None:
            kwargs['update_fields'] = {*kwargs['update_fields'], 'content'}
        super().save(*args, **kwargs)
        clear_model_field_cache(self, 'content')

    def delete(self, *args, **kwargs):
        clear_model_field_cache(self, 'content')
        return super().delete(*args, **kwargs)
