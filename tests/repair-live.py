"""Opt-in real Node replacement with preserved external commands and payload."""
import hashlib
import os
import pathlib
import shutil
import subprocess
import tempfile

assert os.environ.get("MAC_TWEAK_LIVE_TEST") == "1", "Set MAC_TWEAK_LIVE_TEST=1 for disposable live repair validation."
source = pathlib.Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix="mac-tweak-repair-live-") as temporary:
    root = pathlib.Path(temporary).resolve()
    seed_repo, seed_home, home = root / "seed checkout", root / "external home", root / "repair home with spaces"
    seed_repo.mkdir(); seed_home.mkdir(); home.mkdir()
    shutil.copy2(source / "tweak.sh", seed_repo / "tweak.sh"); shutil.copytree(source / "src", seed_repo / "src")
    prepared = subprocess.run(["python3", str(source / "tests/previous-node.py"), str(seed_repo)], capture_output=True, text=True, timeout=90)
    assert prepared.returncode == 0, prepared.stdout + prepared.stderr
    seeded = subprocess.run(["/bin/bash", str(seed_repo / "tweak.sh"), "apply", "--with", "node", "--yes"],
                            env=dict(os.environ, HOME=str(seed_home), PATH="/usr/bin:/bin:/usr/sbin:/sbin"), capture_output=True, text=True, timeout=900)
    assert seeded.returncode == 0, seeded.stdout + seeded.stderr
    old = seed_home / ".local/opt/mac-tweak/node/24.22.0"
    original = hashlib.sha256((old / "bin/node").read_bytes()).hexdigest()
    (home / ".local/bin").mkdir(parents=True)
    links = {}
    for command in ["node", "npm", "npx"]:
        links[command] = os.path.relpath(old / ("bin/" + command), home / ".local/bin")
        (home / (".local/bin/" + command)).symlink_to(links[command])
    environment = dict(os.environ, HOME=str(home), PATH=str(home / ".local/bin") + ":/usr/bin:/bin:/usr/sbin:/sbin")
    proc = subprocess.Popen(["/bin/bash", str(source / "tweak.sh"), "repair-session", "--with", "node"], env=environment,
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    output = ""
    for line in proc.stdout:
        output += line
        if line.startswith("__MAC_TWEAK_REPAIR_READY__|"):
            token = line.split("|")[1]; break
    else: raise AssertionError(output)
    assert not (home / ".local/state").exists()
    assert all(str((home / (".local/bin/" + command)).readlink()) == target for command, target in links.items())
    proc.stdin.write("repair:" + token + "\n"); proc.stdin.flush(); proc.stdin.close()
    output += proc.stdout.read(); code = proc.wait(timeout=900)
    assert code == 0, output
    verified = subprocess.run(["/bin/bash", str(source / "tweak.sh"), "verify", "--with", "node"], env=environment, capture_output=True, text=True, timeout=60)
    assert verified.returncode == 0, verified.stdout + verified.stderr
    assert hashlib.sha256((old / "bin/node").read_bytes()).hexdigest() == original
    assert subprocess.check_output([str(old / "bin/node"), "--version"], env=environment, text=True).strip() == "v24.22.0"
    assert subprocess.check_output([str(home / ".local/bin/node"), "--version"], env=environment, text=True).strip() == "v24.22.1"
    records = list((home / ".local/state/mac-tweak/runs").glob("*/events.txt"))
    backups = {line.split("|")[1]: pathlib.Path(line.split("|")[2]) for p in records for line in p.read_text().splitlines() if line.startswith("preserved-command|")}
    assert len(backups) == 3
    for command, target in links.items(): assert str(backups[str(home / (".local/bin/" + command))].readlink()) == target
    repeated = subprocess.run(["/bin/bash", str(source / "tweak.sh"), "apply", "--with", "node", "--yes"], env=environment, capture_output=True, text=True, timeout=60)
    assert repeated.returncode == 0 and "Nothing to change." in repeated.stdout, repeated.stdout + repeated.stderr
print("PASS: live Node 24.22.0 external-to-managed repair, preserved relative links/payload, verification, and no-op reapplication")
