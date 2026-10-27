"""End-to-end preset and recovery checks with local transport/build fixtures."""
import hashlib
import io
import os
import pathlib
import shutil
import subprocess
import sys
import tarfile
import zipfile

source, base = map(pathlib.Path, sys.argv[1:])
repo = base / "integration-repo"
repo.mkdir()
for name in ["tweak.sh", "src"]:
    if (source / name).is_dir(): shutil.copytree(source / name, repo / name)
    else: shutil.copy2(source / name, repo / name)
fakebin = base / "integration-bin"
fakebin.mkdir()
archives = base / "integration-archives"
archives.mkdir()
rows = []
for line in (repo / "src/catalog/releases.txt").read_text().splitlines():
    if not line or line.startswith("#"):
        rows.append(line)
        continue
    fields = line.split("|")
    tool, version, fmt, url, root, commands, bindir = fields[0], fields[1], fields[6], fields[7], fields[9], fields[10].split(","), fields[11]
    archive = archives / url.rsplit("/", 1)[1]
    members = {root + "/Makefile": b"# fixture source\n"} if fmt == "source" else {
        root + "/" + ("" if bindir == "." else bindir + "/") + command: ("#!/bin/sh\necho " + version + "\n").encode() for command in commands}
    if fmt == "zip":
        with zipfile.ZipFile(archive, "w") as output:
            for name, data in members.items():
                entry = zipfile.ZipInfo(name)
                entry.create_system, entry.external_attr = 3, 0o100755 << 16
                output.writestr(entry, data)
    else:
        if not archive.exists():
            with tarfile.open(archive, "w:gz") as output:
                for name, data in members.items():
                    entry = tarfile.TarInfo(name)
                    entry.mode, entry.size = 0o755, len(data)
                    output.addfile(entry, io.BytesIO(data))
    fields[8] = hashlib.sha256(archive.read_bytes()).hexdigest()
    rows.append("|".join(fields))
(repo / "src/catalog/releases.txt").write_text("\n".join(rows) + "\n")
(fakebin / "curl").write_text('''#!/bin/bash
for last; do :; done
printf '%s\\n' "$last" >> "$FIXTURE_DOWNLOADS"
case "$last" in *uv-*) test "${FIXTURE_FAIL_UV:-0}" != 1 || exit 7 ;; esac
while test "$#" -gt 0; do
 if test "$1" = --output; then output="$2"; shift 2; else shift; fi
done
cp "$FIXTURE_ARCHIVES/${last##*/}" "$output"
''')
(fakebin / "make").write_text('''#!/bin/bash
if test "${1:-}" = --version; then echo 'GNU Make fixture'; exit 0; fi
install=0; prefix=''; destination=''
for argument in "$@"; do
 case "$argument" in install) install=1 ;; prefix=*) prefix=${argument#prefix=} ;; DESTDIR=*) destination=${argument#DESTDIR=} ;; esac
done
if test "$install" = 1; then
 mkdir -p "$destination$prefix/bin"
 printf '#!/bin/sh\\necho 2.6.1\\n' > "$destination$prefix/bin/tig"
 chmod +x "$destination$prefix/bin/tig"
fi
''')
for path in fakebin.iterdir(): path.chmod(0o755)

def snapshot(home):
    return {str(p.relative_to(home)): (p.lstat().st_mode, p.lstat().st_mtime_ns,
            p.readlink().as_posix() if p.is_symlink() else hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None)
            for p in home.rglob("*")}

cases = [("terminal", ["--without", "colors"]), ("development", ["--without", "tig"]),
         ("full", ["--without", "prompt"]), ("full", [])]
for index, (preset, adjustments) in enumerate(cases):
    home = base / ("integration-home-" + str(index))
    home.mkdir()
    (home / "keep").write_text("unrelated\n")
    (home / ".zshrc").write_bytes(b"# original startup without final newline")
    downloads = base / ("integration-downloads-" + str(index))
    environment = dict(os.environ, HOME=str(home), PATH=str(fakebin)+":/usr/bin:/bin:/usr/sbin:/sbin",
                       FIXTURE_ARCHIVES=str(archives), FIXTURE_DOWNLOADS=str(downloads))
    selection = ["--preset", preset, *adjustments]
    def run(command, **overrides):
        return subprocess.run(["/bin/bash", str(repo / "tweak.sh"), command, *selection, *(["--yes"] if command == "apply" else [])],
                              env=dict(environment, **overrides), capture_output=True, text=True)
    before = snapshot(home)
    planned = run("plan")
    assert planned.returncode == 0, planned.stdout + planned.stderr
    assert snapshot(home) == before and not downloads.exists()
    if index == 3:
        failed = run("apply", FIXTURE_FAIL_UV="1")
        output = failed.stdout + failed.stderr
        assert failed.returncode != 0 and "DONE [node]" in output and "FAILED [uv]" in output and "UNATTEMPTED [gh]" in output, output
        assert (home / ".local/bin/node").exists()
        assert not (home / ".local/bin/gh").exists()
    applied = run("apply")
    assert applied.returncode == 0, applied.stdout + applied.stderr
    verified = run("verify")
    assert verified.returncode == 0, verified.stdout + verified.stderr
    installed = snapshot(home)
    log_before = downloads.read_bytes() if downloads.exists() else None
    repeated = run("apply")
    assert repeated.returncode == 0 and "Nothing to change." in repeated.stdout, repeated.stdout + repeated.stderr
    assert snapshot(home) == installed
    assert (downloads.read_bytes() if downloads.exists() else None) == log_before
    assert (home / "keep").read_text() == "unrelated\n"
    if preset == "development":
        assert not (home / ".config/mac-tweak/prompt.zsh").exists()
    if index == 3:
        records = sorted((home / ".local/state/mac-tweak/runs").glob("*/events.txt"))
        backup = next(line.split("|")[2] for record in records for line in record.read_text().splitlines()
                      if line.startswith("backup|" + str(home / ".zshrc") + "|"))
        shutil.copy2(backup, home / ".zshrc")
        assert (home / ".zshrc").read_bytes() == b"# original startup without final newline"
        assert (home / "keep").read_text() == "unrelated\n"
    print("PASS: integrated " + preset + " " + " ".join(adjustments) + (" with partial failure, retry, and recovery" if index == 3 else ""))
