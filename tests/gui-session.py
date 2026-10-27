"""Exercise graphical review transport without automating the real account."""
import os
import pathlib
import subprocess
import sys
import tempfile

repo = pathlib.Path(sys.argv[1])
for mode in ["cancel", "eof", "wrong-token", "stale", "apply"]:
    with tempfile.TemporaryDirectory(prefix="mac-tweak-review-") as temporary:
        home = pathlib.Path(temporary).resolve()
        proc = subprocess.Popen(["/bin/bash", str(repo / "src/cli.sh"), "review-session", "--with", "aliases"],
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                env=dict(os.environ, HOME=str(home), PATH="/usr/bin:/bin:/usr/sbin:/sbin"), text=True)
        output = ""
        for line in proc.stdout:
            output += line
            if line.startswith("__MAC_TWEAK_REVIEW_READY__|"):
                token = line.strip().split("|")[1]
                break
        else:
            raise AssertionError(output)
        assert not (home / ".config").exists()
        assert not (home / ".local").exists()
        if mode == "stale":
            (home / ".zshrc").write_text("# changed after review\n")
        if mode != "eof":
            approval = "cancel" if mode == "cancel" else "apply:wrong" if mode == "wrong-token" else "apply:" + token
            proc.stdin.write(approval + "\n")
            proc.stdin.flush()
        proc.stdin.close()
        output += proc.stdout.read()
        result = proc.wait(timeout=20)
        assert result == (1 if mode in ["wrong-token", "stale"] else 0), output
        if mode == "apply":
            assert (home / ".config/mac-tweak/aliases.zsh").is_file()
            assert "DONE [aliases]" in output
        else:
            assert not (home / ".config").exists(), output
            assert not (home / ".local").exists(), output
        if mode == "stale": assert "Target changed after preview" in output
        if mode == "wrong-token": assert "does not match this session" in output
        print("PASS: graphical review transport " + mode)
