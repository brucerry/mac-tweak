"""Snapshot read-only public commands, including failure paths."""
import hashlib
import os
import pathlib
import subprocess
import sys

repo, home, fakebin = map(pathlib.Path, sys.argv[1:])
(home / ".zshrc").write_bytes(b"# existing user text without a trailing newline")
(home / "unrelated").write_text("preserve me\n")
spy = fakebin.parent / "downloads"
(fakebin / "curl").write_text('#!/bin/sh\necho called >> "' + str(spy) + '"\nexit 99\n')
(fakebin / "curl").chmod(0o755)

def snapshot():
    return {str(p.relative_to(home)): (p.lstat().st_mode, p.lstat().st_mtime_ns,
            hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None)
            for p in home.rglob("*")}

commands = [["list"], ["info", "aliases"], ["plan", "--with", "node,aliases"],
            ["verify", "--with", "node,aliases"], ["plan", "--with", "missing"]]
for command in commands:
    before = snapshot()
    subprocess.run(["/bin/bash", str(repo / "tweak.sh"), *command],
                   env=dict(os.environ, HOME=str(home), PATH=str(fakebin)+":/usr/bin:/bin:/usr/sbin:/sbin"),
                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    assert snapshot() == before, command
    assert not spy.exists(), command
(home / ".zshrc").unlink()
(home / "unrelated").unlink()
print("PASS: read-only commands preserve filesystem snapshots and never download")
