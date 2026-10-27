"""Run the advanced reference commands with reusable external tools."""
import os
import pathlib
import re
import shlex
import subprocess
import sys
import tempfile

repo = pathlib.Path(sys.argv[1])
readme = (repo / "docs/cli.md").read_text()
assert os.access(repo / "tweak.sh", os.X_OK)
assert "https://github.com/brucerry/mac-tweak.git" in readme
assert "macOS 13.5+" in readme and "Applications, macOS system" in readme
with tempfile.TemporaryDirectory(prefix="mac-tweak-quickstart-") as temporary:
    root = pathlib.Path(temporary).resolve()
    home, fakebin = root / "home", root / "bin"
    home.mkdir()
    fakebin.mkdir()
    for name, version in {"node": "24.22.1", "npm": "11.19.2", "npx": "11.19.2", "uv": "0.13.5", "uvx": "0.13.5", "gh": "2.103.2", "tig": "2.6.1"}.items():
        path = fakebin / name
        path.write_text("#!/bin/sh\necho " + version + "\n")
        path.chmod(0o755)
    (fakebin / "curl").write_text("#!/bin/sh\necho unexpected-download >&2\nexit 99\n")
    (fakebin / "curl").chmod(0o755)
    environment = dict(os.environ, HOME=str(home), PATH=str(fakebin)+":/usr/bin:/bin:/usr/sbin:/sbin")
    count = 0
    for block in re.findall(r"```sh\n(.*?)```", readme, re.S):
        for line in block.splitlines():
            if not line.startswith("./tweak.sh "):
                continue
            arguments = shlex.split(line)
            arguments[0] = str(repo / "tweak.sh")
            if arguments[1] == "apply" and "--yes" not in arguments:
                arguments.append("--yes")  # explicit approval in this isolated automated test
            result = subprocess.run(["/bin/bash", *arguments], env=environment, capture_output=True, text=True)
            assert result.returncode == 0, (line, result.stdout, result.stderr)
            count += 1
    assert count >= 10
    assert not (home / ".local/opt/mac-tweak").exists()
    assert (home / ".config/mac-tweak/prompt.zsh").exists()
    print(f"PASS: {count} advanced-reference commands in an isolated new-user flow without downloads")
