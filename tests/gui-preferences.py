"""Native preference-window tests use a guarded injected store in every appearance."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

repo = Path(__file__).resolve().parent.parent
for appearance, mode in [(a, m) for a in ["light", "dark"] for m in ["preference-layout", "preference-editor", "repair-preferences-accept", "repair-preferences-cancel", "repair-preferences-details", "repair-preferences-stale", "repair-preferences-policy", "repair-preferences-failure", "repair-preferences-keep"]]:
    with tempfile.TemporaryDirectory(prefix="mac-tweak-preferences-gui-") as temporary:
        root = Path(temporary).resolve(); home = root / "home with spaces"; home.mkdir()
        store = root / "store.json"
        initial = {"version": 1, "values": {}}
        if mode == "repair-preferences-policy": initial["forced"] = ["dock-size"]
        if mode == "repair-preferences-failure": initial["failSync"] = ["dock-size"]
        store.write_text(json.dumps(initial))
        env = dict(os.environ, HOME=str(home), PATH="/usr/bin:/bin:/usr/sbin:/sbin", MAC_TWEAK_GUI_TEST="1",
                   MAC_TWEAK_GUI_APPEARANCE=appearance, MAC_TWEAK_PREFERENCES_TEST="1", MAC_TWEAK_PREFERENCE_STORE=str(store))
        result = subprocess.run(["/bin/bash", str(repo / "tweak.sh"), "gui", "--smoke-" + mode], env=env,
                                capture_output=True, text=True, timeout=40)
        text = result.stdout + result.stderr
        assert result.returncode == 0 and "PASS: native preference" in text and "FAIL:" not in text, text
        current = json.loads(store.read_text())
        if mode in ["repair-preferences-accept", "repair-preferences-details", "repair-preferences-failure"]:
            assert current["values"]["dock-size"]["value"] == 64 and current.get("writes")
            assert (home / ".local/state/mac-tweak/runs").is_dir()
            if mode == "repair-preferences-failure":
                outcomes = list((home / ".local/state/mac-tweak/runs").glob("*/preferences-results/dock-size.json"))
                assert any(json.loads(p.read_text())["status"] == "uncertain" for p in outcomes)
        elif mode == "repair-preferences-stale":
            assert current["values"]["dock-size"]["value"] == 72 and not current.get("writes")
            assert not (home / ".local/state").exists()
        else:
            assert current == initial and not (home / ".local/state").exists()
        assert not (home / ".zshrc").exists() and not (home / ".config").exists()
        print(appearance + ": " + text.strip(), flush=True)
