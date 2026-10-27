"""Every expanded setting uses a guarded typed action, including boolean 0/1 recovery."""
import base64,json,os,pathlib,subprocess,tempfile
repo=pathlib.Path(__file__).resolve().parent.parent
catalog=json.loads((repo/'src/catalog/preferences.json').read_text())['settings']
with tempfile.TemporaryDirectory(prefix='mac-tweak-expanded-pref-') as temp:
 root=pathlib.Path(temp).resolve();home=root/'home';home.mkdir();store=root/'store.json';request=root/'request.json'
 visual={'desktop':{'provider':'dynamic'},'idle':{'provider':'macintosh','style':'dynamic','color':'darkGray'},'passwordAfterWake':True}
 initial={'version':1,'visualState':visual,'values':{'trackpad-built-in-tap':{'present':True,'type':'integer','value':0}}};store.write_text(json.dumps(initial))
 env=dict(os.environ,HOME=str(home),MAC_TWEAK_PREFERENCES_TEST='1',MAC_TWEAK_PREFERENCE_STORE=str(store))
 def bridge(*args,ok=True):
  p=subprocess.run(['/usr/bin/osascript','-l','JavaScript',str(repo/'src/preferences/bridge.js'),str(repo/'src'),*map(str,args)],env=env,capture_output=True,text=True,timeout=20)
  assert (p.returncode==0)==ok,p.stdout+p.stderr
  return p.stdout+p.stderr
 groups=list(dict.fromkeys(row['component'] for row in catalog));values=[]
 for row in catalog:
  value=True if row['type']=='boolean' else row['minimum'] if row['type']=='number' else row['values'][0]
  if row['id']=='mouse-speed':value=0.875
  values.append(dict(id=row['id'],mode='set',value=value))
 request.write_text(json.dumps(dict(version=1,values=values)))
 output=bridge('plan',','.join(groups),request,'27.0.1');marker=next(l for l in output.splitlines() if l.startswith('__PREFERENCES_PLAN__|'));encoded=marker.split('|')[2];plan=json.loads(base64.b64decode(encoded))
 assert len(plan['actions'])==len(catalog) and not json.loads(store.read_text()).get('writes')
 run=home/'.local/state/mac-tweak/runs/20261026T010000Z-101';run.mkdir(parents=True)
 bridge('snapshot',encoded,run)
 for index in range(len(plan['actions'])):bridge('apply',encoded,index,run)
 state=json.loads(store.read_text());assert state['visualState']==visual;assert state['values']['mouse-speed']['value']==0.875 and state['values']['trackpad-built-in-tap']['value'] is True
 after=bridge('plan',','.join(groups),request,'27.0.1');assert '__PREFERENCES_PLAN__|0|' in after
 recovery=bridge('recover-plan',run,'27.0.1');recovery_encoded=next(l for l in recovery.splitlines() if l.startswith('__PREFERENCES_PLAN__|')).split('|')[2]
 recovery_plan=json.loads(base64.b64decode(recovery_encoded));restore=home/'.local/state/mac-tweak/runs/20261026T010001Z-102';restore.mkdir()
 bridge('snapshot',recovery_encoded,restore)
 for index in range(len(recovery_plan['actions'])):bridge('apply',recovery_encoded,index,restore)
 assert json.loads(store.read_text())['values']==initial['values'] and json.loads(store.read_text())['visualState']==visual
 print('PASS: every expanded preference typed set, snapshots, readback, no-op and exact absence/boolean-number recovery; fractional pointer control')
