import json

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from filer.models import File, Folder, Image
from unittest.mock import patch

from .models import Page
from .model_field_cache import model_field_cache, model_field_cache_key
from .rendering import render_document


@override_settings(CACHES={
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'pages-tests',
    },
})
class PagePublicationTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('author', password='password')
        self.page = Page.objects.create(
            title='Published page',
            slug='published-page',
            author=self.user,
            content=(
                '{"version": 1, "document": {"type": "doc", "content": ['
                '{"type": "base_block", "content": [{"type": "paragraph", '
                '"content": [{"type": "text", "text": "Published content"}]}]}]}}'
            ),
        )

    def test_root_slug_renders_the_saved_document_shell(self):
        response = self.client.get(reverse('page', kwargs={'slug': self.page.slug}))
        self.assertContains(response, '<p>Published content</p>', html=True)
        self.assertNotContains(response, 'published-document-content')

    @override_settings(TS_BACKEND_URL='/api/', TS_WS_BACKEND_URL='/ws/')
    def test_published_page_exposes_backend_locations_on_body(self):
        response = self.client.get(reverse('page', kwargs={'slug': self.page.slug}))
        self.assertContains(
            response, '<body data-ts-backend-url="/api/" data-ts-ws-backend-url="/ws/">',
        )

    def test_root_slug_renders_aria_hidden_content(self):
        self.page.content = (
            '{"version": 1, "document": {"type": "doc", "content": ['
            '{"type": "base_block", "content": [{"type": "paragraph", '
            '"attrs": {"ariaHidden": true}, "content": ['
            '{"type": "text", "text": "ARIA hidden content"}]}]}]}}'
        )
        self.page.save()
        response = self.client.get(reverse('page', kwargs={'slug': self.page.slug}))
        self.assertContains(response, '<p aria-hidden="true">ARIA hidden content</p>', html=True)

    def test_aria_hidden_text_reuses_an_inline_marker(self):
        rendered = render_document(json.dumps({
            'version': 1,
            'document': {
                'type': 'doc',
                'content': [{
                    'type': 'paragraph',
                    'content': [
                        {
                            'type': 'text',
                            'text': 'Bold ARIA hidden content',
                            'marks': [
                                {'type': 'strong'},
                                {'type': 'visibility', 'attrs': {'state': 'ariahidden'}},
                            ],
                        },
                        {
                            'type': 'text',
                            'text': ' Unmarked ARIA hidden content',
                            'marks': [
                                {'type': 'visibility', 'attrs': {'state': 'ariahidden'}},
                            ],
                        },
                    ],
                }],
            },
        }))
        self.assertIn('<strong aria-hidden="true">Bold ARIA hidden content</strong>', rendered)
        self.assertIn('<span aria-hidden="true"> Unmarked ARIA hidden content</span>', rendered)

    def test_page_save_clears_the_rendered_document_cache(self):
        key = model_field_cache_key(self.page, 'content')
        cache.set(key, 'cached document')
        self.page.title = 'Updated page'
        self.page.save()
        self.assertIsNone(cache.get(key))

    def test_cached_page_document_is_rendered_once(self):
        cache.clear()
        url = reverse('page', kwargs={'slug': self.page.slug})
        with patch('pages.views.render_document', wraps=render_document) as render:
            self.client.get(url)
            self.client.get(url)
        self.assertEqual(render.call_count, 1)

    @override_settings(CACHES={})
    def test_render_cache_is_disabled_without_configuration(self):
        self.assertIsNone(model_field_cache())


@override_settings(MEDIA_ROOT='test-media')
class PageMediaReferenceTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('author', password='password')
        self.image = Image.objects.create(
            owner=self.user,
            name='Current photo',
            mime_type='image/png',
            file=SimpleUploadedFile('current.png', b'image', content_type='image/png'),
        )
        self.video = File.objects.create(
            owner=self.user,
            name='Current movie',
            mime_type='video/mp4',
            file=SimpleUploadedFile('current.mp4', b'video', content_type='video/mp4'),
        )

    def document(self):
        return {
            'version': 1,
            'document': {
                'type': 'doc',
                'content': [
                    {'type': 'image_media', 'attrs': {
                        'filerId': self.image.pk,
                        'src': '/stale-image.png',
                        'name': 'Old image name',
                        'mimeType': 'image/jpeg',
                    }},
                    {'type': 'video_media', 'attrs': {
                        'filerId': self.video.pk,
                        'src': '/stale-video.mp4',
                        'name': 'Old video name',
                        'mimeType': 'video/webm',
                    }},
                    {'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Kept'}]},
                ],
            },
        }

    def test_save_refreshes_filer_media_urls_and_metadata(self):
        page = Page.objects.create(
            title='Media page',
            slug='media-page',
            author=self.user,
            content=json.dumps(self.document()),
        )
        document = json.loads(page.content)['document']
        image, video = document['content'][:2]
        self.assertEqual(image['attrs']['src'], self.image.url)
        self.assertEqual(image['attrs']['name'], self.image.name)
        self.assertEqual(image['attrs']['mimeType'], self.image.mime_type)
        self.assertEqual(video['attrs']['src'], self.video.url)
        self.assertEqual(video['attrs']['name'], self.video.name)
        self.assertEqual(video['attrs']['mimeType'], self.video.mime_type)

    def test_save_removes_missing_filer_media_and_empty_figures(self):
        document = self.document()
        document['document']['content'] = [{
            'type': 'figure',
            'content': [document['document']['content'][0]],
        }, document['document']['content'][2]]
        page = Page.objects.create(
            title='Stale media page',
            slug='stale-media-page',
            author=self.user,
            content=json.dumps(document),
        )
        self.image.delete()
        page.save()
        content = json.loads(page.content)['document']['content']
        self.assertEqual(content, [{
            'type': 'paragraph',
            'content': [{'type': 'text', 'text': 'Kept'}],
        }])


@override_settings(MEDIA_ROOT='test-media')
class FilerMediaEndpointTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_superuser('editor', 'editor@example.test', 'password')
        self.client.force_login(self.user)
        self.urls = {
            'list': reverse('admin:pages_page_filer_media'),
            'folders': reverse('admin:pages_page_filer_media_folders'),
            'upload': reverse('admin:pages_page_filer_media_upload'),
        }
        self.folder = Folder.objects.create(name='Media', owner=self.user)
        self.image = Image.objects.create(
            folder=self.folder, owner=self.user, name='Photo', mime_type='image/png',
            description='A <strong>text-only</strong> photo',
            file=SimpleUploadedFile('photo.png', b'not-a-real-image', content_type='image/png'),
        )
        self.video = File.objects.create(
            folder=self.folder, owner=self.user, name='Movie', mime_type='video/mp4',
            file=SimpleUploadedFile('movie.mp4', b'video', content_type='video/mp4'),
        )
        File.objects.create(
            folder=self.folder, owner=self.user, name='Document', mime_type='application/pdf',
            file=SimpleUploadedFile('document.pdf', b'pdf', content_type='application/pdf'),
        )

    def test_assets_are_filtered_by_kind_and_folder(self):
        response = self.client.get(self.urls['list'], {'kind': 'image', 'folder': self.folder.pk})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([asset['id'] for asset in response.json()['assets']], [self.image.pk])
        image = response.json()['assets'][0]
        self.assertEqual(image['description'], 'A <strong>text-only</strong> photo')
        self.assertEqual(image['thumbnail']['kind'], 'image')
        self.assertEqual(image['thumbnailUrl'], image['thumbnail']['url'])
        self.assertTrue(image['thumbnailUrl'])
        response = self.client.get(self.urls['list'], {'kind': 'video', 'folder': self.folder.pk})
        self.assertEqual([asset['id'] for asset in response.json()['assets']], [self.video.pk])
        video = response.json()['assets'][0]
        self.assertEqual(video['thumbnail']['kind'], 'video-placeholder')
        self.assertIsNone(video['thumbnailUrl'])

    def test_folders_include_unfiled(self):
        response = self.client.get(self.urls['folders'])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['folders'][0]['name'], 'Unfiled')

    def test_upload_uses_filer_and_rejects_wrong_kind(self):
        response = self.client.post(self.urls['upload'], {
            'kind': 'video', 'folder': self.folder.pk,
            'description': 'A <em>text-only</em> movie',
            'file': SimpleUploadedFile('movie.mp4', b'video', content_type='video/mp4'),
        })
        self.assertEqual(response.status_code, 201)
        asset = response.json()['asset']
        uploaded = File.objects.get(pk=asset['id'])
        self.assertEqual(uploaded.description, 'A <em>text-only</em> movie')
        self.assertEqual(asset['description'], uploaded.description)
        self.assertEqual(asset['thumbnail']['kind'], 'video-placeholder')
        response = self.client.post(self.urls['upload'], {
            'kind': 'image', 'folder': self.folder.pk,
            'description': 'A text-only image',
            'file': SimpleUploadedFile('uploaded-image.png', b'not-a-real-image', content_type='image/png'),
        })
        self.assertEqual(response.status_code, 201)
        asset = response.json()['asset']
        uploaded_image = Image.objects.get(pk=asset['id'])
        self.assertEqual(uploaded_image.description, 'A text-only image')
        self.assertEqual(asset['description'], uploaded_image.description)
        self.assertEqual(asset['thumbnail']['kind'], 'image')
        response = self.client.post(self.urls['upload'], {
            'kind': 'image',
            'file': SimpleUploadedFile('movie.mp4', b'video', content_type='video/mp4'),
        })
        self.assertEqual(response.status_code, 400)

    def test_endpoints_require_page_change_permission(self):
        user = get_user_model().objects.create_user(
            'viewer', password='password', is_staff=True,
        )
        self.client.force_login(user)
        self.assertEqual(self.client.get(self.urls['list'], {'kind': 'image'}).status_code, 403)
