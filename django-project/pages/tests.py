from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from filer.models import File, Folder, Image


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
