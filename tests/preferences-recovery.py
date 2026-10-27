"""Explicit recovery restores typed keys and refuses later edits or uncertain writes."""
import copy
import errno
import json
import os
from pathlib import Path
import pty
import re
import select
import shutil
import signal
import subprocess
import tempfile
import time

repo = Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix="mac-tweak-preference-recovery-") as temporary:
    root = Path(temporary).resolve(); home = root / "home with spaces"; home.mkdir()
    store = root / "store.json"
    initial = {"version": 1, "values": {
        "dock-size": {"present": True, "type": "real", "value": 400},
        "dock-autohide": {"present": True, "type": "boolean", "value": False},
        "dock-position": {"present": True, "type": "string", "value": "old-custom-position"},
        "unrelated": {"present": True, "type": "string", "value": "preserve this"},
    }}
    environment = dict(os.environ, HOME=str(home), MAC_TWEAK_PREFERENCES_TEST="1", MAC_TWEAK_PREFERENCE_STORE=str(store))
    command = ["/bin/bash", str(repo / "tweak.sh")]

    def put(data): store.write_text(json.dumps(data) + "\n")

    def cli(*args, success=True):
        result = subprocess.run([*command, *map(str, args)], env=environment, capture_output=True, text=True, timeout=30)
        assert (result.returncode == 0) == success, result.stdout + result.stderr
        return result.stdout + result.stderr

    def apply():
        text = cli("apply", "--with", "dock", "--yes")
        return Path(re.search(r"Run records and recovery information: (.*)", text)[1])

    def interactive(run, answer, change=None):
        master, slave = pty.openpty()
        process = subprocess.Popen([*command, "recover-preferences", "--run", run.name], env=environment,
                                   stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
        os.close(slave); output = b""; sent = False; deadline = time.monotonic() + 25
        try:
            while time.monotonic() < deadline:
                ready, _, _ = select.select([master], [], [], 0.1)
                if ready:
                    try: data = os.read(master, 65536)
                    except OSError as error:
                        if error.errno == errno.EIO: break
                        raise
                    if not data: break
                    output += data
                if b"Apply this plan?" in output and not sent:
                    if change: change()
                    os.write(master, answer.encode() + b"\n"); sent = True
                if process.poll() is not None and not ready: break
            assert sent, output.decode()
            result = process.wait(timeout=5)
            return result, output.decode()
        finally:
            if process.poll() is None: os.killpg(process.pid, signal.SIGKILL); process.wait()
            os.close(master)

    put(initial); run = apply()
    before = store.read_bytes(); count = len(list(run.parent.iterdir()))
    code, text = interactive(run, "n")
    assert code == 0 and "Cancelled" in text and store.read_bytes() == before
    assert len(list(run.parent.iterdir())) == count
    restored = cli("recover-preferences", "--run", run.name, "--yes")
    recovered_run = Path(re.search(r"Run records and recovery information: (.*)", restored)[1])
    assert recovered_run != run and (recovered_run / "preferences.json").is_file()
    assert json.loads(store.read_text())["values"] == initial["values"]
    snapshot = json.loads((recovered_run / "preferences.json").read_text())
    assert snapshot["plan"]["recovery"] is True
    assert "unrelated" not in (recovered_run / "preferences.json").read_text()
    print("PASS: explicit recovery cancellation and typed real/boolean/string/absence restoration, including originals outside editor bounds", flush=True)

    run = apply()
    later = json.loads(store.read_text()); later["values"]["dock-size"]["value"] = 80; put(later)
    before = store.read_bytes()
    assert "Later preference edit" in cli("recover-preferences", "--run", run.name, "--yes", success=False)
    assert store.read_bytes() == before
    put(initial); run = apply()

    def edit_after_review():
        later = json.loads(store.read_text()); later["values"]["dock-size"]["value"] = 81; put(later)

    code, text = interactive(run, "y", edit_after_review)
    assert code != 0 and "Preference changed after preview" in text, text
    assert json.loads(store.read_text())["values"]["dock-size"]["value"] == 81
    print("PASS: later-edit conflicts and stale recovery approval preserve the newer values", flush=True)

    put(initial); run = apply()
    corrupt = run.parent / "20261026T000000Z-99999"; shutil.copytree(run, corrupt)
    backup = json.loads((corrupt / "preferences.json").read_text())
    backup["originals"][0]["domain"] = "com.apple.not-allowed"
    (corrupt / "preferences.json").write_text(json.dumps(backup))
    before = store.read_bytes()
    assert "Invalid preference recovery identity" in cli("recover-preferences", "--run", corrupt.name, "--yes", success=False)
    redirected = run.parent / "20261026T000000Z-99998"; redirected.symlink_to(run, target_is_directory=True)
    assert "Symlink conflict" in cli("recover-preferences", "--run", redirected.name, "--yes", success=False)
    assert "valid --run" in cli("recover-preferences", "--run", "../other", "--yes", success=False)
    assert store.read_bytes() == before
    uncertain = copy.deepcopy(initial); uncertain["failSync"] = ["dock-size"]; put(uncertain)
    text = cli("apply", "--with", "dock", "--yes", success=False)
    failed_run = Path(re.search(r"Run records and recovery information: (.*)", text)[1])
    before = store.read_bytes()
    assert "Unknown preference outcome" in cli("recover-preferences", "--run", failed_run.name, "--yes", success=False)
    assert store.read_bytes() == before
    print("PASS: recovery path/identity validation, redirected records, unknown outcomes, and unrelated-key preservation", flush=True)
