"""Existing tool health and unapplied setup are independent verification results."""
import hashlib
import os
import pathlib
import subprocess
import tempfile

repo = pathlib.Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix="mac-tweak-verification-") as temporary:
    root = pathlib.Path(temporary).resolve()
    home, fakebin = root / "home with spaces", root / "bin"
    home.mkdir()
    fakebin.mkdir()
    (home / ".zshrc").write_text("# existing startup content\n")
    for name, version in [("uv", "0.13.5"), ("uvx", "0.13.5"), ("tig", "2.6.1")]:
        (fakebin / name).write_text("#!/bin/sh\necho " + version + "\n")
        (fakebin / name).chmod(0o755)
    environment = dict(os.environ, HOME=str(home), PATH=str(fakebin) + ":/usr/bin:/bin:/usr/sbin:/sbin")

    def snapshot():
        return {str(path.relative_to(home)): (path.lstat().st_mode, path.lstat().st_mtime_ns,
                str(path.readlink()) if path.is_symlink() else hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None)
                for path in home.rglob("*")}

    def run(action, selection):
        result = subprocess.run(["/bin/bash", str(repo / "tweak.sh"), action, "--with", selection,
                                 *(["--yes"] if action == "apply" else [])], env=environment, capture_output=True, text=True, timeout=30)
        return result.returncode, result.stdout + result.stderr

    before = snapshot()
    code, output = run("verify", "uv,tig")
    assert code != 0 and "PASS [uv]" in output and "PASS [tig]" in output, output
    assert "PENDING [local-bin-path]" in output and "PENDING [shell-integration]" in output, output
    assert "Verification incomplete:" in output and "FAIL [" not in output, output
    assert snapshot() == before and not (home / ".local").exists()
    code, output = run("verify", "aliases")
    assert code != 0 and "PENDING [aliases]" in output and "PASS [aliases]" not in output, output
    assert snapshot() == before
    code, output = run("apply", "uv,tig,aliases")
    assert code == 0 and "Downloading" not in output, output
    installed = snapshot()
    code, output = run("verify", "uv,tig,aliases")
    assert code == 0 and "PASS [uv]" in output and "PASS [tig]" in output and "PASS [aliases]" in output, output
    assert "PENDING [" not in output and snapshot() == installed
    assert (home / ".zshrc").read_text().startswith("# existing startup content\n")
print("PASS: verification distinguishes working external tools from pending integration, stays read-only, and passes after application")
