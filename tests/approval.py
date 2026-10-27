import errno
import os
import pathlib
import pty
import select
import subprocess
import sys
import time

repo, home = map(pathlib.Path, sys.argv[1:])
for change_target in [False, True]:
    master, slave = pty.openpty()
    proc = subprocess.Popen(["/bin/bash", str(repo / "tweak.sh"), "apply", "--with", "aliases"],
                            stdin=slave, stdout=slave, stderr=slave,
                            env=dict(os.environ, HOME=str(home), PATH="/usr/bin:/bin:/usr/sbin:/sbin"))
    os.close(slave)
    output = b""
    sent = False
    deadline = time.monotonic() + 10
    try:
        while time.monotonic() < deadline:
            if select.select([master], [], [], 0.1)[0]:
                try:
                    chunk = os.read(master, 65536)
                except OSError as error:
                    if error.errno == errno.EIO:
                        break
                    raise
                if not chunk:
                    break
                output += chunk
                if b"Apply this plan?" in output and not sent:
                    if change_target:
                        (home / ".zshrc").write_text("# edit made while reviewing\n")
                    os.write(master, b"y\n" if change_target else b"n\n")
                    sent = True
            if proc.poll() is not None:
                break
        result = proc.wait(timeout=max(0.1, deadline - time.monotonic()))
        assert result == (1 if change_target else 0), output
        assert (b"Target changed after preview" if change_target else b"Cancelled") in output, output
        assert not (home / ".config").exists()
        assert not (home / ".local").exists()
        if change_target:
            (home / ".zshrc").unlink()
    finally:
        os.close(master)
        if proc.poll() is None:
            proc.kill()
print("PASS: cancelled and stale approvals cannot mutate setup targets")
