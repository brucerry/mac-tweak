"""JXA model checks, plus optional native-window tests in disposable homes."""
import os
import hashlib
import io
import pathlib
import shutil
import subprocess
import sys
import tempfile
import tarfile

repo = pathlib.Path(__file__).resolve().parent.parent
command = ["/bin/bash", str(repo / "tweak.sh"), "gui"]
model = subprocess.run([*command, "--self-test"], capture_output=True, text=True, timeout=20)
assert model.returncode == 0 and "PASS: native GUI" in model.stdout, model.stdout + model.stderr
print(model.stdout.strip(), flush=True)
abi_probe = r'''
ObjC.import('Cocoa');
function run(argv) {
    var source = $.NSString.stringWithContentsOfFileEncodingError(argv[0] + '/src/gui/main.js', $.NSUTF8StringEncoding, Ref());
    (0, eval)(ObjC.unwrap(source));
    var expected = $.NSView.instanceMethodSignatureForSelector('isFlipped').methodReturnType;
    var flipped = $.MacTweakFlippedView.instanceMethodSignatureForSelector('isFlipped');
    var close = $.MacTweakController.instanceMethodSignatureForSelector('windowShouldClose:');
    var reopen = $.MacTweakController.instanceMethodSignatureForSelector('applicationShouldHandleReopen:hasVisibleWindows:');
    if (['B', 'c'].indexOf(expected) < 0 || flipped.methodReturnType !== expected ||
        close.methodReturnType !== expected || reopen.methodReturnType !== expected ||
        reopen.getArgumentTypeAtIndex(3) !== expected) throw new Error('Native BOOL signatures must match AppKit for this architecture.');
    return 'PASS: native BOOL return and argument encodings match AppKit (' + expected + ')';
}
'''
abi = subprocess.run(['/usr/bin/osascript', '-l', 'JavaScript', '-e', abi_probe, str(repo)], capture_output=True, text=True, timeout=20)
assert abi.returncode == 0 and 'PASS: native BOOL' in abi.stdout, abi.stdout + abi.stderr
print(abi.stdout.strip(), flush=True)
if "--native" in sys.argv:
    modes = ["--smoke", "--smoke-apply", "--smoke-blocked", "--smoke-stale", "--smoke-interaction",
             "--smoke-apply-failure", "--smoke-verify-pending", "--smoke-verify-versions", "--smoke-verify-reused", "--smoke-verify-health",
             "--smoke-repair-review", "--smoke-repair-pending", "--smoke-repair-cancel", "--smoke-repair-details", "--smoke-repair-versions",
             "--smoke-repair-manual", "--smoke-repair-stale", "--smoke-repair-selection", "--smoke-repair-config"]
    for appearance, mode in [(appearance, mode) for appearance in ["light", "dark"] for mode in modes]:
        with tempfile.TemporaryDirectory(prefix="mac-tweak-gui-smoke-") as temporary:
            root = pathlib.Path(temporary).resolve()
            home = root / "home with spaces"
            home.mkdir()
            environment = dict(os.environ, HOME=str(home), PATH="/usr/bin:/bin:/usr/sbin:/sbin", MAC_TWEAK_GUI_TEST="1",
                               MAC_TWEAK_GUI_APPEARANCE=appearance)
            test_repo = repo
            if mode in ["--smoke-interaction", "--smoke-verify-health", "--smoke-repair-versions"]:
                test_repo = root / "checkout"
                test_repo.mkdir()
                shutil.copy2(repo / "tweak.sh", test_repo / "tweak.sh")
                shutil.copytree(repo / "src", test_repo / "src")
                if mode == "--smoke-interaction":
                    for index in range(40):
                        (test_repo / ("src/presets/fixture-" + str(index).zfill(2) + ".txt")).write_text("aliases\n")
                elif mode == "--smoke-verify-health":
                    # Transport-level health fault; normal pending checks use the real backend.
                    (test_repo / "src/lib/verify.sh").write_text("verify_selection() { printf 'FAIL [aliases] injected health check failure\\n'; return 1; }\n")
            if mode == "--smoke-repair-versions":
                archive = root / "node-fixture.tar.gz"
                with tarfile.open(archive, "w:gz") as output:
                    for name in ["node", "npm", "npx"]:
                        body = b"#!/bin/sh\necho 24.22.1\n"
                        member = tarfile.TarInfo("node-fixture/bin/" + name); member.mode = 0o755; member.size = len(body)
                        output.addfile(member, io.BytesIO(body))
                manifest = test_repo / "src/catalog/releases.txt"
                lines = []
                for line in manifest.read_text().splitlines():
                    if line.startswith("node|"):
                        fields = line.split("|"); fields[8] = hashlib.sha256(archive.read_bytes()).hexdigest(); fields[9] = "node-fixture"; line = "|".join(fields)
                    lines.append(line)
                manifest.write_text("\n".join(lines) + "\n")
                fakebin = root / "bin"; fakebin.mkdir()
                (fakebin / "curl").write_text('''#!/bin/bash
while test "$#" -gt 0; do if test "$1" = --output; then output="$2"; shift 2; else shift; fi; done
exec /bin/cp "$GUI_REPAIR_ARCHIVE" "$output"
'''); (fakebin / "curl").chmod(0o755)
                (home / ".local/bin").mkdir(parents=True)
                for name in ["node", "npm", "npx"]:
                    (home / (".local/bin/" + name)).write_text("#!/bin/sh\necho 24.22.0\n"); (home / (".local/bin/" + name)).chmod(0o755)
                environment.update(PATH=str(home / ".local/bin") + ":" + str(fakebin) + ":" + environment["PATH"], GUI_REPAIR_ARCHIVE=str(archive))
            if mode == "--smoke-verify-versions":
                fakebin = root / "bin"
                fakebin.mkdir()
                (fakebin / "node").write_text("#!/bin/sh\necho 24.22.0\n")
                (fakebin / "node").chmod(0o755)
                environment["PATH"] = str(fakebin) + ":" + environment["PATH"]
            if mode == "--smoke-verify-reused":
                fakebin = root / "bin"
                fakebin.mkdir()
                for name in ["uv", "uvx"]:
                    (fakebin / name).write_text("#!/bin/sh\necho 0.13.5\n")
                    (fakebin / name).chmod(0o755)
                environment["PATH"] = str(fakebin) + ":" + environment["PATH"]
            if mode in ["--smoke-blocked", "--smoke-repair-manual"]:
                (root / "original.zshrc").write_text("# original startup\n")
                (home / ".zshrc").symlink_to(root / "original.zshrc")
            if mode == "--smoke-repair-config":
                (home / ".config/mac-tweak").mkdir(parents=True)
                (home / ".config/mac-tweak/aliases.zsh").write_text("# existing custom configuration\nalias ll='ls'\n")
            if mode == "--smoke-apply-failure":
                fakebin = root / "bin"
                fakebin.mkdir()
                marker = root / "fail-once"
                marker.touch()
                (home / ".zshrc").write_text("# original startup\n")
                (fakebin / "mv").write_text('''#!/bin/bash
for target; do :; done
if test "$target" = "$HOME/.zshrc" && test -f "$GUI_FAIL_ONCE"; then
    /bin/rm "$GUI_FAIL_ONCE"
    echo 'Injected GUI startup activation failure' >&2
    exit 1
fi
exec /bin/mv "$@"
''')
                (fakebin / "mv").chmod(0o755)
                environment.update(PATH=str(fakebin) + ":" + environment["PATH"], GUI_FAIL_ONCE=str(marker))
            result = subprocess.run(["/bin/bash", str(test_repo / "tweak.sh"), "gui", mode], capture_output=True, text=True, timeout=45,
                                    env=environment)
            assert result.returncode == 0 and "PASS: native GUI" in result.stderr + result.stdout, mode + ": exit " + str(result.returncode) + "\n" + result.stdout + result.stderr
            assert "FAIL:" not in result.stderr + result.stdout, result.stdout + result.stderr
            if mode in ["--smoke", "--smoke-blocked", "--smoke-stale", "--smoke-interaction", "--smoke-verify-pending", "--smoke-verify-versions", "--smoke-verify-reused", "--smoke-verify-health",
                        "--smoke-repair-cancel", "--smoke-repair-manual", "--smoke-repair-stale", "--smoke-repair-selection"]:
                assert not (home / ".config").exists()
                assert not (home / ".local").exists()
            elif mode == "--smoke-repair-versions":
                assert (home / ".local/bin/node").is_symlink()
                records = list((home / ".local/state/mac-tweak/runs").glob("*/backups/command-*"))
                assert len(records) == 3 and all("24.22.0" in p.read_text() for p in records)
            else:
                assert (home / ".config/mac-tweak/aliases.zsh").is_file()
                assert (home / ".zshrc").is_file()
                assert not (home / ".config/mac-tweak/prompt.zsh").exists()
            if mode in ["--smoke-blocked", "--smoke-repair-manual"]:
                assert (home / ".zshrc").is_symlink()
                assert (root / "original.zshrc").read_text() == "# original startup\n"
            if mode == "--smoke-stale":
                assert (home / ".zshrc").read_text() == "# changed after graphical review\n"
            if mode == "--smoke-repair-stale":
                assert (home / ".zshrc").read_text() == "# changed after repair review\n"
            if mode == "--smoke-repair-config":
                assert any("# existing custom configuration" in p.read_text() for p in (home / ".local/state/mac-tweak/runs").glob("*/backups/[0-9]*"))
            if mode == "--smoke-apply-failure":
                assert (home / ".zshrc").read_text().startswith("# original startup\n")
                records = list((home / ".local/state/mac-tweak/runs").glob("*/events.txt"))
                assert len(records) == 2 and any("failed|" in record.read_text() for record in records)
                assert "PASS: native GUI recovery" in result.stdout + result.stderr
            print(appearance + ": " + (result.stdout + result.stderr).strip(), flush=True)
