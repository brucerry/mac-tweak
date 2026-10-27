"""Saved configuration discovery and review is persistent, scoped and read-only."""
import json,os,pathlib,subprocess,tempfile,plistlib
repo=pathlib.Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='mac-tweak-saved-files-') as directory:
 root=pathlib.Path(directory).resolve();home=root/'home';home.mkdir();temp=root/'temporary';temp.mkdir();(root/'Applications').mkdir();store=root/'preferences.json';store.write_text(json.dumps(dict(version=1,values={'dock-recent':dict(present=True,type='boolean',value=False)})))
 env=dict(os.environ,HOME=str(home),MAC_TWEAK_MAINTENANCE_TEST='1',MAC_TWEAK_MAINTENANCE_FIXTURE=str(root),MAC_TWEAK_PREFERENCES_TEST='1',MAC_TWEAK_PREFERENCE_STORE=str(store))
 def run(*args,ok=True):
  p=subprocess.run(['/usr/bin/osascript','-l','JavaScript',str(repo/'src/maintenance/bridge.js'),str(repo/'src'),*map(str,args)],env=env,text=True,capture_output=True,timeout=10)
  assert (p.returncode==0)==ok,p.stdout+p.stderr
  return p.stdout if ok else p.stdout+p.stderr
 before=set(home.rglob('*'));rows=json.loads(run('resources','aliases'));assert all(not r['exists'] for r in rows)
 assert set(home.rglob('*'))==before
 path=home/'.config/mac-tweak/aliases.zsh';path.parent.mkdir(parents=True);path.write_text("alias ll='ls -al'\n")
 rows=json.loads(run('resources','aliases'));r=next(row for row in rows if row['path']==str(path));assert r['exists'];assert "alias ll='ls -al'" in run('view','aliases',r['id'],path)
 assert 'list changed' in run('view','aliases',r['id'],home/'unexpected',ok=False)
 assert 'Unknown saved' in run('resources','missing',ok=False)
 source=home/'dotfiles/zshrc';source.parent.mkdir();source.write_text('# personal source\n');(home/'.zshrc').symlink_to(source)
 rows=json.loads(run('resources','aliases'));r=next(row for row in rows if row['path']==str(home/'.zshrc'));assert '# personal source' in run('view','aliases',r['id'])
 rows=json.loads(run('resources','dock'));r=next(row for row in rows if row['kind']=='preference');text=run('view','dock',r['id']);assert 'false' in text and 'show-recents' in text and 'NSAutomatic' not in text
 profile=home/'.config/mac-tweak/profiles/Mac Tweak Dark.terminal';profile.parent.mkdir();profile.write_bytes(plistlib.dumps(dict(name='Mac Tweak Dark',shellExitAction=1),fmt=plistlib.FMT_BINARY))
 rows=json.loads(run('resources','terminalprofile'));r=next(row for row in rows if row['path']==str(profile));assert '<key>shellExitAction</key>' in run('view','terminalprofile',r['id'])
 run_dir=home/'.local/state/mac-tweak/runs/20261026T010000Z-111';(run_dir/'backups').mkdir(parents=True);(run_dir/'summary.txt').write_text('Selection: aliases\n');(run_dir/'backups/0').write_text('original aliases');(run_dir/'events.txt').write_text('backup|'+str(path)+'|'+str(run_dir/'backups/0')+'\n')
 rows=json.loads(run('resources','aliases'));r=next(row for row in rows if row['path']==str(run_dir/'backups/0'));assert 'original aliases' in run('view','aliases',r['id'])
 (run_dir/'events.txt').write_text((run_dir/'events.txt').read_text()+'backup|'+str(path)+'|'+str(run_dir/'backups/../../../../unknown')+'\n')
 assert not any('unknown' in row['path'] for row in json.loads(run('resources','aliases')))
 byhost=home/'Library/Preferences/ByHost/.GlobalPreferences.00000000-0000-0000-0000-000000000001.plist';byhost.parent.mkdir(parents=True);byhost.write_bytes(plistlib.dumps({'com.apple.keyboard.modifiermapping.1-2-0':[{'HIDKeyboardModifierMappingSrc':1,'HIDKeyboardModifierMappingDst':2}],'private-unrelated':'must-not-display'}))
 rows=json.loads(run('resources','windowskeys'));r=next(row for row in rows if row['kind']=='modifiers');text=run('view','windowskeys',r['id']);assert 'HIDKeyboardModifierMappingSrc' in text and 'must-not-display' not in text
 terminal=home/'Library/Preferences/com.apple.Terminal.plist';terminal.write_bytes(plistlib.dumps({'Default Window Settings':'Private Dark','Window Settings':{'Private Dark':{'name':'Private Dark','shellExitAction':1,'CommandString':'must-not-display'}}}))
 rows=json.loads(run('resources','terminalprofile'));r=next(row for row in rows if row['kind']=='profile-state');text=run('view','terminalprofile',r['id']);assert 'Private Dark' in text and 'shellExitAction' in text and 'must-not-display' not in text
 snapshot=lambda:{str(p.relative_to(home)):(p.read_bytes() if p.is_file() else None) for p in home.rglob('*')}
 before=snapshot();rows=json.loads(run('resources','aliases'));assert rows and run('view','aliases',0);assert snapshot()==before and not (home/'.local/state/mac-tweak/lock').exists()
 print('PASS: exact saved paths, absence, permanent/reopened text, scoped false preference keys, binary plist display, safe symlink review, recovery originals and stale-row guards without writes')
