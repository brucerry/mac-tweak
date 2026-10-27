"""Force interruption and external preference drift; only disposable stores are used."""
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import time

repo = Path(__file__).resolve().parent.parent
for sig in [signal.SIGTERM, signal.SIGKILL]:
    with tempfile.TemporaryDirectory(prefix="mac-tweak-preference-interruption-") as temporary:
        root = Path(temporary).resolve(); home = root / "home"; home.mkdir()
        store = root / "store.json"
        store.write_text(json.dumps({"version": 1, "values": {"dock-size": {"present": True, "type": "real", "value": 37}}, "pauseAfter": "dock-autohide"}))
        env = dict(os.environ, HOME=str(home), MAC_TWEAK_PREFERENCES_TEST="1", MAC_TWEAK_PREFERENCE_STORE=str(store))
        cmd = ["/bin/bash", str(repo / "tweak.sh")]
        process = subprocess.Popen([*cmd, "apply", "--with", "dock", "--yes"], env=env, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, text=True, start_new_session=True)
        try:
            deadline = time.monotonic() + 15
            while not Path(str(store) + ".paused").exists():
                assert process.poll() is None, process.communicate()[0]
                assert time.monotonic() < deadline, "Preference barrier timeout"
                time.sleep(0.02)
            os.killpg(process.pid, sig)
            output = process.communicate(timeout=15)[0]
            assert process.returncode != 0
            run = next((home / ".local/state/mac-tweak/runs").iterdir())
            snapshot = json.loads((run / "preferences.json").read_text())
            originals = {row["id"]: row["original"]["state"] for row in snapshot["originals"]}
            assert originals["dock-autohide"] == {"present": False}
            assert originals["dock-size"]["value"] == 37
            state = json.loads(store.read_text())
            assert state["values"]["dock-autohide"]["value"] is True
            assert state["values"]["dock-size"]["value"] == 37
            assert json.loads((run / "preferences-results/dock-autohide.json").read_text())["status"] == "attempted"
            if sig == signal.SIGTERM: assert "Run interrupted" in output
            else:
                lock = home / ".local/state/mac-tweak/lock"
                assert lock.is_dir()
                blocked = subprocess.run([*cmd, "apply", "--with", "dock", "--yes"], env=env, capture_output=True, text=True)
                assert blocked.returncode != 0 and "Another application holds" in blocked.stderr
                (lock / "pid").unlink(); lock.rmdir()
            state.pop("pauseAfter"); store.write_text(json.dumps(state))
            retry = subprocess.run([*cmd, "apply", "--with", "dock", "--yes"], env=env, capture_output=True, text=True)
            assert retry.returncode == 0, retry.stdout + retry.stderr
            repeated = subprocess.run([*cmd, "apply", "--with", "dock", "--yes"], env=env, capture_output=True, text=True)
            assert repeated.returncode == 0 and "Nothing to change" in repeated.stdout
            print("PASS: preference", sig.name, "preserves originals and uncertain outcomes; lock handling, retry, and no-op pass", flush=True)
        finally:
            if process.poll() is None: os.killpg(process.pid, signal.SIGKILL); process.communicate()

with tempfile.TemporaryDirectory(prefix="mac-tweak-preference-download-race-") as temporary:
    root = Path(temporary).resolve(); home = root / "home"; home.mkdir()
    checkout = root / "checkout"; checkout.mkdir()
    shutil.copy2(repo / "tweak.sh", checkout / "tweak.sh"); shutil.copytree(repo / "src", checkout / "src")
    archive = root / "node.tar.gz"; manifest = checkout / "src/catalog/releases.txt"
    version = next(line.split("|")[1] for line in manifest.read_text().splitlines() if line.startswith("node|"))
    with tarfile.open(archive, "w:gz") as output:
        for name in ["node", "npm", "npx"]:
            body = ("#!/bin/sh\necho " + version + "\n").encode()
            member = tarfile.TarInfo("node-fixture/bin/" + name); member.mode = 0o755; member.size = len(body)
            output.addfile(member, io.BytesIO(body))
    rows = []
    for line in manifest.read_text().splitlines():
        if line.startswith("node|"):
            fields = line.split("|"); fields[8] = hashlib.sha256(archive.read_bytes()).hexdigest(); fields[9] = "node-fixture"; line = "|".join(fields)
        rows.append(line)
    manifest.write_text("\n".join(rows) + "\n")
    store = root / "store.json"; store.write_text('{"version":1,"values":{}}')
    downloader = root / "download.py"
    downloader.write_text('''import json,os,pathlib,shutil,sys
p=pathlib.Path(os.environ['MAC_TWEAK_PREFERENCE_STORE']); v=json.loads(p.read_text())
v['values']['dock-size']={'present':True,'type':'real','value':73}; p.write_text(json.dumps(v))
shutil.copyfile(os.environ['PREFERENCE_ARCHIVE'],sys.argv[1])
''')
    fakebin = root / "bin"; fakebin.mkdir()
    curl = fakebin / "curl"
    curl.write_text('#!/bin/bash\nwhile test "$#" -gt 0; do if test "$1" = --output; then output="$2"; shift 2; else shift; fi; done\nexec ' + shlex.quote(sys.executable) + ' ' + shlex.quote(str(downloader)) + ' "$output"\n'); curl.chmod(0o755)
    env = dict(os.environ, HOME=str(home), PATH=str(fakebin) + ":/usr/bin:/bin:/usr/sbin:/sbin", MAC_TWEAK_PREFERENCES_TEST="1",
               MAC_TWEAK_PREFERENCE_STORE=str(store), PREFERENCE_ARCHIVE=str(archive))
    result = subprocess.run(["/bin/bash", str(checkout / "tweak.sh"), "apply", "--with", "node,dock", "--yes"], env=env, capture_output=True, text=True, timeout=40)
    text = result.stdout + result.stderr
    assert result.returncode != 0 and "DONE [node]" in text and "Preference changed after preview" in text, text
    state = json.loads(store.read_text())
    assert not state.get("writes") and state["values"]["dock-size"]["value"] == 73
    assert (home / ".local/bin/node").exists()
    assert "UNATTEMPTED [dock]" in text
    print("PASS: preference drift during an earlier tool download stops preference writes while retaining accurate partial results", flush=True)
