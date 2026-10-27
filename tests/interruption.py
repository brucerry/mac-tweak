"""Terminate real installer processes at deterministic download/staging barriers."""
import hashlib
import io
import os
import pathlib
import shutil
import signal
import subprocess
import tarfile
import tempfile
import time

source = pathlib.Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix="mac-tweak-interruption-") as temporary:
    root = pathlib.Path(temporary).resolve()
    repo = root / "checkout"
    repo.mkdir()
    shutil.copy2(source / "tweak.sh", repo / "tweak.sh")
    shutil.copytree(source / "src", repo / "src")
    manifest = repo / "src/catalog/releases.txt"
    original = manifest.read_text()
    fakebin = root / "bin"
    fakebin.mkdir()
    (fakebin / "curl").write_text('''#!/bin/bash
while test "$#" -gt 0; do
    if test "$1" = --output; then output="$2"; shift 2; else shift; fi
done
if test "${INTERRUPT_PHASE:-}" = download; then
    printf 'download\\n' > "$INTERRUPT_READY"
    exec /bin/sleep 60
fi
exec /bin/cp "$INTERRUPT_ARCHIVE" "$output"
''')
    (fakebin / "curl").chmod(0o755)

    def release(version):
        archive = root / ("node-" + version + ".tar.gz")
        with tarfile.open(archive, "w:gz") as output:
            for command in ["node", "npm", "npx"]:
                body = "#!/bin/bash\n"
                if command == "node" and version == "24.22.2":
                    body += '''if test "${INTERRUPT_PHASE:-}" = staged; then
case "$0" in */.release.*/bin/node)
    printf 'staged\\n' > "$INTERRUPT_READY"
    exec /bin/sleep 60 ;;
esac
fi
'''
                body += "echo " + version + "\n"
                entry = tarfile.TarInfo("node-fixture/bin/" + command)
                entry.mode, entry.size = 0o755, len(body.encode())
                output.addfile(entry, io.BytesIO(body.encode()))
        lines = []
        for line in original.splitlines():
            if line.startswith("node|"):
                fields = line.split("|")
                fields[1], fields[8], fields[9] = version, hashlib.sha256(archive.read_bytes()).hexdigest(), "node-fixture"
                line = "|".join(fields)
            lines.append(line)
        manifest.write_text("\n".join(lines) + "\n")
        return str(archive)

    for phase in ["download", "staged"]:
        for termination in [signal.SIGTERM, signal.SIGKILL]:
            case = root / (phase + "-" + termination.name)
            case.mkdir()
            home = case / "home with spaces"
            home.mkdir()
            (home / ".zshrc").write_text("# original startup\n")
            (home / "keep").write_text("unrelated\n")
            environment = dict(os.environ, HOME=str(home), PATH=str(fakebin) + ":/usr/bin:/bin:/usr/sbin:/sbin",
                               INTERRUPT_PHASE="", INTERRUPT_READY=str(case / "ready"), INTERRUPT_ARCHIVE=release("24.22.1"))

            def run(command, components="aliases,node"):
                result = subprocess.run(["/bin/bash", str(repo / "tweak.sh"), command, "--with", components,
                                         *(["--yes"] if command == "apply" else [])],
                                        env=environment, capture_output=True, text=True, timeout=30)
                return result, result.stdout + result.stderr

            seeded, output = run("apply", "node")
            assert seeded.returncode == 0, output
            pointer = home / ".local/opt/mac-tweak/node/current"
            previous = pointer.readlink()
            state = home / ".local/state/mac-tweak"
            runs_before = set((state / "runs").iterdir())
            environment.update(INTERRUPT_ARCHIVE=release("24.22.2"), INTERRUPT_PHASE=phase)
            with (case / "interrupted.log").open("w") as log:
                process = subprocess.Popen(["/bin/bash", str(repo / "tweak.sh"), "apply", "--with", "aliases,node", "--yes"],
                                           env=environment, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                try:
                    deadline = time.monotonic() + 30
                    while not (case / "ready").exists():
                        assert process.poll() is None, (case / "interrupted.log").read_text()
                        assert time.monotonic() < deadline, "Installer did not reach " + phase
                        time.sleep(0.05)
                    assert (state / "lock/pid").read_text().strip() == str(process.pid)
                    os.killpg(process.pid, termination)
                    assert process.wait(timeout=10) != 0
                finally:
                    # Keep group ownership anchored to a live, unreaped leader.
                    # After wait(), the numeric group may have gone or been reused.
                    if process.poll() is None:
                        try:
                            os.killpg(process.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                        except PermissionError:
                            if process.poll() is None:
                                raise
                    process.wait(timeout=10)
            output = (case / "interrupted.log").read_text()
            assert "Application complete." not in output, output
            assert pointer.readlink() == previous
            assert subprocess.check_output([str(home / ".local/bin/node"), "--version"], text=True).strip() == "24.22.1"
            assert not (pointer.parent / "24.22.2").exists()
            new_runs = set((state / "runs").iterdir()) - runs_before
            assert len(new_runs) == 1
            events = (new_runs.pop() / "events.txt").read_text()
            assert "changed|" + str(home / ".config/mac-tweak/aliases.zsh") + "|" in events
            assert "tool|node|24.22.2" not in events
            if termination == signal.SIGTERM:
                assert process.returncode == 143 and not (state / "lock").exists(), output
                assert "interrupted|node|TERM" in events and "Run records and recovery information:" in output, output
            else:
                assert (state / "lock/pid").exists()
                # Follow the documented conservative recovery: prove the owner has
                # exited, test that another apply refuses the lock, then remove it.
                environment["INTERRUPT_PHASE"] = ""
                blocked, blocked_output = run("apply")
                assert blocked.returncode != 0 and "Another application holds" in blocked_output, blocked_output
                assert process.poll() is not None
                (state / "lock/pid").unlink()
                (state / "lock").rmdir()
            environment["INTERRUPT_PHASE"] = ""
            retried, output = run("apply")
            assert retried.returncode == 0, output
            verified, output = run("verify")
            assert verified.returncode == 0, output
            assert pointer.readlink() != previous and previous.is_dir()
            assert subprocess.check_output([str(home / ".local/bin/node"), "--version"], text=True).strip() == "24.22.2"
            repeated, output = run("apply")
            assert repeated.returncode == 0 and "Nothing to change." in output, output
            assert (home / "keep").read_text() == "unrelated\n"
            assert (home / ".zshrc").read_text().startswith("# original startup\n")
            print("PASS: " + termination.name + " during " + phase + ", prior release preserved, records/lock recovery, retry, verify, and no-op", flush=True)
