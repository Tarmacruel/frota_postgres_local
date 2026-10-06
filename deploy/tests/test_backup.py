"""Exercise backup recovery without Docker or production data (Linux CI)."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


@unittest.skipUnless(os.name == "posix", "requires Linux flock and tar")
class BackupTests(unittest.TestCase):
    def run_backup(self, running=True, failure="", locked=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ("state", "release", "backups", "uploads"):
                (root / name).mkdir()
            shutil.copyfile(Path(__file__).parents[1] / "scripts/backup.sh", root / "backup.sh")
            (root / "common.sh").write_text('''
frota_require_command() { :; }
frota_require_share_mount() { :; }
frota_die() { echo "$*" >&2; exit 1; }
frota_load_runtime() {
  FROTA_STATE_ROOT="$TEST_ROOT/state"
  FROTA_BACKUP_ROOT="$TEST_ROOT/backups"
  FROTA_UPLOADS_DIR="$TEST_ROOT/uploads"
  FROTA_ENV_FILE="$TEST_ROOT/env"
}
frota_state_value() {
  if [[ "$1" == FROTA_CURRENT_RELEASE ]]; then echo "$TEST_ROOT/release"; else echo test-image; fi
}
frota_env_value() { if [[ "$1" == FROTA_BACKUP_RETENTION ]]; then echo 2; else echo test; fi; }
frota_compose() {
  shift
  echo "$*" >> "$TEST_ROOT/events"
  case "$1" in
    ps) [[ "$TEST_RUNNING" == true ]] && echo container; return 0;;
    exec) [[ "$TEST_FAILURE" == dump ]] && return 1; echo database;;
  esac
  return 0
}
tar() {
  echo tar >> "$TEST_ROOT/events"
  [[ "$TEST_FAILURE" == uploads ]] && return 1
  command tar "$@"
}
''', encoding="utf-8")
            env = dict(os.environ, TEST_ROOT=str(root), TEST_RUNNING=str(running).lower(), TEST_FAILURE=failure)
            with (root / "state/release.lock").open("w") as lock:
                if locked:
                    import fcntl
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                result = subprocess.run(["bash", str(root / "backup.sh")], env=env, capture_output=True, text=True)
            events = (root / "events").read_text().splitlines() if (root / "events").exists() else []
            archives = list((root / "backups").glob("frota-backup-*.tar.gz"))
            self.assertEqual(bool(archives), not failure and not locked, result.stderr)
            return result, events

    def test_freezes_writes_until_both_snapshots_are_finished(self):
        result, events = self.run_backup()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertLess(events.index("stop app"), next(i for i, item in enumerate(events) if item.startswith("exec ")))
        self.assertLess(events.index("tar"), events.index("start app"))
        self.assertEqual(events.count("start app"), 1)

    def test_restart_after_dump_or_upload_failure(self):
        for failure in ("dump", "uploads"):
            with self.subTest(failure=failure):
                result, events = self.run_backup(failure=failure)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(events[-1], "start app")

    def test_already_stopped_app_stays_stopped(self):
        result, events = self.run_backup(running=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("stop app", events)
        self.assertNotIn("start app", events)

    def test_refuses_concurrent_release_or_backup(self):
        result, events = self.run_backup(locked=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(events, [])
