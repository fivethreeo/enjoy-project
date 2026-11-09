import json
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from celery import shared_task
from django.conf import settings


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_opener = build_opener(ProxyHandler({}), _NoRedirect())


@shared_task(bind=True, max_retries=5)
def notify(self, result, user_id, event='task.finished'):
    if not settings.WS_INTERNAL_URL or not settings.WS_INTERNAL_NOTIFY_TOKEN:
        return result

    base = urlsplit(settings.WS_INTERNAL_URL)
    if (
        base.scheme not in ('http', 'https') or not base.hostname
        or base.username is not None or base.password is not None
        or base.query or base.fragment
    ):
        raise ValueError('WS_INTERNAL_URL must be an HTTP(S) base URL without credentials or query/fragment.')
    if not (
        isinstance(user_id, str) and user_id
        or type(user_id) is int and 0 < user_id <= 2**53 - 1
    ) or not isinstance(event, str) or not event:
        raise ValueError('A valid user ID and nonempty event are required.')
    body = json.dumps(
        {'user_id': user_id, 'event': event, 'result': result}, allow_nan=False,
    ).encode('utf-8')
    if len(body) > 64 * 1024:
        raise ValueError('WebSocket notifications cannot exceed 64 KiB.')
    request = Request(
        urljoin(settings.WS_INTERNAL_URL.rstrip('/') + '/', 'internal/notify/'),
        data=body,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {settings.WS_INTERNAL_NOTIFY_TOKEN}',
        },
        method='POST',
    )
    try:
        with _opener.open(request, timeout=5) as response:
            if response.status != 202:
                raise ValueError('The WS notification endpoint must return HTTP 202.')
    except OSError as error:
        if isinstance(error, HTTPError):
            error.close()
            if error.code != 429 and not 500 <= error.code < 600:
                raise
        raise self.retry(exc=error, countdown=min(2**self.request.retries, 60))
    return result
