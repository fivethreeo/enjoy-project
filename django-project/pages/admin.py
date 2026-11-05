import mimetypes

from django.contrib import admin
from django.core.exceptions import PermissionDenied, ValidationError
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.urls import path, reverse
from django.utils.html import format_html
from django.utils.decorators import method_decorator
from django.views.decorators.http import require_GET, require_POST
from filer.models import File, Folder, Image

from .forms import PageAdminForm
from .models import Page
from .widgets import FilerImagePreviewWidget
from .widgets import PageContentWidget


class PageImageInline(admin.TabularInline):
    model = Page.images.through
    extra = 0
    fields = ('image', 'preview')
    raw_id_fields = ('image',)
    readonly_fields = ('preview',)

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'image':
            preview_url = reverse(
                'admin:pages_page_filer_image_preview',
                kwargs={'image_id': 0},
                current_app=self.admin_site.name,
            ).replace('/0/', '/__image_id__/')
            kwargs['widget'] = FilerImagePreviewWidget(
                db_field.remote_field,
                self.admin_site,
                preview_url,
            )
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    @admin.display(description='Preview')
    def preview(self, page_image):
        if not page_image.image_id:
            return '—'
        return format_html(
            '<img src="{}" alt="" width="120" height="80" style="object-fit: contain;">',
            page_image.image.url,
        )


@admin.register(Page)
class PageAdmin(admin.ModelAdmin):
    form = PageAdminForm
    exclude = ('images',)
    inlines = (PageImageInline,)
    list_display = ('title', 'slug', 'author', 'created', 'updated')
    prepopulated_fields = {'slug': ('title',)}
    readonly_fields = ('created', 'updated')
    search_fields = ('title', 'content')

    def get_urls(self):
        return [
            path(
                'filer-media/',
                self.admin_site.admin_view(self.filer_media),
                name='pages_page_filer_media',
            ),
            path(
                'filer-media/folders/',
                self.admin_site.admin_view(self.filer_media_folders),
                name='pages_page_filer_media_folders',
            ),
            path(
                'filer-media/upload/',
                self.admin_site.admin_view(self.filer_media_upload),
                name='pages_page_filer_media_upload',
            ),
            path(
                'filer-image-preview/<int:image_id>/',
                self.admin_site.admin_view(self.filer_image_preview),
                name='pages_page_filer_image_preview',
            ),
            *super().get_urls(),
        ]

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        widget = form.base_fields['content'].widget
        if isinstance(widget, PageContentWidget):
            widget.with_media_endpoints({
                'list': reverse('admin:pages_page_filer_media', current_app=self.admin_site.name),
                'folders': reverse('admin:pages_page_filer_media_folders', current_app=self.admin_site.name),
                'upload': reverse('admin:pages_page_filer_media_upload', current_app=self.admin_site.name),
            })
        return form

    def _require_media_permission(self, request, *, upload=False):
        if not self.has_change_permission(request):
            raise PermissionDenied
        if upload and not request.user.has_perm('filer.add_file'):
            raise PermissionDenied

    @staticmethod
    def _folder_data(folder):
        if folder is None:
            return {'id': None, 'name': 'Unfiled', 'path': '/Unfiled', 'virtual': True}
        return {
            'id': folder.pk,
            'name': folder.name,
            'path': str(folder.pretty_logical_path),
            'parentId': folder.parent_id,
        }

    def _visible_folder(self, request, folder_id):
        if folder_id in (None, '', 'null', 'unfiled'):
            return None
        try:
            folder = Folder.objects.get(pk=int(folder_id))
        except (Folder.DoesNotExist, TypeError, ValueError):
            raise PermissionDenied('Unknown folder.')
        if not folder.has_read_permission(request):
            raise PermissionDenied
        return folder

    @staticmethod
    def _thumbnail_data(asset):
        if isinstance(asset, Image):
            try:
                thumbnail_url = asset.thumbnails.get('admin_sidebar_preview')
            except Exception:
                thumbnail_url = None
            return {
                'url': thumbnail_url or asset.url,
                'kind': 'image',
                'alt': asset.name or asset.original_filename or 'Image',
            }
        try:
            thumbnails = getattr(asset, 'thumbnails', {})
            thumbnail_url = thumbnails.get('admin_sidebar_preview') if hasattr(thumbnails, 'get') else None
        except Exception:
            thumbnail_url = None
        if thumbnail_url:
            return {
                'url': thumbnail_url,
                'kind': 'image',
                'alt': f'Preview for video: {asset.name or asset.original_filename or "Untitled video"}',
            }
        return {
            'url': None,
            'kind': 'video-placeholder',
            'alt': f'Video: {asset.name or asset.original_filename or "Untitled video"}',
        }

    @classmethod
    def _asset_data(cls, asset):
        thumbnail = cls._thumbnail_data(asset)
        return {
            'id': asset.pk,
            'url': asset.url,
            'name': asset.name or asset.original_filename or '',
            'description': asset.description or '',
            'mimeType': asset.mime_type or '',
            'folder': cls._folder_data(asset.folder),
            'thumbnail': thumbnail,
            'thumbnailUrl': thumbnail['url'],
        }

    @method_decorator(require_GET)
    def filer_media(self, request):
        self._require_media_permission(request)
        kind = request.GET.get('kind')
        if kind not in {'image', 'video'}:
            return JsonResponse({'error': 'kind must be image or video.'}, status=400)
        folder = self._visible_folder(request, request.GET.get('folder'))
        query = (request.GET.get('q') or '').strip()
        try:
            page = max(1, int(request.GET.get('page', 1)))
        except ValueError:
            return JsonResponse({'error': 'page must be a positive integer.'}, status=400)
        queryset = Image.objects.all() if kind == 'image' else File.objects.filter(mime_type__istartswith='video/')
        queryset = queryset.filter(folder=folder)
        queryset = [asset for asset in queryset.order_by('-uploaded_at') if asset.has_read_permission(request)]
        if query:
            needle = query.lower()
            queryset = [asset for asset in queryset if needle in (asset.name or '').lower()
                        or needle in (asset.original_filename or '').lower()]
        page_size = 30
        start = (page - 1) * page_size
        return JsonResponse({
            'assets': [self._asset_data(asset) for asset in queryset[start:start + page_size]],
            'page': page,
            'hasNext': start + page_size < len(queryset),
        })

    @method_decorator(require_GET)
    def filer_media_folders(self, request):
        self._require_media_permission(request)
        folders = [folder for folder in Folder.objects.select_related('parent').all()
                   if folder.has_read_permission(request)]
        return JsonResponse({'folders': [self._folder_data(None)] + [
            self._folder_data(folder) for folder in folders
        ]})

    @method_decorator(require_POST)
    def filer_media_upload(self, request):
        self._require_media_permission(request, upload=True)
        kind = request.POST.get('kind')
        uploaded = request.FILES.get('file')
        if kind not in {'image', 'video'} or uploaded is None:
            return JsonResponse({'error': 'A kind and file are required.'}, status=400)
        mime_type = uploaded.content_type or ''
        detected_type = mimetypes.guess_type(uploaded.name)[0] or ''
        valid_kind = (
            kind == 'image'
            and mime_type.startswith('image/')
            and detected_type.startswith('image/')
        ) or (
            kind == 'video'
            and mime_type.startswith('video/')
            and detected_type.startswith('video/')
        )
        if not valid_kind:
            return JsonResponse({'error': f'The uploaded file is not a {kind}.'}, status=400)
        try:
            folder = self._visible_folder(request, request.POST.get('folder'))
            if folder is not None and not folder.has_add_children_permission(request):
                raise PermissionDenied
            model = Image if kind == 'image' else File
            description_field = model._meta.get_field('description')
            description = description_field.clean(
                (request.POST.get('description') or '').strip(),
                None,
            )
            asset = model(
                file=uploaded,
                folder=folder,
                owner=request.user,
                original_filename=uploaded.name,
                name=uploaded.name,
                mime_type=mime_type,
                description=description,
            )
            asset.save()
        except ValidationError as error:
            return JsonResponse({'error': error.messages[0]}, status=400)
        except PermissionDenied:
            raise
        except Exception:
            return JsonResponse({'error': 'The file could not be saved by django-filer.'}, status=400)
        return JsonResponse({'asset': self._asset_data(asset)}, status=201)

    def filer_image_preview(self, request, image_id):
        if not self.has_change_permission(request):
            raise PermissionDenied
        image = get_object_or_404(Page.images.field.remote_field.model, pk=image_id)
        return JsonResponse({'url': image.url})
