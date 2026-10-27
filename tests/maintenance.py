"""Trash lifecycle checks run exclusively in isolated roots; no source app/file is removed."""
import hashlib,json,os,pathlib,plistlib,subprocess,tempfile
repo=pathlib.Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='mac-tweak-maintenance-tests-') as directory:
 root=pathlib.Path(directory).resolve();home=root/'home';home.mkdir();temporary=root/'temporary';temporary.mkdir();applications=root/'Applications';applications.mkdir()
 env=dict(os.environ,HOME=str(home),MAC_TWEAK_MAINTENANCE_TEST='1',MAC_TWEAK_MAINTENANCE_FIXTURE=str(root))
 command=['/usr/bin/osascript','-l','JavaScript',str(repo/'src/maintenance/bridge.js'),str(repo/'src')]
 def run(*args,ok=True,extra=None):
  result=subprocess.run([*command,*map(str,args)],env=dict(env,**(extra or {})),text=True,capture_output=True,timeout=20)
  assert (result.returncode==0)==ok,result.stdout+result.stderr
  return result.stdout if ok else result.stdout+result.stderr
 def inventory(mode):return json.loads(run('inventory',mode))
 def session(mode,ids,approve=True,before=None,wrong=False):
  path=temporary/'selection.json';path.write_text(json.dumps(dict(version=1,ids=ids)));path.chmod(0o600)
  p=subprocess.Popen([*command,'session',mode,str(path)],env=env,text=True,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  first=p.stdout.readline();assert first, p.stderr.read();ready=json.loads(first);assert ready['type']=='ready',ready
  if before:before()
  p.stdin.write(('trash:'+ready['token'] if approve and not wrong else 'trash:incorrect' if wrong else 'cancel')+'\n');p.stdin.close();p.stdin=None
  out,err=p.communicate(timeout=25)
  if wrong: assert p.returncode!=0 and 'does not match' in err;return None
  assert p.returncode==0,out+err
  values=[json.loads(line) for line in out.splitlines() if line.strip()];return next(row for row in values if row['type']=='result')
 def make_stage(name='20261026T010000Z-999999'):
  path=home/'.local/state/mac-tweak/runs'/name/'stage';path.mkdir(parents=True,exist_ok=True);(path/'download').write_text('download bytes');return path
 stage=make_stage();backup=stage.parent/'backups';backup.mkdir();(backup/'original').write_text('recovery original')
 orphan=temporary/'mac-tweak-gui-00000000-0000-0000-0000-000000000001';orphan.mkdir();(orphan/'session.json').write_text(json.dumps(dict(version=1,pid=999999,uid=os.getuid(),start='gone')))
 (stage/'.hidden').write_bytes(b'12345');(stage/'nested').mkdir();(stage/'nested/extra').write_bytes(b'abc');(stage/'linked-original').symlink_to(backup/'original')
 rows=inventory('cleanup');assert next(r for r in rows if r['path']==str(stage))['bytes']==len(b'download bytes')+8
 assert all(row['selected'] is False for row in rows);assert not any('/backups' in row['path'] for row in rows)
 assert stage.exists() and orphan.exists() and not (home/'.Trash').exists()
 selected=next(r for r in rows if r['path']==str(stage))
 assert session('cleanup',[selected['id']],False)['status']=='cancelled' and stage.exists()
 session('cleanup',[selected['id']],wrong=True);assert stage.exists() and not (home/'.local/state/mac-tweak/maintenance').exists()
 print('PASS: read-only cleanup inventory, no defaults, exact paths, recovery protection, cancellation and wrong-token rejection',flush=True)
 result=session('cleanup',[selected['id']]);assert result['status']=='completed',result
 assert not stage.exists() and pathlib.Path(result['items'][0]['trash']).is_dir() and (backup/'original').read_text()=='recovery original'
 assert pathlib.Path(result['receipt']).is_file() and not (home/'.local/state/mac-tweak/lock').exists()
 print('PASS: accepted cleanup uses isolated Trash and persistent receipts while retaining recovery originals',flush=True)
 stage=make_stage();item=next(r for r in inventory('cleanup') if r['path']==str(stage))
 result=session('cleanup',[item['id']],before=lambda:(stage/'download').write_text('changed bytes'))
 assert result['status']=='failed' and stage.exists() and 'changed' in result['message'].lower(),result
 assert session('cleanup',[item['id']],before=lambda:(home/'.local/state/mac-tweak/lock').mkdir())['status']=='failed'
 (home/'.local/state/mac-tweak/lock').rmdir()
 print('PASS: stale content and concurrent setup locks reject removal before moving items',flush=True)
 # Old-config cleanup only includes validated backup records, preserving all active files/apps.
 app=applications/'Example.app';(app/'Contents').mkdir(parents=True);(app/'Contents/Info.plist').write_bytes(plistlib.dumps(dict(CFBundleIdentifier='org.example.test')))
 current=home/'.config/mac-tweak/aliases.zsh';current.parent.mkdir(parents=True);current.write_text('new config')
 old=backup/'0';old.write_text('old config')
 events=stage.parent/'events.txt';events.write_text('\n'.join(['backup|'+str(current)+'|'+str(old),'changed|'+str(current)+'|hash'])+'\n')
 rows=inventory('remove');assert [r['path'] for r in rows]==[str(old)],rows
 old_row=rows[0];assert not old_row['blocked']
 result=session('remove',[old_row['id']],False);assert result['status']=='cancelled' and old.exists()
 result=session('remove',[old_row['id']],before=lambda:current.write_text('later edits'));assert result['status']=='failed' and old.exists(),result
 row=inventory('remove')[0];result=session('remove',[row['id']]);assert result['status']=='completed' and not old.exists() and current.read_text()=='later edits' and app.exists(),result
 print('PASS: current-only old-config cleanup preserves current files and apps; cancellation and stale successors are guarded',flush=True)
 old.write_text('original again');events.write_text('backup|'+str(current)+'|'+str(old)+'\nfailed|aliases|\n')
 assert inventory('remove')[0]['blocked'] and old.exists()
 events.write_text('backup|'+str(current)+'|'+str(home/'unrelated')+'\ncompleted|run|\n');(home/'unrelated').write_text('private')
 assert not inventory('remove') and (home/'unrelated').exists()
 print('PASS: incomplete runs and forged backup locations never authorize removal',flush=True)
 # A separate current helper may run; only an executing old backup is protected.
 helper=home/'Applications/WindowsKeys.app';(helper/'Contents').mkdir(parents=True);(helper/'Contents/Info.plist').write_bytes(plistlib.dumps(dict(CFBundleIdentifier='local.bruce.WindowsKeys')))
 helper_run=home/'.local/state/mac-tweak/runs/20261026T011000Z-999912';old_helper=helper_run/'backups/WindowsKeys.app';(old_helper/'Contents').mkdir(parents=True);(old_helper/'Contents/Info.plist').write_bytes(plistlib.dumps(dict(CFBundleIdentifier='local.bruce.WindowsKeys')))
 (helper_run/'events.txt').write_text('helper-backup|'+str(helper)+'|'+str(old_helper)+'\nhelper-installed|'+str(helper)+'|hash\n')
 row=next(r for r in inventory('remove') if r['path']==str(old_helper));assert not row['blocked']
 result=session('remove',[row['id']],before=lambda:(root/'running.json').write_text(json.dumps([str(old_helper)])));assert result['status']=='failed' and old_helper.exists()
 assert next(r for r in inventory('remove') if r['id']==row['id'])['blocked']
 (root/'running.json').write_text(json.dumps([str(helper)]));row=next(r for r in inventory('remove') if r['path']==str(old_helper));assert not row['blocked'];assert session('remove',[row['id']])['status']=='completed' and helper.exists() and not old_helper.exists()
 print('PASS: legacy per-item successes are eligible; running current helpers continue while executing old copies remain protected',flush=True)
 # Preference originals are a deliberate separate choice; current values remain untouched.
 store=root/'store.json';store.write_text(json.dumps(dict(version=1,values={'dock-size':dict(present=True,type='integer',value=32)})))
 env.update(MAC_TWEAK_PREFERENCES_TEST='1',MAC_TWEAK_PREFERENCE_STORE=str(store))
 def apply_dock():
  result=subprocess.run(['/bin/bash',str(repo/'tweak.sh'),'apply','--with','dock','--yes'],env=env,text=True,capture_output=True,timeout=30)
  assert result.returncode==0,(result.stdout+result.stderr)[-2000:]
 apply_dock();row=next(r for r in inventory('remove') if r['path'].endswith('/preferences.json'));snapshot=pathlib.Path(row['path']);assert not row['blocked'],row
 legacy_events=snapshot.parent/'events.txt';legacy_events.write_text(legacy_events.read_text().replace('completed|run|\n',''));assert not next(r for r in inventory('remove') if r['id']==row['id'])['blocked']
 history=json.loads(snapshot.read_text());keep=next(value['id'] for value in history['plan']['desired'] if value['choice']['mode']=='keep');history['plan']['desired']=[value for value in history['plan']['desired'] if value['id']!=keep];snapshot.write_text(json.dumps(history));assert not next(r for r in inventory('remove') if r['id']==row['id'])['blocked']
 assert session('remove',[row['id']],False)['status']=='cancelled' and snapshot.exists()
 def later_preference():
  value=json.loads(store.read_text());value['values']['dock-size']=dict(present=True,type='integer',value=88);store.write_text(json.dumps(value))
 assert session('remove',[row['id']],before=later_preference)['status']=='failed' and snapshot.exists()
 row=next(r for r in inventory('remove') if r['path']==str(snapshot));before_store=store.read_bytes();result=session('remove',[row['id']]);assert result['status']=='completed' and not snapshot.exists() and store.read_bytes()==before_store
 assert (snapshot.parent/'events.txt').is_file() and (snapshot.parent/'preferences-results').is_dir()
 apply_dock();row=next(r for r in inventory('remove') if r['path'].endswith('/preferences.json'));outcome=next((pathlib.Path(row['path']).parent/'preferences-results').glob('*.json'));value=json.loads(outcome.read_text());value['status']='uncertain';outcome.write_text(json.dumps(value))
 assert next(r for r in inventory('remove') if r['id']==row['id'])['blocked']
 print('PASS: preference-original cancellation, stale-current protection, accepted current-only cleanup and uncertain-record protection',flush=True)
 a=make_stage('20261026T010001Z-999998');b=make_stage('20261026T010002Z-999997');rows=inventory('cleanup');chosen=[next(r for r in rows if r['path']==str(p)) for p in [a,b]]
 (root/'fail-trash.json').write_text(json.dumps([chosen[1]['id']]));result=session('cleanup',[r['id'] for r in chosen]);assert result['status']=='partial-failure' and result['items'][0]['status']=='completed' and result['items'][1]['status']=='failed',result
 assert not a.exists() and b.exists();assert json.loads(pathlib.Path(result['receipt']).read_text())['status']=='partial-failure'
 print('PASS: partial Trash failures retain completed/failed outcomes and accurate recoverable destinations',flush=True)
 # Interrupted work keeps attempting/unknown records and recoverable Trash contents.
 interrupted=make_stage('20261026T010003Z-999996');row=next(r for r in inventory('cleanup') if r['path']==str(interrupted));(root/'pause-after-move.json').write_text(json.dumps([row['id']]))
 request=temporary/'selection.json';request.write_text(json.dumps(dict(version=1,ids=[row['id']])))
 p=subprocess.Popen([*command,'session','cleanup',str(request)],env=env,text=True,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 ready=json.loads(p.stdout.readline());p.stdin.write('trash:'+ready['token']+'\n');p.stdin.flush();receipt=''
 while True:
  event=json.loads(p.stdout.readline())
  if event['type']=='receipt':receipt=event['path']
  if event['type']=='paused':destination=event['trash'];break
 p.kill();p.communicate(timeout=5);assert not interrupted.exists() and pathlib.Path(destination).is_dir()
 record=json.loads(pathlib.Path(receipt).read_text());assert record['items'][0]['status']=='attempting' and (home/'.local/state/mac-tweak/lock').exists()
 import shutil
 shutil.rmtree(home/'.local/state/mac-tweak/lock');(root/'pause-after-move.json').unlink()
 print('PASS: interruption retains attempting/unknown outcomes and recoverable Trash destinations without claiming rollback',flush=True)
 lock=home/'.local/state/mac-tweak/lock';lock.mkdir();(lock/'pid').write_text('99998\n');status=json.loads(run('lock-status'));assert status['state']=='stale'
 assert 'changed' in run('release-lock','incorrect',ok=False) and lock.exists()
 (lock/'pid').write_text(str(os.getpid())+'\n');assert json.loads(run('lock-status'))['state']=='active';assert 'changed' in run('release-lock',status['token'],ok=False) and lock.exists()
 (lock/'pid').write_text('99998\n');status=json.loads(run('lock-status'));result=json.loads(run('release-lock',status['token']));assert not lock.exists() and pathlib.Path(result['preserved']).is_dir()
 print('PASS: explicit abandoned-lock recovery preserves records, rejects changed/active owners and requires the exact reviewed token',flush=True)
 # Unsupported paths cannot be introduced through an accepted request.
 request.write_text(json.dumps(dict(version=1,ids=[hashlib.sha256(str(backup).encode()).hexdigest()])));assert 'no longer available' in run('session','cleanup',request,ok=False)
 assert 'isolated temporary root' in run('inventory','remove',ok=False,extra=dict(MAC_TWEAK_MAINTENANCE_FIXTURE=str(repo)))
 print('PASS: forged recovery paths and production-root fixture bypasses are rejected',flush=True)
