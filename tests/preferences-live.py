"""Opt-in native CFPreferences checks restricted to a unique private UUID domain."""
import os
from pathlib import Path
import subprocess
import uuid

repo = Path(__file__).resolve().parent.parent
if os.environ.get("MAC_TWEAK_PREFERENCES_LIVE_TEST") != "1":
    raise SystemExit("Set MAC_TWEAK_PREFERENCES_LIVE_TEST=1 to test a fresh private domain.")
domain = "org.macossetup.test." + str(uuid.uuid4())
environment = dict(os.environ, MAC_TWEAK_PREFERENCES_NATIVE_DOMAIN=domain)
for key in ["MAC_TWEAK_PREFERENCE_STORE", "MAC_TWEAK_PREFERENCES_TEST"]:
    environment.pop(key, None)
command = ["/usr/bin/osascript", "-l", "JavaScript", str(repo / "src/preferences/bridge.js"), str(repo / "src"), "native-smoke"]
for denied in ["com.apple.dock", "NSGlobalDomain", "com.apple.finder", "com.apple.screencapture", "com.apple.screensaver", "com.apple.wallpaper.agent", "org.macossetup.test.not-a-uuid", ""]:
    result = subprocess.run(command, env=dict(environment, MAC_TWEAK_PREFERENCES_NATIVE_DOMAIN=denied), capture_output=True, text=True, timeout=20)
    assert result.returncode != 0, (denied, result.stdout, result.stderr)
result = subprocess.run(command, env=environment, capture_output=True, text=True, timeout=30)
assert result.returncode == 0 and "PASS:" in result.stdout, result.stdout + result.stderr
print(result.stdout.strip())
print("PASS: native test adapter rejects production domains and cleans up its private test keys")
