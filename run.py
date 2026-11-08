#!/usr/bin/env python3
import sys
import os
import subprocess
import signal
import tempfile
from pathlib import Path
import time

# --- Helper Configuration ---
IS_WINDOWS = os.name == 'nt'

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
TS_DIR = os.path.join(ROOT_DIR, "typescript-frontend")
TS_BACKEND_DIR = os.path.join(ROOT_DIR, "typescript-backend")
TS_WS_BACKEND_DIR = os.path.join(ROOT_DIR, "typescript-ws-backend")
PY_DIR = os.path.join(ROOT_DIR, "django-project")
ICON_BUILD_DEBOUNCE_SECONDS = 1
MASTER_ICONS_SVG = os.path.join(ROOT_DIR, "assets", "master_icons.svg")
ICON_GENERATOR = os.path.join(ROOT_DIR, "assets", "make_svg_icon_sprites.py")

if IS_WINDOWS:
    VENV_PYTHON = os.path.join(PY_DIR, ".venv", "Scripts", "python.exe")
    VENV_PIP = os.path.join(PY_DIR, ".venv", "Scripts", "pip.exe")
else:
    VENV_PYTHON = os.path.join(PY_DIR, ".venv", "bin", "python")
    VENV_PIP = os.path.join(PY_DIR, ".venv", "bin", "pip")

# Keep track of active background processes for parallel shutdown
active_processes = []

def run_command(cmd, cwd, env_updates=None, wait=True):
    """Executes a command inheriting the system environment."""
    current_env = os.environ.copy()
    if env_updates:
        current_env.update(env_updates)
    
    try:
        command = subprocess.list2cmdline(cmd) if IS_WINDOWS else cmd
        proc = subprocess.Popen(command, cwd=cwd, env=current_env, shell=IS_WINDOWS)
        active_processes.append(proc)
        
        if wait:
            proc.wait()
            if proc.returncode != 0:
                raise subprocess.CalledProcessError(proc.returncode, cmd)
    except Exception as e:
        print(f"\n❌ Execution error: {e}")
        sys.exit(1)

# --- Core Task Commands ---
def setup():
    for directory in (TS_DIR, TS_BACKEND_DIR, TS_WS_BACKEND_DIR):
        print(f"📦 Installing dependencies for {os.path.basename(directory)}...")
        run_command(["npm", "install"], cwd=directory)
    
    print("\n🐍 Creating Python virtual environment...")
    subprocess.run([sys.executable, "-m", "venv", os.path.join(PY_DIR, ".venv")], check=True)
    
    print("\n📦 Installing Python dependencies inside .venv...")
    run_command([VENV_PIP, "install", "-r", "requirements.txt"], cwd=PY_DIR)
    print("\n✅ Setup complete!")

def run_py(args, envs, wait=True):
    cmd = [VENV_PYTHON, "manage.py", "runserver", *args]
    run_command(cmd, cwd=PY_DIR, env_updates=envs, wait=wait)

def run_manage(args, envs, wait=True):
    cmd = [VENV_PYTHON, "manage.py", *args]
    run_command(cmd, cwd=PY_DIR, env_updates=envs, wait=wait)

def run_ts(args, envs, wait=True):
    cmd = ["npm", "run", "dev", *(["--", *args] if args else [])]
    run_command(cmd, cwd=TS_DIR, env_updates=envs, wait=wait)

def run_npm(args, envs, wait=True, cwd=TS_DIR):
    cmd = ["npm", *args]
    run_command(cmd, cwd=cwd, env_updates=envs, wait=wait)

def file_mtime(path):
    return os.stat(path).st_mtime_ns

def build_typescript_icons():
    print("🎨 Master icon SVG changed; generating TypeScript icons...")
    subprocess.run(
        [sys.executable, ICON_GENERATOR, "--format", "ts"],
        cwd=ROOT_DIR,
        check=True,
    )

def run_parallel(args, envs):
    print("🚀 Starting Django, frontend, HTTP backend, WebSocket backend and Celery in parallel...")
    print("💡 Press Ctrl+C at any time to shut down all five.\n")

    port_names = ("DJANGO_PORT", "RSBUILD_PORT", "TS_BACKEND_PORT", "TS_WS_BACKEND_PORT")
    ports = dict(zip(port_names, ("8000", "3000", "8001", "8002")))
    ports.update({name: envs[name] for name in port_names if name in envs})
    host = envs.get("HOST", "127.0.0.1").strip("[]")
    if not host:
        raise SystemExit("❌ HOST must not be empty.")
    url_host = f"[{host}]" if ":" in host else host
    public_host = envs.get("PUBLIC_HOST", host).strip("[]")
    if not public_host:
        raise SystemExit("❌ PUBLIC_HOST must not be empty.")
    public_url_host = f"[{public_host}]" if ":" in public_host else public_host

    try:
        ports = {name: int(value) for name, value in ports.items()}
        if any(not 1 <= value <= 65535 for value in ports.values()):
            raise ValueError
    except ValueError:
        raise SystemExit(f"❌ {', '.join(port_names)} must be valid port numbers (1-65535).")

    if len(set(ports.values())) != len(ports):
        raise SystemExit(f"❌ {', '.join(port_names)} must all be different.")
    if "--noreload" in args:
        raise SystemExit("❌ Frontend-triggered Django reload requires the Django autoreloader.")

    if any(
        arg in ("--port", "--addrport", "--host")
        or arg.startswith(("--port=", "--addrport=", "--host="))
        for arg in args
    ):
        raise SystemExit(
            "❌ Shared --port/--addrport/--host arguments are not supported in parallel mode. "
            "Use HOST=... and the individual *_PORT assignments instead."
        )

    parallel_envs = envs.copy()
    parallel_envs.setdefault("RSBUILD_BASE_URL", f"http://{public_url_host}:{ports['RSBUILD_PORT']}")
    parallel_envs.setdefault("RSBUILD_HMR_HOST", public_host)
    parallel_envs.setdefault(
        "RSBUILD_CORS_ORIGIN",
        os.environ.get("RSBUILD_CORS_ORIGIN", f"http://{public_url_host}:{ports['DJANGO_PORT']}"),
    )
    parallel_envs.setdefault(
        "DJANGO_TS_BACKEND_URL",
        os.environ.get("DJANGO_TS_BACKEND_URL", f"http://{public_url_host}:{ports['TS_BACKEND_PORT']}/"),
    )
    parallel_envs.setdefault(
        "DJANGO_TS_WS_BACKEND_URL",
        os.environ.get("DJANGO_TS_WS_BACKEND_URL", f"ws://{public_url_host}:{ports['TS_WS_BACKEND_PORT']}/"),
    )
    parallel_envs.setdefault(
        "CELERY_BROKER_URL",
        os.environ.get("CELERY_BROKER_URL") or f"sqla+sqlite:///{(Path(PY_DIR) / 'celery-broker.sqlite3').as_posix()}",
    )
    processes = []
    reload_directory = tempfile.TemporaryDirectory(prefix="prosango-django-reload-") if not IS_WINDOWS else None
    reload_trigger = Path(reload_directory.name) / "frontend-reload" if reload_directory else None
    
    def start_process(command, cwd, env_updates=None):
        process = subprocess.Popen(
            subprocess.list2cmdline(command) if IS_WINDOWS else command,
            cwd=cwd,
            env={**os.environ, **parallel_envs, **(env_updates or {})},
            shell=IS_WINDOWS,
            start_new_session=not IS_WINDOWS,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if IS_WINDOWS else 0,
        )
        processes.append(process)
        active_processes.append(process)
        return process

    def start_django():
        return start_process(
            [VENV_PYTHON, "manage.py", "runserver", f"{url_host}:{ports['DJANGO_PORT']}", *args],
            PY_DIR,
            {"DJANGO_RELOAD_TRIGGER": str(reload_trigger)} if reload_trigger else None,
        )

    master_icons_mtime = file_mtime(MASTER_ICONS_SVG)
    build_icons_at = None
    try:
        django_process = start_django()
        if reload_trigger:
            deadline = time.monotonic() + 15
            while not reload_trigger.exists():
                returncode = django_process.poll()
                if returncode is not None:
                    raise SystemExit(returncode or 1)
                if time.monotonic() >= deadline:
                    raise SystemExit("❌ Django's frontend reload handler did not become ready.")
                time.sleep(0.05)
        start_process(
            ["npm", "run", "dev", "--", "--host", host, "--port", str(ports["RSBUILD_PORT"]), *args],
            TS_DIR,
            {"DJANGO_PID": str(django_process.pid)} if reload_trigger else None,
        )
        for directory, port_name in (
            (TS_BACKEND_DIR, "TS_BACKEND_PORT"),
            (TS_WS_BACKEND_DIR, "TS_WS_BACKEND_PORT"),
        ):
            start_process(
                ["npm", "run", "dev"],
                directory,
                {"HOST": host, "PORT": str(ports[port_name])},
            )
        start_process(
            [
                VENV_PYTHON, "-m", "celery", "--app=prosango", "worker",
                "--loglevel=INFO", "--pool=solo", "--concurrency=1",
                "--without-gossip", "--without-mingle", "--without-heartbeat",
            ],
            PY_DIR,
        )
        while True:
            time.sleep(0.5)
            for process in processes:
                returncode = process.poll()
                if returncode is not None:
                    raise SystemExit(returncode or 1)
            latest_master_icons_mtime = file_mtime(MASTER_ICONS_SVG)
            if latest_master_icons_mtime > master_icons_mtime:
                master_icons_mtime = latest_master_icons_mtime
                build_icons_at = time.monotonic() + ICON_BUILD_DEBOUNCE_SECONDS
            if build_icons_at is not None and time.monotonic() >= build_icons_at:
                build_icons_at = None
                try:
                    build_typescript_icons()
                except subprocess.CalledProcessError as error:
                    print(f"❌ TypeScript icon generation failed: {error}")
    except KeyboardInterrupt:
        print("\n🛑 Shutting down all services gracefully...")
    finally:
        for proc in processes:
            if IS_WINDOWS:
                if proc.poll() is None:
                    subprocess.run(
                        ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    )
            else:
                try:
                    os.killpg(proc.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
        for proc in processes:
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                if IS_WINDOWS:
                    proc.kill()
                else:
                    try:
                        os.killpg(proc.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                proc.wait()
        print("👋 Exited all parallel tasks safely.")
        if reload_directory:
            reload_directory.cleanup()

# --- CLI Parser ---
def main():
    if len(sys.argv) < 2:
        print("Usage: python run.py [setup | py | manage | ts | npm | npm-backend | npm-ws-backend | parallel] [KEY=VALUE ...] [--args...]")
        sys.exit(1)
        
    task = sys.argv[1]
    passed_args = sys.argv[2:]
    
    envs = {}
    forward_args = []
    
    for item in passed_args:
        if "=" in item and not item.startswith("-"):
            key, val = item.split("=", 1)
            envs[key] = val
        else:
            forward_args.append(item)

    if task in ("py", "manage", "parallel"):
        envs.setdefault("DJANGO_DEBUG", "true")

    if task == "setup":
        setup()
    elif task == "py":
        run_py(forward_args, envs)
    elif task == "manage":
        run_manage(forward_args, envs)
    elif task == "ts":
        run_ts(forward_args, envs)
    elif task == "npm":
        run_npm(forward_args, envs)
    elif task in ("npm-backend", "npm-ws-backend"):
        directory = TS_BACKEND_DIR if task == "npm-backend" else TS_WS_BACKEND_DIR
        run_npm(forward_args, envs, cwd=directory)
    elif task == "parallel":
        run_parallel(forward_args, envs)
    else:
        print(f"Unknown task: {task}. Choose from setup, py, manage, ts, npm, npm-backend, npm-ws-backend, parallel.")
        sys.exit(1)

if __name__ == "__main__":
    main()
