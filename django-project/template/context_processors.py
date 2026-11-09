from django.conf import settings


def backend_locations(request):
    return {
        'ts_backend_url': settings.TS_BACKEND_URL,
        'ts_ws_backend_url': settings.TS_WS_BACKEND_URL,
    }
