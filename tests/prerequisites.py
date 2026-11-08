"""Read-only prerequisite detection in fixtures, never the real system installer."""
import os
import pathlib
import subprocess
import tempfile

repo = pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='mac-tweak-prerequisites-') as directory:
    root = pathlib.Path(directory).resolve()
    home = root / 'home'; home.mkdir()
    fakebin = root / 'bin'; fakebin.mkdir()
    sdk = root / 'sdk'; (sdk / 'usr/include').mkdir(parents=True); (sdk / 'usr/lib').mkdir()
    for name in ['usr/include/curses.h', 'usr/lib/libncurses.tbd', 'usr/lib/libiconv.tbd']:
        (sdk / name).touch()
    (fakebin / 'xcode-select').write_text('''#!/bin/bash
printf '%s\n' "$*" >> "$PREREQUISITE_SPY"
test "$1" = -p || exit 99
test "$PREREQUISITE_STATE" != missing || exit 1
printf '%s\n' "$PREREQUISITE_SDK"
''')
    (fakebin / 'xcrun').write_text('''#!/bin/bash
printf 'xcrun %s\n' "$*" >> "$PREREQUISITE_SPY"
test "$PREREQUISITE_STATE" != broken || exit 1
if test "$1" = --show-sdk-path; then printf '%s\n' "$PREREQUISITE_SDK";
elif test "$1" = --find; then printf '%s\n' "$PREREQUISITE_BIN/clang";
else exit 99; fi
''')
    for command in ['git', 'make', 'clang']:
        (fakebin / command).write_text('#!/bin/sh\nexit 0\n')
    (fakebin / 'curl').write_text('#!/bin/sh\necho UNAPPROVED_DOWNLOAD >> "$PREREQUISITE_SPY"\nexit 99\n')
    for command in fakebin.iterdir():
        command.chmod(0o755)
    spy = root / 'calls'
    environment = dict(os.environ, HOME=str(home), PATH=str(fakebin) + ':/usr/bin:/bin:/usr/sbin:/sbin',
                       PREREQUISITE_SDK=str(sdk), PREREQUISITE_BIN=str(fakebin), PREREQUISITE_SPY=str(spy))
    def check(state, *args):
        return subprocess.run(['/bin/bash', str(repo / 'src/prerequisites/check.sh'), *args],
                              env={**environment, 'PREREQUISITE_STATE': state}, capture_output=True, text=True, timeout=10)
    for state in ['missing', 'broken', 'working']:
        for components in [('tig',), ('gestures', 'closing', 'windowskeys'), ('tig', 'gestures', 'closing', 'windowskeys')]:
            if spy.exists(): spy.unlink()
            result = check(state, *components)
            assert result.returncode == (0 if state == 'working' else 1), result.stdout + result.stderr
            calls = spy.read_text()
            assert '--install' not in calls and 'UNAPPROVED_DOWNLOAD' not in calls
            if state == 'missing':
                assert 'xcrun' not in calls, 'Do not invoke developer-tool shims before installation consent.'
            for component in components:
                assert ('PREREQUISITE [command-line-tools] ' + component in result.stdout) == (state != 'working')
    spy.unlink()
    for components in [(), ('--install',), ('tig', 'unknown')]:
        assert check('working', *components).returncode == 2
        assert not spy.exists()
    for component in ['tig', 'windowskeys']:
        spy.unlink(missing_ok=True)
        result = subprocess.run(['/bin/bash', str(repo / 'tweak.sh'), 'plan', '--with', component],
                                env={**environment, 'PREREQUISITE_STATE': 'missing'}, capture_output=True, text=True, timeout=25)
        assert result.returncode != 0 and 'PREREQUISITE [command-line-tools] ' + component in result.stdout, result.stdout + result.stderr
        assert '--install' not in spy.read_text() and 'xcrun' not in spy.read_text()
        assert not list(home.iterdir()), 'Review must not create configuration or install software.'
    model = subprocess.run(['/usr/bin/osascript', '-l', 'JavaScript', str(repo / 'tests/prerequisites.js'), str(repo)],
                           env={**environment, 'MAC_TWEAK_GUI_TEST': '1'}, capture_output=True, text=True, timeout=25)
    assert model.returncode == 0 and 'PASS:' in model.stdout, model.stdout + model.stderr
    print(model.stdout.strip())
print('PASS: missing, incomplete and working toolchains; shared prerequisites; strict arguments; read-only Review; no install/download or user configuration writes')
