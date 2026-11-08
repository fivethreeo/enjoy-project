from django.db import migrations, models


def populate_page_titles_and_slugs(apps, schema_editor):
    Page = apps.get_model('pages', 'Page')
    for page in Page.objects.filter(title__isnull=True).iterator():
        page.title = f'Page {page.pk}'
        page.slug = f'page-{page.pk}'
        page.save(update_fields=('title', 'slug'))


class Migration(migrations.Migration):
    dependencies = [
        ('pages', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='page',
            name='title',
            field=models.CharField(max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='page',
            name='slug',
            field=models.SlugField(db_index=False, max_length=255, null=True),
        ),
        migrations.RunPython(
            populate_page_titles_and_slugs,
            migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name='page',
            name='title',
            field=models.CharField(max_length=255),
        ),
        migrations.AlterField(
            model_name='page',
            name='slug',
            field=models.SlugField(max_length=255, unique=True),
        ),
    ]
