"""Destination layout compatibility; all writes stay in disposable homes."""
import hashlib,json,os,pathlib,subprocess,tempfile
repo=pathlib.Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='mac-tweak-compat-') as temporary:
    root=pathlib.Path(temporary).resolve();store=root/'store.json';store.write_text('{"version":1,"values":{}}')
    for legacy in [False,True]:
        home=root/('legacy' if legacy else 'new');home.mkdir();name='macos-setup' if legacy else 'mac-tweak'
        if legacy:
            (home/'.config/macos-setup').mkdir(parents=True)
            (home/'.zshrc').write_text('# personal setting\n# >>> macos-setup >>>\n[[ ! -f "$HOME/.config/macos-setup/init.zsh" ]] || source "$HOME/.config/macos-setup/init.zsh"\n# <<< macos-setup <<<\n')
        if legacy:
            owner=home/'.local/state/macos-setup/ownership'/hashlib.sha256(str(home/'.zshrc').encode()).hexdigest();owner.parent.mkdir(parents=True);owner.write_text(hashlib.sha256(('\n'.join((home/'.zshrc').read_text().splitlines()[1:])+'\n').encode()).hexdigest()+'\n')
        environment=dict(os.environ,HOME=str(home),PATH='/usr/bin:/bin:/usr/sbin:/sbin',MAC_TWEAK_PREFERENCES_TEST='1',MAC_TWEAK_PREFERENCE_STORE=str(store))
        def setup(*args,ok=True):
            result=subprocess.run(['/bin/bash',str(repo/'tweak.sh'),*args],env=environment,capture_output=True,text=True,timeout=25)
            assert (result.returncode==0)==ok,(result.stdout+result.stderr)[-2000:]
            return (result.stdout+result.stderr)[-2000:]
        assert 'Application complete' in setup('apply','--with','aliases,terminalprofile','--yes')
        assert (home/'.config'/name/'aliases.zsh').is_file()
        probe='ObjC.import("Foundation");var layout=(0,eval)(ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError('+json.dumps(str(repo/'src/project.js'))+',$.NSUTF8StringEncoding,Ref())));layout.storage('+json.dumps(str(home))+')'
        assert subprocess.check_output(['/usr/bin/osascript','-l','JavaScript','-e',probe],text=True).strip()==name
        expected='Mac Setup Dark.terminal' if legacy else 'Mac Tweak Dark.terminal'
        assert (home/'.config'/name/'profiles'/expected).is_file()
        assert not (home/'.config'/('mac-tweak' if legacy else 'macos-setup')).exists()
        startup=(home/'.zshrc').read_text();assert startup.count('# >>>')==1 and name+'/init.zsh' in startup
        if legacy:assert '# personal setting' in startup
        assert 'Nothing to change' in setup('apply','--with','aliases,terminalprofile','--yes')
        (home/'.zshrc').write_text(startup+'# >>> mac-tweak >>>\n# <<< mac-tweak <<<\n')
        assert 'marker' in setup('plan','--with','aliases',ok=False).lower()
print('PASS: Mac Tweak new-install layout, legacy storage/profile/startup compatibility, repeat no-op and duplicate-marker protection')
