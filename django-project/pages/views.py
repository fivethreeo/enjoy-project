from django.shortcuts import get_object_or_404, render

from .models import Page
from .model_field_cache import cached_model_field
from .rendering import render_document


def rendered_document(page):
    return cached_model_field(page, 'content', render_document)


def page(request, slug):
    saved_page = get_object_or_404(Page, slug=slug)
    return render(request, 'pages/page.html', {
        'page': saved_page,
        'rendered_document': rendered_document(saved_page),
    })
