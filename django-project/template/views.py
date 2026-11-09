from django.conf import settings
from django.core.paginator import EmptyPage, PageNotAnInteger, Paginator
from django.http import JsonResponse
from django.utils.crypto import constant_time_compare
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET

from .celery import app
from .models import Job


@never_cache
@require_GET
def auth(request):
    token = settings.INTERNAL_AUTH_TOKEN
    if not token:
        return JsonResponse({'error': 'Unavailable'}, status=503)

    if not constant_time_compare(
        request.headers.get('Authorization', ''),
        f'Bearer {token}',
    ):
        return JsonResponse({'error': 'Forbidden'}, status=403)

    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Unauthenticated'}, status=401)

    return JsonResponse({'user_id': request.user.pk})


@never_cache
@require_GET
def job_results(request):
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Unauthenticated'}, status=401)

    paginator = Paginator(Job.objects.filter(user=request.user), 25)
    try:
        page = paginator.page(request.GET.get('page', 1))
    except PageNotAnInteger:
        return JsonResponse({'error': 'Invalid page'}, status=400)
    except EmptyPage:
        return JsonResponse({'error': 'Page not found'}, status=404)

    jobs = list(page.object_list)
    if jobs and not app.conf.result_backend:
        return JsonResponse({'error': 'Celery result storage is not configured'}, status=503)

    results = []
    for job in jobs:
        try:
            metadata = app.backend.get_task_meta(job.task_id, cache=False)
        except Exception:
            return JsonResponse({'error': 'Unable to retrieve task results'}, status=503)
        status = metadata.get('status', 'PENDING')
        results.append({
            'id': job.pk,
            'task_id': job.task_id,
            'created_at': job.created_at,
            'status': status,
            'result': metadata.get('result') if status == 'SUCCESS' else None,
        })

    try:
        return JsonResponse({
            'count': paginator.count,
            'page': page.number,
            'pages': paginator.num_pages,
            'results': results,
        })
    except (TypeError, ValueError, OverflowError):
        return JsonResponse({'error': 'Unable to encode task results'}, status=503)
