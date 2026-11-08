import contextlib
import signal
import subprocess
import unittest
from unittest.mock import Mock, call, patch

import run


class ParallelTests(unittest.TestCase):
    def setUp(self):
        stack = contextlib.ExitStack()
        self.addCleanup(stack.close)
        stack.enter_context(patch.object(run, "IS_WINDOWS", False))
        stack.enter_context(patch.object(run, "active_processes", []))
        stack.enter_context(patch.dict(run.os.environ, {}, clear=True))
        stack.enter_context(patch.object(run, "file_mtime", return_value=1))
        stack.enter_context(patch.object(run.Path, "exists", return_value=True))
        stack.enter_context(patch("builtins.print"))
        self.sleep = stack.enter_context(patch.object(run.time, "sleep", side_effect=KeyboardInterrupt))
        self.killpg = stack.enter_context(patch.object(run.os, "killpg"))
        self.processes = [
            Mock(pid=100 + index, poll=Mock(return_value=None), wait=Mock(return_value=0))
            for index in range(5)
        ]
        self.popen = stack.enter_context(patch.object(run.subprocess, "Popen", side_effect=self.processes))

    def test_defaults_start_four_watchers_and_celery_and_ctrl_c_stops_their_process_groups(self):
        run.run_parallel([], {})
        launches = self.popen.call_args_list
        self.assertEqual(len(launches), 5)
        self.assertEqual(launches[0].args[0], [run.VENV_PYTHON, "manage.py", "runserver", "127.0.0.1:8000"])
        self.assertEqual(launches[1].args[0], ["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", "3000"])
        self.assertEqual(launches[1].kwargs["env"]["DJANGO_PID"], str(self.processes[0].pid))
        self.assertEqual(launches[1].kwargs["env"]["RSBUILD_CORS_ORIGIN"], "http://127.0.0.1:8000")
        self.assertIn("DJANGO_RELOAD_TRIGGER", launches[0].kwargs["env"])
        self.assertNotIn("DJANGO_RELOAD_TRIGGER", launches[4].kwargs["env"])
        self.assertEqual(launches[0].kwargs["env"]["DJANGO_TS_BACKEND_URL"], "http://127.0.0.1:8001/")
        self.assertEqual(launches[0].kwargs["env"]["DJANGO_TS_WS_BACKEND_URL"], "ws://127.0.0.1:8002/")
        for index, directory, port in [(2, run.TS_BACKEND_DIR, "8001"), (3, run.TS_WS_BACKEND_DIR, "8002")]:
            self.assertEqual(launches[index].args[0], ["npm", "run", "dev"])
            self.assertEqual(launches[index].kwargs["cwd"], directory)
            self.assertEqual(launches[index].kwargs["env"]["HOST"], "127.0.0.1")
            self.assertEqual(launches[index].kwargs["env"]["PORT"], port)
        self.assertEqual(launches[4].kwargs["cwd"], run.PY_DIR)
        self.assertEqual(launches[4].args[0][:5], [run.VENV_PYTHON, "-m", "celery", "--app=prosango", "worker"])
        self.assertIn("--pool=solo", launches[4].args[0])
        broker = launches[0].kwargs["env"]["CELERY_BROKER_URL"]
        self.assertTrue(broker.startswith("sqla+sqlite:///"))
        self.assertTrue(broker.endswith("/celery-broker.sqlite3"))
        self.assertEqual(launches[4].kwargs["env"]["CELERY_BROKER_URL"], broker)
        self.assertTrue(all(launch.kwargs["start_new_session"] for launch in launches))
        self.assertEqual(self.killpg.call_args_list, [call(proc.pid, signal.SIGTERM) for proc in self.processes])
        for process in self.processes:
            process.wait.assert_called_once_with(timeout=5)

    def test_custom_ipv6_bind_and_public_frontend_address_keep_backend_ports_independent(self):
        run.run_parallel([], {
            "HOST": "::1", "PUBLIC_HOST": "2001:db8::1",
            "DJANGO_PORT": "8100", "RSBUILD_PORT": "3100",
            "TS_BACKEND_PORT": "8101", "TS_WS_BACKEND_PORT": "8102",
        })
        launches = self.popen.call_args_list
        self.assertIn("[::1]:8100", launches[0].args[0])
        self.assertEqual(launches[1].kwargs["env"]["RSBUILD_BASE_URL"], "http://[2001:db8::1]:3100")
        self.assertEqual(launches[1].kwargs["env"]["RSBUILD_HMR_HOST"], "2001:db8::1")
        self.assertEqual(launches[1].kwargs["env"]["RSBUILD_CORS_ORIGIN"], "http://[2001:db8::1]:8100")
        self.assertEqual(launches[0].kwargs["env"]["DJANGO_TS_BACKEND_URL"], "http://[2001:db8::1]:8101/")
        self.assertEqual(launches[0].kwargs["env"]["DJANGO_TS_WS_BACKEND_URL"], "ws://[2001:db8::1]:8102/")
        self.assertEqual(launches[2].kwargs["env"]["HOST"], "::1")
        self.assertEqual(launches[2].kwargs["env"]["PORT"], "8101")
        self.assertEqual(launches[3].kwargs["env"]["PORT"], "8102")

    def test_shell_rsbuild_cors_origin_overrides_the_generated_origin(self):
        with patch.dict(run.os.environ, {"RSBUILD_CORS_ORIGIN": "https://django.example.com"}):
            run.run_parallel([], {})
        self.assertEqual(
            self.popen.call_args_list[1].kwargs["env"]["RSBUILD_CORS_ORIGIN"],
            "https://django.example.com",
        )

    def test_explicit_empty_rsbuild_cors_origin_disables_the_default(self):
        with patch.dict(run.os.environ, {"RSBUILD_CORS_ORIGIN": "https://django.example.com"}):
            run.run_parallel([], {"RSBUILD_CORS_ORIGIN": ""})
        self.assertEqual(self.popen.call_args_list[1].kwargs["env"]["RSBUILD_CORS_ORIGIN"], "")

    def test_explicit_backend_urls_override_generated_dev_locations(self):
        with patch.dict(run.os.environ, {
            "DJANGO_TS_BACKEND_URL": "https://api.example.com/",
            "DJANGO_TS_WS_BACKEND_URL": "wss://socket.example.com/",
        }):
            run.run_parallel([], {"DJANGO_TS_BACKEND_URL": "https://override.example.com/v1/"})
        django_env = self.popen.call_args_list[0].kwargs["env"]
        self.assertEqual(django_env["DJANGO_TS_BACKEND_URL"], "https://override.example.com/v1/")
        self.assertEqual(django_env["DJANGO_TS_WS_BACKEND_URL"], "wss://socket.example.com/")

    def test_celery_and_django_share_explicit_database_and_broker_configuration(self):
        run.run_parallel([], {
            "DJANGO_ENV_FILE": "/tmp/development.env",
            "DJANGO_DATABASE_NAME": "configured_dev_database",
            "CELERY_BROKER_URL": "sqla+sqlite:///configured-broker.sqlite3",
        })
        launches = self.popen.call_args_list
        for index in (0, 4):
            environment = launches[index].kwargs["env"]
            self.assertEqual(environment["DJANGO_ENV_FILE"], "/tmp/development.env")
            self.assertEqual(environment["DJANGO_DATABASE_NAME"], "configured_dev_database")
            self.assertEqual(environment["CELERY_BROKER_URL"], "sqla+sqlite:///configured-broker.sqlite3")

    def test_frontend_does_not_start_if_django_exits_before_installing_its_hup_handler(self):
        self.processes[0].poll.return_value = 1
        with patch.object(run.Path, "exists", return_value=False), self.assertRaises(SystemExit):
            run.run_parallel([], {})
        self.assertEqual(self.popen.call_count, 1)

    def test_invalid_or_conflicting_backend_ports_fail_before_starting_any_process(self):
        for envs in [
            {"TS_BACKEND_PORT": "8000"}, {"TS_WS_BACKEND_PORT": "8001"},
            {"TS_BACKEND_PORT": "invalid"}, {"TS_WS_BACKEND_PORT": "0"},
            {"TS_BACKEND_PORT": "65536"},
        ]:
            with self.subTest(envs=envs), self.assertRaises(SystemExit):
                run.run_parallel([], envs)
        self.popen.assert_not_called()

    def test_backend_runner_failure_stops_the_other_services_and_preserves_the_exit_code(self):
        self.sleep.side_effect = None
        self.processes[2].poll.return_value = 7
        with self.assertRaises(SystemExit) as error:
            run.run_parallel([], {})
        self.assertEqual(error.exception.code, 7)
        self.assertEqual(self.killpg.call_args_list, [call(proc.pid, signal.SIGTERM) for proc in self.processes])

    def test_partial_startup_failure_still_stops_already_started_services(self):
        self.popen.side_effect = [*self.processes[:2], OSError("npm unavailable")]
        with self.assertRaises(OSError):
            run.run_parallel([], {})
        self.assertEqual(self.killpg.call_args_list, [call(proc.pid, signal.SIGTERM) for proc in self.processes[:2]])

    def test_shutdown_reaps_a_slow_runner_even_if_its_group_exits_before_the_forced_kill(self):
        self.processes[2].wait.side_effect = [subprocess.TimeoutExpired("npm", 5), 0]

        def kill_group(pid, sig):
            if sig == signal.SIGKILL:
                raise ProcessLookupError

        self.killpg.side_effect = kill_group
        run.run_parallel([], {})
        self.assertIn(call(self.processes[2].pid, signal.SIGKILL), self.killpg.call_args_list)
        self.assertEqual(self.processes[2].wait.call_count, 2)
        self.processes[3].wait.assert_called_once_with(timeout=5)

    def test_setup_installs_dependencies_for_all_three_typescript_projects(self):
        with patch.object(run, "run_command") as command, patch.object(run.subprocess, "run"):
            run.setup()
        self.assertEqual(
            command.call_args_list[:3],
            [call(["npm", "install"], cwd=directory) for directory in (run.TS_DIR, run.TS_BACKEND_DIR, run.TS_WS_BACKEND_DIR)],
        )


if __name__ == "__main__":
    unittest.main()
