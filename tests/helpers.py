"""Compile/self-check helpers and exercise installation without starting input hooks."""
import json, os, pathlib, plistlib, subprocess, tempfile, shutil
repo=pathlib.Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='mac-tweak-helper-tests-') as temporary:
    root=pathlib.Path(temporary).resolve(); home=root/'home'; home.mkdir(); store=root/'store.json'; store.write_text('{"version":1,"values":{}}')
    env=dict(os.environ,HOME=str(home),PATH='/usr/bin:/bin:/usr/sbin:/sbin',MAC_TWEAK_TEST_GESTURES_OS='27',MAC_TWEAK_PREFERENCES_TEST='1',MAC_TWEAK_PREFERENCE_STORE=str(store))
    def run(*args,ok=True,extra=None):
        result=subprocess.run(['/bin/bash',str(repo/'tweak.sh'),*args],env=dict(env,**(extra or {})),text=True,capture_output=True,timeout=90)
        assert (result.returncode==0)==ok,result.stdout+result.stderr
        return result.stdout+result.stderr
    probe=['/usr/bin/osascript','-l','JavaScript',str(repo/'src/preferences/bridge.js'),str(repo/'src'),'plan','gestures','-','15.0']
    unsupported=dict(env);unsupported.pop('MAC_TWEAK_TEST_GESTURES_OS',None)
    result=subprocess.run(probe,env=unsupported,text=True,capture_output=True,timeout=20);assert result.returncode!=0 and 'Unsupported macOS' in result.stderr
    result=subprocess.run(probe,env=env,text=True,capture_output=True,timeout=20);assert result.returncode==0,result.stderr
    production=dict(env);production.pop('MAC_TWEAK_PREFERENCE_STORE');production.pop('MAC_TWEAK_PREFERENCES_TEST')
    result=subprocess.run(probe,env=production,text=True,capture_output=True,timeout=20);assert result.returncode!=0 and 'Unsupported macOS' in result.stderr
    print('PASS: macOS 27 simulation is limited to a validated isolated preference store; production host gates cannot be bypassed',flush=True)
    before=list(home.rglob('*')); plan=run('plan','--with','windowskeys,gestures,closing,terminalprofile')
    assert len(list(home.rglob('*')))==len(before) and 'HELPER_CHANGE [windowskeys]' in plan
    assert not json.loads(store.read_text()).get('writes')
    print('PASS: helper and profile reviews are read-only and disclose startup/permission steps',flush=True)
    text=run('apply','--with','windowskeys,gestures,closing,terminalprofile','--yes')
    assert 'Application complete' in text,text
    for group,name in [('windowskeys','WindowsKeys'),('gestures','DockMinimizer'),('closing','QuitOnRed')]:
        app=home/'Applications'/f'{name}.app'; assert (app/'Contents/MacOS'/name).stat().st_mode & 0o111
        result=subprocess.run([str(app/'Contents/MacOS'/name),'--self-test'],capture_output=True,text=True,timeout=10)
        assert result.returncode==0,result.stderr
        with open(home/'Library/LaunchAgents'/f'org.macossetup.{group}.plist','rb') as file:agent=plistlib.load(file)
        assert agent['ProgramArguments']==['/usr/bin/open','-gj',str(app)] and agent['RunAtLoad'] is True
    assert not (home/'.zshrc').exists()
    for p in (home/'.config/mac-tweak/profiles').glob('*.terminal'):
        with p.open('rb') as f:profile=plistlib.load(f)
        assert profile['shellExitAction']==1 and not {'CommandString','RunCommandAsShell','Shell','WorkingDirectory'}.intersection(profile)
    text=run('verify','--with','windowskeys,gestures,closing,terminalprofile')
    assert '0 preference change(s)' in text and 'HELPER_CHANGE' not in text,text
    runs=len(list((home/'.local/state/mac-tweak/runs').iterdir()))
    assert 'Nothing to change' in run('apply','--with','windowskeys,gestures,closing,terminalprofile','--yes')
    assert len(list((home/'.local/state/mac-tweak/runs').iterdir()))==runs
    print('PASS: three native helper builds/self-checks, sanitized profiles, owned installation, login files, verification and repeat no-op; no helpers launched',flush=True)
    original=home/'Applications/WindowsKeys.app/Contents/MacOS/WindowsKeys'
    original.write_bytes(original.read_bytes()+b'changed')
    assert 'existing helper will be preserved' in run('plan','--with','windowskeys',ok=False)
    print('PASS: changed/unowned helpers require separately reviewed preservation',flush=True)
    other=root/'failure-home';other.mkdir(); failstore=root/'failure-store.json';failstore.write_text('{"version":1,"values":{}}');fake=root/'fakebin';fake.mkdir()
    compiler=fake/'xcrun';compiler.write_text('#!/bin/bash\nif test "$1" = swiftc; then echo "injected build failure" >&2; exit 1; fi\nexec /usr/bin/xcrun "$@"\n');compiler.chmod(0o755)
    text=run('apply','--with','windowskeys','--yes',ok=False,extra=dict(HOME=str(other),MAC_TWEAK_PREFERENCE_STORE=str(failstore),PATH=str(fake)+':'+env['PATH']))
    assert 'build or self-check failed' in text and not (other/'Applications').exists() and not (other/'Library').exists()
    assert not json.loads(failstore.read_text()).get('writes')
    print('PASS: compiler failure precedes helper, preference and login mutations',flush=True)
