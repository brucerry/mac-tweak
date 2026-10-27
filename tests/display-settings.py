"""Hybrid display choices and host-scoped timing; no production settings are written."""
import base64,json,os,pathlib,subprocess,tempfile
repo=pathlib.Path(__file__).resolve().parent.parent
catalog={row['id']:row for row in json.loads((repo/'src/catalog/preferences.json').read_text())['settings']}
assert all(catalog[key]['choice']['mode']=='keep' for key in ['screensaver-idle','appearance-style','appearance-auto','accessibility-reduce-motion'])
with tempfile.TemporaryDirectory(prefix='mac-tweak-display-') as temporary:
 root=pathlib.Path(temporary).resolve();home=root/'home';home.mkdir();store=root/'store.json';store.write_text(json.dumps(dict(version=1,values={'appearance-style':dict(present=True,type='string',value='Light')},anyHost={'screensaver-idle':dict(present=True,type='integer',value=600)})))
 environment=dict(os.environ,HOME=str(home),MAC_TWEAK_PREFERENCES_TEST='1',MAC_TWEAK_PREFERENCE_STORE=str(store))
 def setup(*args,ok=True):
  result=subprocess.run(['/bin/bash',str(repo/'tweak.sh'),*map(str,args)],env=environment,capture_output=True,text=True,timeout=30)
  assert (result.returncode==0)==ok,result.stdout+result.stderr
  return result.stdout+result.stderr
 before=store.read_bytes();
 for component in ['displays','power']:
  plan=setup('plan','--with',component);assert 'GUIDED ['+component+']' in plan and 'GUIDED [protection]' not in plan and store.read_bytes()==before
  assert 'MANUAL ['+component+']' in setup('verify','--with',component) and store.read_bytes()==before
 plan=setup('plan','--preset','display');assert '0 preference change(s)' in plan and 'GUIDED [wallpaper]' in plan and 'GUIDED [protection]' in plan
 assert store.read_bytes()==before and not list(home.iterdir())
 assert '0 preference change(s)' in setup('plan','--with','appearance') and store.read_bytes()==before
 request=root/'choices.json';request.write_text(json.dumps(dict(version=1,values=[dict(id='screensaver-idle',mode='set',value=300)])))
 plan=setup('plan','--preset','display','--preferences-file',request);assert 'PREFERENCE_CHANGE [screensaver]' in plan and store.read_bytes()==before
 setup('apply','--preset','display','--preferences-file',request,'--yes')
 data=json.loads(store.read_text());assert data['values']['screensaver-idle']['value']==300 and data['anyHost']['screensaver-idle']['value']==600 and data['values']['appearance-style']['value']=='Light'
 run=next((home/'.local/state/mac-tweak/runs').iterdir());snapshot=json.loads((run/'preferences.json').read_text());assert snapshot['originals'][0]['scope']=='current-user-current-host' and snapshot['originals'][0]['original']['state']['present'] is False
 assert 'MANUAL [wallpaper]' in setup('verify','--preset','display','--preferences-file',request)
 count=len(list((home/'.local/state/mac-tweak/runs').iterdir()));assert 'Nothing to change' in setup('apply','--preset','display','--preferences-file',request,'--yes');assert len(list((home/'.local/state/mac-tweak/runs').iterdir()))==count
 setup('recover-preferences','--run',run.name,'--yes');assert 'screensaver-idle' not in json.loads(store.read_text())['values'] and json.loads(store.read_text())['anyHost']['screensaver-idle']['value']==600
 print('PASS: hybrid Display selection, read-only default/appearance preservation, host-scoped timing, originals, inherited fallback, no-op and exact recovery',flush=True)
 data=json.loads(store.read_text());data['forced']=['screensaver-idle'];store.write_text(json.dumps(data));before=store.read_bytes();assert 'Managed policy' in setup('apply','--with','screensaver','--preferences-file',request,'--yes',ok=False);assert store.read_bytes()==before
 data.pop('forced');store.write_text(json.dumps(data));request.write_text(json.dumps(dict(version=1,values=[dict(id='screensaver-idle',mode='set',value=61)])));setup('plan','--with','screensaver','--preferences-file',request,ok=False)
 print('PASS: managed screen-saver timing blocks application; invalid minute steps are rejected',flush=True)
