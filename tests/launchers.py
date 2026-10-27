"""Check real launcher routing with an inert view in a copied checkout."""
import os
import pathlib
import shutil
import subprocess
import tempfile

source = pathlib.Path(__file__).resolve().parent.parent
assert not (source / 'setup.sh').exists() and not (source / 'Setup.command').exists()
with tempfile.TemporaryDirectory(prefix="mac-tweak-launcher-") as temporary:
    root = pathlib.Path(temporary).resolve()
    repo = root / "checkout with spaces"
    repo.mkdir()
    home = root / "home"
    home.mkdir()
    shutil.copytree(source / "src", repo / "src")
    for name in ["tweak.sh", "Tweak.command"]:
        shutil.copy2(source / name, repo / name)
    (repo / "src/gui/main.js").write_text("function run(argv) { return 'GUI-LAUNCHED:' + argv[0]; }\n")
    environment = dict(os.environ, HOME=str(home), PATH="/usr/bin:/bin:/usr/sbin:/sbin",MAC_TWEAK_GUI_TEST="1")
    for launcher, arguments in [("tweak.sh", []), ("tweak.sh", ["gui"]), ("Tweak.command", [])]:
        result = subprocess.run([str(repo / launcher), *arguments], cwd=root, env=environment, capture_output=True, text=True)
        assert result.returncode == 0 and "GUI-LAUNCHED:" + str(repo) in result.stdout, result.stdout + result.stderr
    listed = subprocess.run([str(repo / "tweak.sh"), "list"], cwd=root, env=environment, capture_output=True, text=True)
    assert listed.returncode == 0 and "Components" in listed.stdout and "GUI-LAUNCHED" not in listed.stdout
    terminal = subprocess.run([str(repo / "tweak.sh"), "--terminal"], cwd=root, env=environment, capture_output=True, text=True)
    assert terminal.returncode != 0 and "Noninteractive input" in terminal.stderr
    assert not (home/'.config').exists() and not (home/'.local').exists()
    assert list((home/'Library/Caches/io.github.brucerry.MacTweak/hosts').glob('*/Mac Tweak.app'))
print("PASS: default GUI, explicit GUI, double-click launcher, CLI, and terminal routes from a spaced checkout")
