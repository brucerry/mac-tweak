"""Preference lifecycle tests use an explicit file store, never real macOS domains."""
import base64
import copy
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

REPO = Path(__file__).resolve().parent.parent


def run_checks():
    with tempfile.TemporaryDirectory(prefix="mac-tweak-preferences-") as temporary:
        root = Path(temporary).resolve()
        home = root / "home with spaces"
        home.mkdir()
        store = root / "store.json"
        initial = {"version": 1, "values": {
            "dock-recent": {"present": True, "type": "boolean", "value": False},
            "dock-size": {"present": True, "type": "real", "value": 0},
            "keyboard-repeat": {"present": True, "type": "integer", "value": 2},
        }}
        environment = dict(os.environ, HOME=str(home), PATH="/usr/bin:/bin:/usr/sbin:/sbin", MAC_TWEAK_PREFERENCES_TEST="1", MAC_TWEAK_PREFERENCE_STORE=str(store))

        def put(value):
            store.write_text(json.dumps(value) + "\n")

        def bridge(*args, success=True, env=None):
            result = subprocess.run(["/usr/bin/osascript", "-l", "JavaScript", str(REPO / "src/preferences/bridge.js"),
                                     str(REPO / "src"), *map(str, args)], env=env or environment, capture_output=True, text=True, timeout=30)
            assert (result.returncode == 0) == success, result.stdout + result.stderr
            return result.stdout if success else result.stdout + result.stderr

        def plan(*args, **kwargs):
            text = bridge("plan", *(args or ("dock", "-", "27.0.1")), **kwargs)
            marker = re.search(r"^__PREFERENCES_PLAN__\|([0-9]+)\|([^\n]+)$", text, re.M)
            assert marker, text
            decoded = json.loads(base64.b64decode(marker[2]))
            assert len(decoded["actions"]) == int(marker[1])
            return marker[2], decoded, text

        put(initial)
        before = store.read_bytes()
        observed = json.loads(bridge("inspect"))
        by_id = {row["id"]: row["state"] for row in observed}
        assert by_id["dock-recent"]["stored"]["value"] is False
        assert by_id["dock-size"]["stored"]["value"] == 0
        assert by_id["keyboard-repeat"]["stored"]["type"] == "integer"
        assert by_id["screenshots-format"]["stored"] == {"present": False}
        encoded, decoded, output = plan()
        assert store.read_bytes() == before
        assert "real 0 -> real 49" in output
        bridge("check", encoded)
        changed = copy.deepcopy(initial)
        changed["values"]["dock-size"]["value"] = 30
        put(changed)
        assert "changed after preview" in bridge("check", encoded, success=False)
        for field, value, expected in [
            ("forced", ["dock-size"], "Managed policy"),
            ("host", {"dock-size": {"present": True, "type": "real", "value": 70}}, "host-specific"),
            ("errors", ["dock-size"], "Cannot inspect"),
        ]:
            data = copy.deepcopy(initial)
            data[field] = value
            put(data)
            assert expected.lower() in bridge("plan", "dock", "-", "27.0.1", success=False).lower()
        data = copy.deepcopy(initial)
        data["values"]["dock-size"] = {"present": True, "type": "string", "value": "bad"}
        put(data)
        assert "Unsupported stored" in bridge("inspect", success=False)
        put(initial)
        assert "Unsupported macOS" in bridge("plan", "dock", "-", "28.0", success=False)
        assert "Invalid encoded" in bridge("check", "invalid|data", success=False)
        altered = copy.deepcopy(decoded)
        altered["actions"][0]["component"] = "unknown"
        bad = base64.b64encode(json.dumps(altered).encode()).decode()
        assert "Invalid retained" in bridge("check", bad, success=False)
        assert "injected store" in bridge("inspect", success=False, env=dict(environment, MAC_TWEAK_PREFERENCE_STORE=""))
        assert "Injected preferences require" in bridge("inspect", success=False, env=dict(environment, MAC_TWEAK_PREFERENCES_TEST="0"))
        assert store.read_bytes() == before
        print("PASS: isolated preference inspection, scalar types, absence, policy/host/read/type conflicts, stale plans, protocol validation, and production-write guards", flush=True)

        serial = 0

        def run_directory():
            nonlocal serial
            serial += 1
            directory = home / ".local/state/mac-tweak/runs" / ("20261026T000000Z-" + str(serial))
            directory.mkdir(parents=True, mode=0o700)
            return directory

        put(initial)
        encoded, decoded, _ = plan()
        directory = run_directory()
        bridge("snapshot", encoded, directory)
        assert "already exists" in bridge("snapshot", encoded, directory, success=False)
        assert "Invalid preference run" in bridge("snapshot", encoded, root, success=False)
        snapshot = json.loads((directory / "preferences.json").read_text())
        assert len(snapshot["originals"]) == len(decoded["actions"])
        assert {p["domain"] for p in snapshot["originals"]} == {"com.apple.dock"}
        originals = {p["id"]: p for p in snapshot["originals"]}
        assert originals["dock-size"]["original"]["state"] == {"present": True, "type": "real", "value": 0}
        assert originals["dock-autohide"]["original"]["state"] == {"present": False}
        assert all(p["scope"] == "current-user-any-host" for p in snapshot["originals"])
        assert (directory / "preferences.json").stat().st_mode & 0o777 == 0o600
        assert store.read_bytes() == before
        for i, action in enumerate(decoded["actions"]):
            bridge("apply", encoded, i, directory)
            result = json.loads((directory / "preferences-results" / (action["id"] + ".json")).read_text())
            assert result["status"] == "saved"
        assert not plan()[1]["actions"]
        assert "already attempted" in bridge("apply", encoded, 0, directory, success=False)
        for field, error in [("failWrite", "write failure"), ("failSync", "synchronization failed"), ("failReadback", "readback failed")]:
            data = copy.deepcopy(initial)
            data[field] = ["dock-size"]
            put(data)
            encoded, decoded, _ = plan()
            directory = run_directory()
            bridge("snapshot", encoded, directory)
            index = next(i for i, a in enumerate(decoded["actions"]) if a["id"] == "dock-size")
            assert error in bridge("apply", encoded, index, directory, success=False)
            record = json.loads((directory / "preferences-results/dock-size.json").read_text())
            assert record["status"] == "uncertain"
            if field == "failWrite": assert json.loads(store.read_text())["values"]["dock-size"]["value"] == 0
        put(initial)
        encoded, decoded, _ = plan()
        directory = run_directory()
        (directory / "preferences-results").mkdir()
        assert "already exists" in bridge("snapshot", encoded, directory, success=False)
        assert store.read_bytes() == before
        request = root / "values.json"
        request.write_text(json.dumps({"version": 1, "values": [{"id": "dock-size", "mode": "default"}]}))
        encoded, decoded, _ = plan("dock", request, "27.0.1")
        directory = run_directory(); bridge("snapshot", encoded, directory)
        index = next(i for i, a in enumerate(decoded["actions"]) if a["id"] == "dock-size")
        bridge("apply", encoded, index, directory)
        assert "dock-size" not in json.loads(store.read_text())["values"]
        print("PASS: isolated typed snapshots, set/delete, private records, repeat no-op, backup/write/sync/readback failures, and original preservation", flush=True)

        def cli(*args, success=True, env=None):
            result = subprocess.run(["/bin/bash", str(REPO / "tweak.sh"), *map(str, args)], env=env or environment,
                                    capture_output=True, text=True, timeout=40)
            assert (result.returncode == 0) == success, result.stdout + result.stderr
            return result.stdout + result.stderr

        put(initial)
        home_before = sorted(str(p.relative_to(home)) for p in home.rglob("*"))
        for component in ["finder", "dock", "keyboard", "screenshots"]:
            text = cli("plan", "--with", component, env=dict(environment, ZDOTDIR=str(root / "custom dotfiles")))
            assert "shell-integration" not in text and "INSTALL [" not in text and "local-bin-path" not in text
            assert "Selection: " + component in text
        assert sorted(str(p.relative_to(home)) for p in home.rglob("*")) == home_before
        assert "Custom ZDOTDIR is unsupported" in cli("plan", "--with", "aliases", success=False,
                                                     env=dict(environment, ZDOTDIR=str(root / "custom dotfiles")))
        print("PASS: preference kind dispatch, four independent components, read-only plans, and shell-only ZDOTDIR protections", flush=True)

        def session(*args, change=None, approval="cancel"):
            process = subprocess.Popen(["/bin/bash", str(REPO / "tweak.sh"), "review-session", *map(str, args)], env=environment,
                                       stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            lines = []
            for line in process.stdout:
                lines.append(line)
                if line.startswith("__MAC_TWEAK_REVIEW_READY__|"):
                    if change: change()
                    token = line.split("|")[1]
                    process.stdin.write(("apply:" + token if approval == "apply" else approval) + "\n")
                    process.stdin.flush()
                    break
            process.stdin.close()
            lines.extend(process.stdout.readlines())
            code = process.wait(timeout=30)
            return code, "".join(lines)

        request.write_text(json.dumps({"version": 1, "values": [{"id": "dock-size", "mode": "set", "value": 63}]}))
        text = cli("plan", "--with", "dock", "--preferences-file", request)
        assert "real 63" in text
        arguments = ("--with", "dock", "--preferences-file", request)
        original = store.read_bytes()
        code, text = session(*arguments)
        assert code == 0 and "Cancelled" in text and store.read_bytes() == original
        code, text = session(*arguments, approval="apply:wrong-token")
        assert code != 0 and "does not match" in text and store.read_bytes() == original
        code, text = session(*arguments, approval="apply", change=lambda: request.write_text(json.dumps({"version": 1, "values": []})))
        assert code != 0 and "Target changed after preview" in text and store.read_bytes() == original
        request.write_text(json.dumps({"version": 1, "values": [{"id": "keyboard-repeat", "mode": "set", "value": 3}]}))
        assert "unselected preference" in cli("plan", *arguments, success=False)
        request.write_text("{" + " " * 140000 + "}")
        assert "bounded preference data" in cli("plan", *arguments, success=False)
        request.write_text("broken JSON")
        assert "BLOCKED" in cli("plan", *arguments, success=False)
        request.write_text(json.dumps({"version": 1, "values": []}))
        assert "require a selected preference group" in cli("plan", "--with", "aliases", "--preferences-file", request, success=False)
        assert store.read_bytes() == original
        print("PASS: preference override inputs, retained approval, cancellation, wrong tokens, stale input, and unselected/oversized/malformed rejection", flush=True)

        put(initial)
        mixed = cli("plan", "--with", "aliases,dock")
        assert "PREFERENCE_CHANGE [dock]" in mixed and "CHANGE [aliases]" in mixed
        assert "preference change(s)" in mixed and "configuration change(s)" in mixed
        assert "real 0 -> real 49" in mixed and "REFRESH [dock]" in mixed
        directories_before = sorted(str(p.relative_to(home)) for p in home.rglob("*"))
        for change_kind in ["value", "policy", "host"]:
            put(initial)

            def change_preference():
                value = copy.deepcopy(initial)
                if change_kind == "value": value["values"]["dock-size"]["value"] = 65
                elif change_kind == "policy": value["forced"] = ["dock-size"]
                else: value["host"] = {"dock-size": {"present": True, "type": "real", "value": 65}}
                put(value)

            code, text = session("--with", "aliases,dock", approval="apply", change=change_preference)
            assert code != 0 and "Preference changed after preview" in text
            assert not json.loads(store.read_text()).get("writes")
            assert sorted(str(p.relative_to(home)) for p in home.rglob("*")) == directories_before
        blocked = copy.deepcopy(initial); blocked["forced"] = ["dock-size"]; put(blocked)
        text = cli("apply", "--with", "aliases,dock", "--yes", success=False)
        assert "Managed policy" in text and "BLOCKED" in text
        assert not (home / ".zshrc").exists() and not json.loads(store.read_text()).get("writes")
        put(initial)
        print("PASS: mixed typed plans, separate counts, refresh guidance, whole-selection policy preflight, and stale value/policy/host observations", flush=True)

        system = cli("plan", "--preset", "system")
        assert "Selection: finder dock keyboard screenshots" in system and "shell-integration" not in system
        full = cli("plan", "--preset", "full", "--without", "tig")
        assert "finder dock keyboard screenshots" in full and "Dependency: local-bin-path" in full
        customized = cli("plan", "--preset", "full", "--without", "tig,prompt,dock")
        selected = re.search(r"^Selection: (.*)$", customized, re.M)[1].split()
        assert "dock" not in selected and "prompt" not in selected and "finder" in selected
        assert selected.count("local-bin-path") == 1
        assert "Selection: prompt aliases colors" in cli("plan", "--preset", "terminal")
        assert "Selection: local-bin-path node uv gh" in cli("plan", "--preset", "development", "--without", "tig")
        assert "Automatically hide: true" in cli("info", "dock")
        assert "--preferences-file" in cli("--help")
        print("PASS: System and expanded Full presets, exclusions, dependencies, unchanged legacy presets, and discoverable preference info", flush=True)

        put(initial)
        applied = cli("apply", "--with", "dock", "--yes")
        assert "DONE [dock] dock-size" in applied
        created = Path(re.search(r"Run records and recovery information: (.*)", applied)[1])
        record = json.loads((created / "preferences.json").read_text())
        assert all(p["domain"] == "com.apple.dock" for p in record["originals"])
        assert len(json.loads(store.read_text())["writes"]) == len(record["originals"])
        for failure in ["failWrite", "failSync", "failReadback"]:
            data = copy.deepcopy(initial); data[failure] = ["dock-size"]; put(data)
            result = cli("apply", "--with", "dock", "--yes", success=False)
            assert "DONE [dock] dock-autohide" in result
            assert "FAILED [dock] dock-size" in result and "UNATTEMPTED [dock] dock-magnification" in result
            failed_run = Path(re.search(r"Run records and recovery information: (.*)", result)[1])
            assert (failed_run / "preferences.json").is_file()
            status = json.loads((failed_run / "preferences-results/dock-size.json").read_text())
            assert status["status"] == "uncertain"
            current = json.loads(store.read_text())
            current.pop(failure); put(current)
            assert "Application complete" in cli("apply", "--with", "dock", "--yes")
        fakebin = root / "bin"; fakebin.mkdir()
        blocker = fakebin / "mkdir"
        blocker.write_text('''#!/bin/bash
/bin/mkdir "$@" || exit $?
for path; do
 case "$path" in */runs/*/stage) /bin/mkdir "${path%/stage}/preferences.json" ;; esac
done
''')
        blocker.chmod(0o755)
        put(initial)
        result = cli("apply", "--with", "dock", "--yes", success=False,
                     env=dict(environment, PATH=str(fakebin) + ":/usr/bin:/bin:/usr/sbin:/sbin"))
        assert "no preference writes started" in result and not json.loads(store.read_text()).get("writes")
        print("PASS: reviewed CLI preference application, snapshots before writes, staged backup failure, partial failures, records, and retry", flush=True)

        put(initial)
        original = store.read_bytes()
        pending = cli("verify", "--with", "dock", success=False)
        assert "PENDING [dock]" in pending and "Verification incomplete" in pending and store.read_bytes() == original
        cli("apply", "--with", "dock", "--yes")
        state_before = store.read_bytes()
        runs = home / ".local/state/mac-tweak/runs"; run_count = len(list(runs.iterdir()))
        verified = cli("verify", "--with", "dock")
        assert "PASS [dock]" in verified and "active process refresh is not verified" in verified
        assert "Nothing to change" in cli("apply", "--with", "dock", "--yes")
        assert store.read_bytes() == state_before and len(list(runs.iterdir())) == run_count
        assert "PASS [screenshots]" in cli("verify", "--with", "screenshots")
        drift = json.loads(store.read_text()); drift["values"]["dock-size"]["value"] = 60; put(drift)
        assert "PENDING [dock]" in cli("verify", "--with", "dock", success=False)
        drift["errors"] = ["dock-size"]; put(drift)
        assert "FAIL [system-preferences]" in cli("verify", "--with", "dock", success=False)
        print("PASS: read-only saved-state verification, pending drift, inspection failures, Keep current, and no-op application without extra writes or backups", flush=True)

        put(initial)
        encoded, decoded, _ = plan()
        directory = run_directory(); missing = root / "must-not-be-created"
        (directory / "preferences.json").symlink_to(missing)
        assert "already exists" in bridge("snapshot", encoded, directory, success=False)
        assert not missing.exists() and not json.loads(store.read_text()).get("writes")
        directory = run_directory(); bridge("snapshot", encoded, directory)
        first = decoded["actions"][0]["id"]
        (directory / "preferences-results" / (first + ".json")).symlink_to(missing)
        assert "already attempted" in bridge("apply", encoded, 0, directory, success=False)
        assert not missing.exists() and not json.loads(store.read_text()).get("writes")
        assert "Invalid preference record path" in bridge("recover-plan", directory, "27.0.1", success=False)
        print("PASS: dangling snapshot/outcome links cannot redirect writes or hide invalid recovery records", flush=True)


if __name__ == "__main__":
    run_checks()
