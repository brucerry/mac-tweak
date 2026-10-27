"""Public CLI tests using real archives and a local curl transport fixture."""
import hashlib
import io
import os
import pathlib
import shutil
import subprocess
import sys
import tarfile

source, test_root = map(pathlib.Path, sys.argv[1:])
repo = test_root / "artifact-repo"
repo.mkdir()
for name in ["tweak.sh", "src"]:
    path = source / name
    if path.is_dir():
        shutil.copytree(path, repo / name)
    else:
        shutil.copy2(path, repo / name)
home = test_root / "artifact home"
home.mkdir()
fakebin = test_root / "artifact-bin"
fakebin.mkdir()
(fakebin / "curl").write_text('''#!/bin/bash
while test "$#" -gt 0; do
    if test "$1" = --output; then output="$2"; shift 2; else shift; fi
done
cp "$FIXTURE_ARCHIVE" "$output"
''')
(fakebin / "curl").chmod(0o755)
manifest_original = (repo / "src/catalog/releases.txt").read_text()

def archive(kind):
    path = test_root / (kind + ".tar.gz")
    with tarfile.open(path, "w:gz") as tar:
        if kind == "traversal":
            item = tarfile.TarInfo("../../escaped-by-test")
            item.size = 4
            tar.addfile(item, io.BytesIO(b"oops"))
        elif kind == "symlink":
            item = tarfile.TarInfo("node-v24.22.1-darwin-arm64/link")
            item.type = tarfile.SYMTYPE
            item.linkname = str(test_root)
            tar.addfile(item)
        else:
            for command in ["node", "npm", "npx"]:
                data = ("#!/bin/sh\n" + ("command -v node >/dev/null || exit 2\n" if command != "node" else "") + "echo 24.22.1\n").encode()
                item = tarfile.TarInfo("node-v24.22.1-darwin-arm64/bin/" + command)
                item.size = len(data)
                item.mode = 0o755
                tar.addfile(item, io.BytesIO(data))
    return path

def execute(kind, expected):
    path = archive(kind)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if kind == "corrupt":
        digest = "0" * 64
    lines = []
    for line in manifest_original.splitlines():
        if line.startswith("node|"):
            fields = line.split("|")
            fields[8] = "" if kind == "missing" else digest
            fields[9] = "node-v24.22.1-darwin-arm64"
            line = "|".join(fields)
        lines.append(line)
    (repo / "src/catalog/releases.txt").write_text("\n".join(lines) + "\n")
    result = subprocess.run(["/bin/bash", str(repo / "tweak.sh"), "apply", "--with", "node", "--yes"],
                            env=dict(os.environ, HOME=str(home), FIXTURE_ARCHIVE=str(path),
                                     PATH=str(fakebin) + ":/usr/bin:/bin:/usr/sbin:/sbin"),
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    assert (result.returncode == 0) == (expected == "DONE [node]"), result.stdout
    assert expected in result.stdout, result.stdout
    assert not (test_root.parent / "escaped-by-test").exists()
    if kind == "valid":
        for command in ["node", "npm", "npx"]:
            assert subprocess.check_output([str(home / (".local/bin/" + command)), "--version"], text=True).strip() == "24.22.1"
        pointer = home / ".local/opt/mac-tweak/node/current"
        verified = subprocess.run(["/bin/bash", str(repo / "tweak.sh"), "verify", "--with", "node"],
                                  env=dict(os.environ, HOME=str(home), PATH="/usr/bin:/bin:/usr/sbin:/sbin"), capture_output=True, text=True)
        assert verified.returncode == 0, verified.stdout + verified.stderr
        old_pointer = pointer.readlink()
        updated = (repo / "src/catalog/releases.txt").read_text().replace("node|24.22.1|", "node|24.22.2|")
        updated = updated.replace(digest, "0" * 64)
        (repo / "src/catalog/releases.txt").write_text(updated)
        failed = subprocess.run(["/bin/bash", str(repo / "tweak.sh"), "apply", "--with", "node", "--yes"],
                                env=dict(os.environ, HOME=str(home), FIXTURE_ARCHIVE=str(path), PATH=str(fakebin)+":/usr/bin:/bin:/usr/sbin:/sbin"),
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        assert failed.returncode != 0 and "Checksum mismatch" in failed.stdout, failed.stdout
        assert pointer.readlink() == old_pointer
        assert subprocess.check_output([str(home / ".local/bin/node"), "--version"], text=True).strip() == "24.22.1"
    else:
        assert not (home / ".local/opt/mac-tweak/node/current").exists()
    for child in home.iterdir():
        if child.is_dir(): shutil.rmtree(child)
        else: child.unlink()

execute("valid", "DONE [node]")
execute("corrupt", "Checksum mismatch")
execute("missing", "Invalid release metadata")
execute("traversal", "Unsafe archive path")
execute("symlink", "Escaping archive symlink")
(repo / "src/catalog/releases.txt").write_text(manifest_original)
for command in ["node", "npm", "npx"]:
    (fakebin / command).write_text("#!/bin/sh\necho 24.22.1\n")
    (fakebin / command).chmod(0o755)
environment = dict(os.environ, HOME=str(home), PATH=str(fakebin)+":/usr/bin:/bin:/usr/sbin:/sbin")
compatible = subprocess.run(["/bin/bash", str(repo / "tweak.sh"), "plan", "--with", "node"], env=environment, capture_output=True, text=True)
assert compatible.returncode == 0 and "SATISFIED [node] reused external" in compatible.stdout, compatible.stdout
assert not (home / ".local").exists()
(fakebin / "node").write_text("#!/bin/sh\necho 22.0.0\n")
incompatible = subprocess.run(["/bin/bash", str(repo / "tweak.sh"), "apply", "--with", "node", "--yes"], env=environment, capture_output=True, text=True)
assert incompatible.returncode != 0 and "external installation" in incompatible.stdout, incompatible.stdout
assert not (home / ".local").exists()
print("PASS: verified archives, portable paths with spaces, corrupt/missing digests, and extraction confinement")
print("PASS: Node/npm/npx activation, external reuse/conflict, and failed managed-upgrade preservation")
