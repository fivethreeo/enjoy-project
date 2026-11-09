#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys
import signal
from pathlib import Path


def configure_frontend_reload():
    trigger_name = os.environ.get('DJANGO_RELOAD_TRIGGER')
    if not trigger_name or not hasattr(signal, 'SIGHUP'):
        return
    from django.utils.autoreload import autoreload_started

    trigger = Path(trigger_name)

    def request_reload(signum, frame):
        # Restart the autoreloader's child, keeping the published parent PID stable.
        trigger.touch()

    def watch_trigger(sender, **kwargs):
        sender.extra_files.add(trigger)

    signal.signal(signal.SIGHUP, request_reload)
    autoreload_started.connect(watch_trigger, weak=False)
    trigger.touch()


def main():
    """Run administrative tasks."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'template.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    if len(sys.argv) > 1 and sys.argv[1] == 'runserver':
        configure_frontend_reload()
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
