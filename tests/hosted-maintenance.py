"""Actual source/release hosts and native Trash, confined to newly created fixtures."""
import argparse,json,os,pathlib,plistlib,shutil,subprocess,tempfile
repo=pathlib.Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--mode',action='append',choices=['ux-native-reveal','ux-cleanup-native','ux-cleanup-failure','ux-cleanup-interrupt']);parser.add_argument('--host',action='append',choices=['source','standalone']);options=parser.parse_args()
with tempfile.TemporaryDirectory(prefix='mac-tweak-hosted-utilities-') as directory:
 root=pathlib.Path(directory).resolve();home=root/'home';home.mkdir();(root/'temporary').mkdir();(root/'Applications').mkdir()
 store=root/'store.json';store.write_text('{"version":1,"values":{}}')
 current=home/'.config/mac-tweak/aliases.zsh';current.parent.mkdir(parents=True);current.write_text("alias ll='ls -al'\n")
 app=root/'Mac Tweak.app';resources=app/'Contents/Resources';binary=app/'Contents/MacOS';binary.mkdir(parents=True);resources.mkdir()
 shutil.copytree(repo/'src',resources/'src')
 (app/'Contents/Info.plist').write_bytes(plistlib.dumps(dict(CFBundleIdentifier='io.github.brucerry.MacTweak',CFBundleName='Mac Tweak',CFBundleExecutable='MacTweak',CFBundlePackageType='APPL',CFBundleVersion='0.1.0',LSUIElement=False)))
 subprocess.run(['xcrun','swiftc','-O',str(repo/'src/app/Launcher.swift'),'-o',str(binary/'MacTweak')],check=True,capture_output=True)
 subprocess.run(['codesign','--force','--sign','-',str(app)],check=True,capture_output=True)
 baseenv=dict(os.environ,HOME=str(home),MAC_TWEAK_GUI_TEST='1',MAC_TWEAK_PREFERENCES_TEST='1',MAC_TWEAK_PREFERENCE_STORE=str(store),MAC_TWEAK_MAINTENANCE_TEST='1',MAC_TWEAK_MAINTENANCE_FIXTURE=str(root),MAC_TWEAK_HOSTED_MAINTENANCE_TEST='1')
 source=['/usr/bin/osascript','-l','JavaScript',str(repo/'src/app/host.js'),str(repo)]
 for host,command in [('source',source),('standalone',[str(binary/'MacTweak')])]:
  if options.host and host not in options.host:continue
  for mode in options.mode or ['ux-native-reveal','ux-cleanup-native','ux-cleanup-failure','ux-cleanup-interrupt']:
   env=dict(baseenv);stage=home/'.local/state/mac-tweak/runs/20261026T010000Z-999999/stage';stage.mkdir(parents=True,exist_ok=True);(stage/'download').write_text('temporary bytes');inode=stage.stat().st_ino
   if mode=='ux-native-reveal':env['MAC_TWEAK_GUI_TEST_FOREGROUND']='1'
   # Finish each case independently while retaining previous receipts.
   for marker in ['fail-trash.json','pause-after-move.json']:(root/marker).unlink(missing_ok=True)
   if mode=='ux-cleanup-native':env['MAC_TWEAK_NATIVE_TRASH_TEST']='1'
   if mode in ['ux-cleanup-failure','ux-cleanup-interrupt']:
    import hashlib
    marker='fail-trash.json' if mode.endswith('failure') else 'pause-after-move.json';(root/marker).write_text(json.dumps([hashlib.sha256(str(stage).encode()).hexdigest()]))
   previous=set((home/'.local/state/mac-tweak/maintenance').glob('*/receipt.json'))
   try:
    if host=='standalone' and mode=='ux-native-reveal':
     output=root/'native-stdout.txt';errors=root/'native-stderr.txt';args=['/usr/bin/open','-W','--stdout',str(output),'--stderr',str(errors)]
     for key,value in env.items():
      if key in ['HOME','PATH','ZDOTDIR'] or key.startswith('MAC_TWEAK_'):args+=['--env',key+'='+value]
     result=subprocess.run([*args,str(app),'--args','--smoke-'+mode],text=True,capture_output=True,timeout=45);result.stdout=output.read_text() if output.exists() else '';result.stderr=errors.read_text() if errors.exists() else ''
    else:result=subprocess.run([*command,'--smoke-'+mode],env=env,text=True,capture_output=True,timeout=45)
    assert result.returncode==0 and 'PASS:' in result.stdout+result.stderr and 'FAIL:' not in result.stdout+result.stderr,result.stdout+result.stderr
    assert current.read_text()=="alias ll='ls -al'\n" and not (home/'.local/state/mac-tweak/lock').exists()
    if mode=='ux-cleanup-native':
     receipts=[json.loads(p.read_text()) for p in set((home/'.local/state/mac-tweak/maintenance').glob('*/receipt.json'))-previous];assert len(receipts)==1
     item=next(item for receipt in receipts for item in receipt['items'] if item['status']=='completed' and item['path']==str(stage) and item['trash'].startswith(str(pathlib.Path.home()/'.Trash')+'/'))
     destination=pathlib.Path(item['trash']);assert destination.stat().st_ino==inode and not stage.exists()
    print('PASS: '+host+' hosted '+mode+'; native result, idle progress and reusable utilities',flush=True)
   except BaseException as error:
    print('Hosted failure:',host,mode,getattr(error,'stdout',None),getattr(error,'stderr',None),flush=True)
    for log in (root/'temporary').glob('mac-tweak-gui-*/stderr'):print(log.read_text()[-3000:],flush=True)
    raise
   finally:
    # Never target production hosts. Failures may leave only this fixture's app.
    script="ObjC.import('AppKit');function run(argv){var a=$.NSRunningApplication.runningApplicationsWithBundleIdentifier('io.github.brucerry.MacTweak'),p=[];for(var i=0;i<Number(a.count);i++){var app=a.objectAtIndex(i),path=ObjC.unwrap(app.executableURL.path);if(path.indexOf(argv[0]+'/')===0)p.push({pid:Number(app.processIdentifier),path:path});}return JSON.stringify(p);}"
    running=subprocess.run(['/usr/bin/osascript','-l','JavaScript','-e',script,str(root)],text=True,capture_output=True,timeout=5)
    for own in json.loads(running.stdout or '[]'):
     actual=subprocess.run(['/bin/ps','-p',str(own['pid']),'-o','comm='],text=True,capture_output=True).stdout.strip()
     if actual==own['path']:
      try:os.kill(own['pid'],15)
      except ProcessLookupError:pass
