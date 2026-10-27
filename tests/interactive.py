"""Exercise the actual terminal entry point; Python is a test dependency only."""
import errno
import os
import pty
import select
import subprocess
import sys
import time

repo, home = sys.argv[1:]
for answer, expected in [(b"5,6\n", "Selection: prompt aliases"), (b"q\n", "Cancelled")]:
    master, slave = pty.openpty()
    proc = subprocess.Popen(["/bin/bash", repo + "/tweak.sh", "--terminal"], stdin=slave, stdout=slave, stderr=slave,
                            env=dict(os.environ, HOME=home, PATH="/usr/bin:/bin:/usr/sbin:/sbin"))
    os.close(slave)
    output = b""
    sent = False
    approved = False
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
                if b"Choose numbers" in output and not sent:
                    os.write(master, answer)
                    sent = True
                if b"Apply this plan?" in output and not approved:
                    os.write(master, b"n\n")
                    approved = True
            if proc.poll() is not None:
                break
        try:
            result = proc.wait(timeout=max(0.1, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            proc.kill()
            raise AssertionError("interactive command timed out: " + repr(output))
        assert result == 0, output
        assert expected.encode() in output, output
    finally:
        os.close(master)
        if proc.poll() is None:
            proc.kill()
print("PASS: terminal selection and cancellation")
