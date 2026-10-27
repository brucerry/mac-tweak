"""Exercise uv and gh through both platform paths with real fixture archives."""
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
repo = base / "tools-repo"
repo.mkdir()
for name in ["tweak.sh", "src"]:
    if (source / name).is_dir(): shutil.copytree(source / name, repo / name)
    else: shutil.copy2(source / name, repo / name)
original = (repo / "src/catalog/releases.txt").read_text()
fakebin = base / "tools-bin"
fakebin.mkdir()
home = base / "tools-home"

def script(name, content):
    (fakebin / name).write_text("#!/bin/bash\n" + content)
    (fakebin / name).chmod(0o755)

script("curl", '''printf '%s\\n' "$*" >> "$FIXTURE_URL_LOG"
test "${FIXTURE_FAIL_DOWNLOAD:-0}" != 1 || exit 7
while test "$#" -gt 0; do
 if test "$1" = --output; then output="$2"; shift 2; else shift; fi
done
cp "$FIXTURE_ARCHIVE" "$output"
''')
script("uname", 'if test "$1" = -s; then echo Darwin; else echo x86_64; fi\n')
script("sw_vers", "echo 27.0.1\n")
for tool in ["uv", "gh"]:
    for arch in ["arm64", "x64"]:
        home.mkdir()
        script("sysctl", "echo " + ("1" if arch == "arm64" else "0") + "\n")
        fields = next(line.split("|") for line in original.splitlines() if line.startswith(tool + "|") and line.split("|")[4] == arch)
        version, fmt, root, commands, bindir = fields[1], fields[6], fields[9], fields[10].split(","), fields[11]
        archive = base / (tool + "-" + arch + (".zip" if fmt == "zip" else ".tar.gz"))
        files = {}
        for command in commands:
            path = root + "/" + ("" if bindir == "." else bindir + "/") + command
            files[path] = ("#!/bin/sh\necho " + version + "\n").encode()
        if fmt == "zip":
            with zipfile.ZipFile(archive, "w") as output:
                for path, content in files.items():
                    entry = zipfile.ZipInfo(path)
                    entry.create_system = 3
                    entry.external_attr = 0o100755 << 16
                    output.writestr(entry, content)
        else:
            with tarfile.open(archive, "w:gz") as output:
                for path, content in files.items():
                    entry = tarfile.TarInfo(path)
                    entry.mode, entry.size = 0o755, len(content)
                    output.addfile(entry, io.BytesIO(content))
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        fields[8] = digest
        manifest = "\n".join("|".join(fields) if line.startswith(tool+"|") and line.split("|")[4] == arch else line for line in original.splitlines()) + "\n"
        (repo / "src/catalog/releases.txt").write_text(manifest)
        url_log = base / (tool + "-" + arch + ".urls")
        environment = dict(os.environ, HOME=str(home), PATH=str(fakebin)+":/usr/bin:/bin:/usr/sbin:/sbin", FIXTURE_ARCHIVE=str(archive), FIXTURE_URL_LOG=str(url_log))
        def run(command, **overrides):
            return subprocess.run(["/bin/bash", str(repo / "tweak.sh"), command, "--with", tool, "--yes"] if command == "apply" else ["/bin/bash", str(repo / "tweak.sh"), command, "--with", tool],
                                  env=dict(environment, **overrides), capture_output=True, text=True)
        result = run("apply")
        assert result.returncode == 0, result.stdout + result.stderr
        assert fields[7] in url_log.read_text()
        for command in commands:
            assert subprocess.check_output([str(home / (".local/bin/" + command)), "--version"], text=True).strip() == version
        checked = run("verify")
        assert checked.returncode == 0 and "executable visible" in checked.stdout, checked.stdout + checked.stderr
        new_version = version.rsplit(".", 1)[0] + "." + str(int(version.rsplit(".", 1)[1]) + 1)
        (repo / "src/catalog/releases.txt").write_text(manifest.replace(tool + "|" + version + "|", tool + "|" + new_version + "|"))
        pointer = home / (".local/opt/mac-tweak/" + tool + "/current")
        before = pointer.readlink()
        failed = run("apply", FIXTURE_FAIL_DOWNLOAD="1")
        assert failed.returncode != 0 and ("FAILED [" + tool + "]") in failed.stderr, failed.stdout + failed.stderr
        assert pointer.readlink() == before
        shutil.rmtree(home)
        home.mkdir()
        (repo / "src/catalog/releases.txt").write_text(original)
        for command in commands:
            script(command, "echo " + version + "\n")
        reused = run("plan")
        assert reused.returncode == 0 and ("SATISFIED [" + tool + "] reused external") in reused.stdout, reused.stdout + reused.stderr
        log_before = url_log.read_text()
        external_apply = run("apply")
        assert external_apply.returncode == 0, external_apply.stdout + external_apply.stderr
        assert url_log.read_text() == log_before
        external_verify = run("verify")
        assert external_verify.returncode == 0 and str(fakebin / tool) in external_verify.stdout, external_verify.stdout + external_verify.stderr
        assert not (home / (".local/opt/mac-tweak/" + tool)).exists()
        for command in commands: (fakebin / command).unlink()
        shutil.rmtree(home)
        print("PASS: " + tool + " " + arch + " activation, URL, verification, reuse, and failed-download preservation")
