"""Exercise only Mac Tweak's window, using a fake installer and disposable home."""
import os
import pathlib
import subprocess
import tempfile

repo = pathlib.Path(__file__).resolve().parents[1]
for appearance in ['light', 'dark']:
    with tempfile.TemporaryDirectory(prefix='mac-tweak-prerequisite-ui-') as directory:
        home = pathlib.Path(directory).resolve() / 'home';home.mkdir()
        result = subprocess.run(['/usr/bin/osascript', '-l', 'JavaScript', str(repo / 'tests/prerequisites-native.js'), str(repo)],
                                env={**os.environ, 'HOME': str(home), 'MAC_TWEAK_GUI_TEST': '1', 'MAC_TWEAK_GUI_APPEARANCE': appearance},
                                capture_output=True, text=True, timeout=25)
        output = result.stdout + result.stderr
        assert result.returncode == 0 and 'PASS: native prerequisite' in output and 'FAIL:' not in output, output
        assert not (home / '.local').exists() and not (home / '.config').exists()
        print(appearance + ': ' + output.strip())
