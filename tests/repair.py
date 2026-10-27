"""Reviewed repairs preserve originals and cannot bypass ordinary approval."""
import hashlib
import io
import os
import pathlib
import shutil
import subprocess
import tarfile
import tempfile
import zipfile

source = pathlib.Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix="mac-tweak-repair-") as temporary:
    root = pathlib.Path(temporary).resolve()
    repo, archives, fakebin = root / "checkout", root / "archives", root / "bin"
    repo.mkdir(); archives.mkdir(); fakebin.mkdir()
    shutil.copy2(source / "tweak.sh", repo / "tweak.sh")
    shutil.copytree(source / "src", repo / "src")
    rows = []
    for line in (repo / "src/catalog/releases.txt").read_text().splitlines():
        fields = line.split("|")
        if fields[0] in ["node", "gh"]:
            archive = archives / fields[7].rsplit("/", 1)[1]
            fields[9] = fields[0] + "-fixture"
            members = {fields[9] + "/bin/" + command: ("#!/bin/sh\necho " + fields[1] + "\n").encode() for command in fields[10].split(",")}
            if fields[6] == "zip":
                with zipfile.ZipFile(archive, "w") as output:
                    for name, data in members.items():
                        entry = zipfile.ZipInfo(name); entry.create_system = 3; entry.external_attr = 0o100755 << 16
                        output.writestr(entry, data)
            else:
                with tarfile.open(archive, "w:gz") as output:
                    for name, data in members.items():
                        entry = tarfile.TarInfo(name); entry.mode = 0o755; entry.size = len(data)
                        output.addfile(entry, io.BytesIO(data))
            fields[8] = hashlib.sha256(archive.read_bytes()).hexdigest()
            line = "|".join(fields)
        rows.append(line)
    (repo / "src/catalog/releases.txt").write_text("\n".join(rows) + "\n")
    (fakebin / "curl").write_text('''#!/bin/bash
for url; do :; done
printf '%s\\n' "$url" >> "$REPAIR_DOWNLOADS"
test "${REPAIR_FAIL_DOWNLOAD:-0}" != 1 || exit 22
if test -n "${REPAIR_MUTATE_LINK:-}"; then
    /bin/rm "$REPAIR_MUTATE_LINK"
    /bin/ln -s "$REPAIR_REPLACEMENT" "$REPAIR_MUTATE_LINK"
fi
while test "$#" -gt 0; do if test "$1" = --output; then output="$2"; shift 2; else shift; fi; done
exec /bin/cp "$REPAIR_ARCHIVES/${url##*/}" "$output"
''')
    (fakebin / "cp").write_text('''#!/bin/bash
for target; do :; done
case "$target" in */backups/command-*) test "${REPAIR_FAIL_BACKUP:-0}" != 1 || exit 1 ;; esac
exec /bin/cp "$@"
''')
    for path in fakebin.iterdir(): path.chmod(0o755)

    def snapshot(home):
        return {str(p.relative_to(home)): (p.lstat().st_mode, p.lstat().st_mtime_ns,
                str(p.readlink()) if p.is_symlink() else hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None)
                for p in home.rglob("*")}

    for mode in ["cancel", "eof", "wrong-token", "wrong-kind", "stale", "download-failure", "backup-failure", "download-race", "nested-download-race", "apply"]:
        case = root / mode; case.mkdir()
        home, old = case / "home with spaces", case / "external installation"
        home.mkdir(); old.mkdir(); (home / ".local/bin").mkdir(parents=True)
        (home / ".zshrc").write_text("# original startup\n")
        for command in ["node", "npm", "npx"]:
            (old / command).write_text("#!/bin/sh\necho 24.22.0\n"); (old / command).chmod(0o755)
            (home / (".local/bin/" + command)).symlink_to(os.path.relpath(old / command, home / ".local/bin"))
        (home / ".local/bin/gh").write_text("#!/bin/sh\necho 2.102.0\n"); (home / ".local/bin/gh").chmod(0o755)
        original_links = {name: (home / (".local/bin/" + name)).readlink() for name in ["node", "npm", "npx"]}
        if mode == "nested-download-race":
            shim = case / "external shim"; shim.mkdir(); (shim / "node").symlink_to(old / "node")
            target = home / ".local/bin/node"; target.unlink(); target.symlink_to(os.path.relpath(shim / "node", target.parent))
            original_links["node"] = target.readlink()
        old_snapshot = snapshot(old)
        env = dict(os.environ, HOME=str(home), PATH=str(home / ".local/bin") + ":" + str(fakebin) + ":/usr/bin:/bin:/usr/sbin:/sbin",
                   REPAIR_ARCHIVES=str(archives), REPAIR_DOWNLOADS=str(case / "downloads"),
                   REPAIR_FAIL_DOWNLOAD="1" if mode == "download-failure" else "0", REPAIR_FAIL_BACKUP="1" if mode == "backup-failure" else "0")
        if mode in ["download-race", "nested-download-race"]:
            replacement = case / "new external node"; replacement.write_text("#!/bin/sh\necho 24.22.9\n"); replacement.chmod(0o755)
            env.update(REPAIR_MUTATE_LINK=str(shim / "node" if mode == "nested-download-race" else home / ".local/bin/node"), REPAIR_REPLACEMENT=str(replacement))

        def run(action, selection="node,gh,aliases"):
            return subprocess.run(["/bin/bash", str(repo / "tweak.sh"), action, "--with", selection,
                                   *(["--yes"] if action == "apply" else [])], env=env, capture_output=True, text=True, timeout=30)

        before = snapshot(home)
        blocked = run("apply")
        assert blocked.returncode != 0 and "external installation" in blocked.stdout and snapshot(home) == before

        def session(answer, selection="node,gh,aliases", mutate=None):
            proc = subprocess.Popen(["/bin/bash", str(repo / "tweak.sh"), "repair-session", "--with", selection], env=env,
                                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            output = ""
            for line in proc.stdout:
                output += line
                if line.startswith("__MAC_TWEAK_REPAIR_READY__|"):
                    token = line.split("|")[1]; break
            else: raise AssertionError(output)
            if mutate: mutate()
            if answer != "eof":
                approval = "cancel" if answer == "cancel" else "repair:wrong" if answer == "wrong-token" else ("apply:" if answer == "wrong-kind" else "repair:") + token
                proc.stdin.write(approval + "\n"); proc.stdin.flush()
            proc.stdin.close(); output += proc.stdout.read(); code = proc.wait(timeout=30)
            return code, output

        if mode == "stale":
            code, output = session("apply", mutate=lambda: (home / ".zshrc").write_text("# changed after repair review\n"))
            assert code != 0 and "Target changed after preview" in output, output
        else:
            code, output = session(mode)
            assert code == (1 if mode in ["wrong-token", "wrong-kind", "download-failure", "backup-failure", "download-race", "nested-download-race"] else 0), output
        assert snapshot(old) == old_snapshot
        if mode != "apply":
            assert all((home / (".local/bin/" + name)).readlink() == (replacement if mode == "download-race" and name == "node" else dest) for name, dest in original_links.items())
            if mode in ["download-race", "nested-download-race"]: assert "Target changed after repair preview" in output, output
            assert not (home / ".local/bin/gh").is_symlink()
            assert not (home / ".local/opt/mac-tweak/node/current").exists()
            if mode in ["cancel", "eof", "wrong-token", "wrong-kind"]:
                assert snapshot(home) == before and not (case / "downloads").exists()
            if mode == "stale": assert not (home / ".config").exists()
        else:
            for command, version in [("node", "24.22.1"), ("npm", "24.22.1"), ("npx", "24.22.1"), ("gh", "2.103.2")]:
                assert subprocess.check_output([str(home / (".local/bin/" + command)), "--version"], text=True).strip() == version
            assert run("verify").returncode == 0
            records = list((home / ".local/state/mac-tweak/runs").glob("*/events.txt"))
            preserved = {line.split("|")[1]: pathlib.Path(line.split("|")[2]) for p in records for line in p.read_text().splitlines() if line.startswith("preserved-command|")}
            assert len(preserved) == 4
            for name, dest in original_links.items(): assert preserved[str(home / (".local/bin/" + name))].readlink() == dest
            assert preserved[str(home / ".local/bin/gh")].read_text().endswith("echo 2.102.0\n")
            target = home / ".local/bin/node"; target.unlink(); target.symlink_to(original_links["node"])
            downloads = (case / "downloads").read_bytes()
            code, repaired = session("apply")
            assert code == 0 and "command links repaired" in repaired and (case / "downloads").read_bytes() == downloads, repaired
            assert run("verify").returncode == 0
            snippet = home / ".config/mac-tweak/aliases.zsh"; snippet.write_text("# custom drift\nalias ll='ls'\n")
            assert run("apply", "aliases").returncode != 0
            code, repaired = session("apply", "aliases")
            assert code == 0 and snippet.read_text().startswith("alias ls="), repaired
            assert any(p.read_text().startswith("# custom drift") for p in (home / ".local/state/mac-tweak/runs").glob("*/backups/[0-9]*"))
            assert run("verify", "aliases").returncode == 0
            for target in [snippet, home / ".zshrc"]:
                published = target.read_bytes()
                record = home / (".local/state/mac-tweak/ownership/" + hashlib.sha256(str(target).encode()).hexdigest())
                record.unlink()
                assert run("apply", "aliases").returncode != 0
                code, repaired = session("apply", "aliases")
                assert code == 0 and target.read_bytes() == published and record.is_file(), repaired
                assert run("verify", "aliases").returncode == 0
        print("PASS: reviewed repair " + mode, flush=True)
