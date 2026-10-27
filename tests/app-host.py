"""Real source and release hosts with private homes; no input hooks or desktop capture."""
import json,os,pathlib,plistlib,subprocess,tempfile,shutil,time,sys,signal
repo=pathlib.Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='mac-tweak-host-tests-') as directory:
 root=pathlib.Path(directory).resolve();home=root/'home';home.mkdir();(root/'temporary').mkdir();(root/'Applications').mkdir()
 env=dict(os.environ,HOME=str(home),MAC_TWEAK_GUI_TEST='1',MAC_TWEAK_MAINTENANCE_TEST='1',MAC_TWEAK_MAINTENANCE_FIXTURE=str(root))
 app=root/'Mac Tweak.app';resources=app/'Contents/Resources';binary=app/'Contents/MacOS';(resources/'src/app').mkdir(parents=True);binary.mkdir()
 shutil.copytree(repo/'src',resources/'src',dirs_exist_ok=True)
 (app/'Contents/Info.plist').write_bytes(plistlib.dumps(dict(CFBundleIdentifier='io.github.brucerry.MacTweak',CFBundleName='Mac Tweak',CFBundleDisplayName='Mac Tweak',CFBundleExecutable='MacTweak',CFBundlePackageType='APPL',CFBundleVersion='0.1.0',LSUIElement=False)))
 subprocess.run(['xcrun','swiftc','-O',str(repo/'src/app/Launcher.swift'),'-o',str(binary/'MacTweak')],check=True,capture_output=True)
 subprocess.run(['codesign','--force','--sign','-',str(app)],check=True,capture_output=True)
 policy=root/'main.swift';policy.write_text("""import AppKit
if CommandLine.arguments[1]=="--running-quit" {
    guard let app=NSRunningApplication(processIdentifier:Int32(CommandLine.arguments[2])!),app.executableURL?.path==CommandLine.arguments[3] else {exit(2)}
    let sender=NSApplication.shared;sender.setActivationPolicy(.prohibited)
    DispatchQueue.main.async {
        let accepted=app.terminate();print(accepted ? 0 : 1);fflush(stdout);let deadline=Date(timeIntervalSinceNow:3)
        _ = Timer.scheduledTimer(withTimeInterval:0.03,repeats:true) { timer in if app.isTerminated || Date()>=deadline {timer.invalidate();sender.terminate(nil)} }
    }
    sender.run();exit(0)
}
if CommandLine.arguments[1]=="--quit" {
    guard let app=NSRunningApplication(processIdentifier:Int32(CommandLine.arguments[2])!),app.executableURL?.path==CommandLine.arguments[3] else {exit(2)}
    let target=NSAppleEventDescriptor(processIdentifier:app.processIdentifier)
    let event=NSAppleEventDescriptor.appleEvent(withEventClass:AEEventClass(kCoreEventClass),eventID:AEEventID(kAEQuitApplication),targetDescriptor:target,returnID:AEReturnID(kAutoGenerateReturnID),transactionID:AETransactionID(kAnyTransactionID))
    do {let reply=try event.sendEvent(options:.waitForReply,timeout:2);print(reply.paramDescriptor(forKeyword:AEKeyword(keyErrorNumber))?.int32Value ?? 0)}
    catch {let code=(error as NSError).code;print(code);if code != -128 {fputs(String(describing:error),stderr);exit(3)}}
    exit(0)
}
let value=try! JSONSerialization.jsonObject(with:Data(CommandLine.arguments[1].utf8)) as! [String:Any]
precondition(WindowActionPolicy.allowsTarget(bundleID:value["id"] as? String,path:value["path"] as? String,regular:value["regular"] as! Bool))
print("PASS: actual host metadata is accepted by the installed helper policy")
""")
 subprocess.run(['xcrun','swiftc',str(repo/'src/behaviors/shared/InteractionSafety.swift'),str(policy),'-o',str(root/'policy')],check=True,capture_output=True)
 for command in [['/usr/bin/osascript','-l','JavaScript',str(repo/'src/app/host.js'),str(repo),'--smoke-ux-host'],[str(binary/'MacTweak'),'--smoke-ux-host']]:
  result=subprocess.run(command,env=env,capture_output=True,text=True,timeout=40);text=result.stdout+result.stderr
  assert result.returncode==0 and 'PASS: native Mac Tweak app identity' in text and 'FAIL:' not in text,text
  identity=json.loads(next(line.removeprefix('IDENTITY: ') for line in text.splitlines() if line.startswith('IDENTITY: ')))
  check=subprocess.run([str(root/'policy'),json.dumps(identity)],capture_output=True,text=True);assert check.returncode==0,check.stderr
  print(text.strip());print(check.stdout.strip())
 result=subprocess.run([str(binary/'MacTweak'),'--self-test'],env=env,capture_output=True,text=True,timeout=20);assert result.returncode==0 and 'PASS: native GUI' in result.stdout,result.stdout+result.stderr
 print('PASS: bundled host self-test uses the same JXA runtime in its own process')
 # Address normal Quit by PID and wait for its reply. An asynchronous enqueue
 # result alone cannot prove delivery or an active-work cancellation.
 def native(action,report):
  if action=='quit':
   value=subprocess.run([str(root/'policy'),'--running-quit' if report['mode']=='ux-host-external-quit' else '--quit',str(report['pid']),report['path']],capture_output=True,text=True,timeout=5);assert value.returncode==0,value.stdout+value.stderr;return value.stdout.strip()
  script='''ObjC.import('AppKit');function run(argv){var pid=Number(argv[1]),expected=argv[2],a=$.NSRunningApplication.runningApplicationWithProcessIdentifier(pid);if(argv[0]==='quit'){if(ObjC.unwrap(a.executableURL.path)!==expected)throw new Error('Wrong target app.');return String(a.terminate);}var apps=$.NSRunningApplication.runningApplicationsWithBundleIdentifier('io.github.brucerry.MacTweak'),count=0;for(var i=0;i<Number(apps.count);i++){try{if(ObjC.unwrap(apps.objectAtIndex(i).executableURL.path)===expected)count++;}catch(_){}}return String(count);}'''
  value=subprocess.run(['/usr/bin/osascript','-l','JavaScript','-e',script,action,str(report['pid']),report['path']],capture_output=True,text=True,timeout=5);assert value.returncode==0,value.stdout+value.stderr;return value.stdout.strip()
 def wait_for(p,predicate,timeout=10):
  deadline=time.monotonic()+timeout
  while time.monotonic()<deadline:
   value=predicate()
   if value:return value
   if p.poll() is not None:raise AssertionError('Host exited before the delayed lifecycle event: '+str(p.communicate()))
   time.sleep(.05)
  raise AssertionError('Host did not complete the delayed lifecycle event within '+str(timeout)+' seconds.')
 modes=[value.split('=',1)[1] for value in sys.argv if value.startswith('--lifecycle-mode=')] or ['close','menu-quit','external-quit','reopen','busy-close','busy-external','modal-quit']
 source=['/usr/bin/osascript','-l','JavaScript',str(repo/'src/app/host.js'),str(repo)]
 # Exercise the public GUI entry through LaunchServices; direct executable
 # identity and model checks remain above.
 native_out=root/'native-stdout.txt';native_err=root/'native-stderr.txt'
 native_open=['/usr/bin/open','-g','-W','--stdout',str(native_out),'--stderr',str(native_err)]
 for key,value in env.items():
  if key in ['HOME','PATH','ZDOTDIR'] or key.startswith('MAC_TWEAK_'):native_open+=['--env',key+'='+value]
 native_open+=[str(app),'--args']
 for host,base in [('source',source),('standalone',native_open)]:
  for mode in modes:
   for log in [native_out,native_err]:log.unlink(missing_ok=True)
   for path in root.glob('lifecycle-*.json'):path.unlink()
   processes=[];report=None
   try:
    p=subprocess.Popen([*base,'--smoke-ux-host-'+mode],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True);processes.append(p)
    def ready():
     for path in root.glob('lifecycle-*.json'):
      try:
       value=json.loads(path.read_text())
       if (mode!='reopen' or value.get('minimized')) and (mode!='busy-external' or value.get('busy')) and (mode!='modal-quit' or value.get('modal')):return value
      except (ValueError,OSError):pass
    report=wait_for(p,ready,timeout=30)
    assert report['path'].startswith(str(root)+'/'),report
    if mode=='reopen':
     if host=='source':processes.append(subprocess.Popen([*base,'--smoke-ux-host-reopen'],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True))
     else:subprocess.run(['/usr/bin/open','-g',str(app)],check=True,capture_output=True)
     reopened=wait_for(p,lambda:(root/('reopened-'+str(report['pid'])+'.json')).is_file())
     value=json.loads((root/('reopened-'+str(report['pid'])+'.json')).read_text());assert value['selection']==report['selection']=='aliases' and value['window']==report['window'] and native('count',report)=='1',value
     assert native('quit',report)=='0'
    elif mode in ['external-quit','modal-quit']:assert native('quit',report)=='0'
    elif mode=='busy-external':
     assert native('quit',report) in ['0','-128'];wait_for(p,lambda:(root/('guarded-'+str(report['pid'])+'.json')).is_file());assert p.poll() is None and not (root/('closed-'+str(report['pid'])+'.json')).exists();assert native('quit',report)=='0'
    for process in processes:
     out,err=process.communicate(timeout=10);assert process.returncode==0 and 'FAIL:' not in out+err,out+err
    if host=='standalone':
     out=native_out.read_text() if native_out.exists() else '';err=native_err.read_text() if native_err.exists() else '';assert 'FAIL:' not in out+err,out+err
    closed=root/('closed-'+str(report['pid'])+'.json');assert closed.is_file() and not pathlib.Path(report['transport']).exists(),report
    assert native('count',report)=='0','A native app stayed running after Close/Quit.'
    print('PASS: '+host+' delayed '+mode+', normal process exit and transport cleanup',flush=True)
   except BaseException as error:
    print('Captured lifecycle output:',getattr(error,'stdout',None),getattr(error,'stderr',None),flush=True)
    print('Lifecycle failure context:',host,mode,report,flush=True)
    if report:subprocess.run(['/usr/bin/sample',str(report['pid']),'1','10','-file','/tmp/mac-tweak-quit-hang-'+host+'.txt'],capture_output=True)
    for log in (root/'temporary').glob('mac-tweak-gui-*/stderr'):
     print(log.read_text()[-3000:],flush=True)
    if native_err.exists():print(native_err.read_text()[-3000:],flush=True)
    print('Cleanup markers:',[str(path) for path in root.glob('closed-*.json')],flush=True)
    raise
   finally:
    # Failure cleanup is confined to apps in this unique disposable fixture.
    script="ObjC.import('AppKit');function run(argv){var apps=$.NSRunningApplication.runningApplicationsWithBundleIdentifier('io.github.brucerry.MacTweak'),rows=[];for(var i=0;i<Number(apps.count);i++){var a=apps.objectAtIndex(i);try{var path=ObjC.unwrap(a.executableURL.path);if(path.indexOf(argv[0]+'/')===0)rows.push({pid:Number(a.processIdentifier),path:path});}catch(_){}}return JSON.stringify(rows);}"
    value=subprocess.run(['/usr/bin/osascript','-l','JavaScript','-e',script,str(root)],capture_output=True,text=True,timeout=5)
    for own in json.loads(value.stdout or '[]'):
     actual=subprocess.run(['/bin/ps','-p',str(own['pid']),'-o','comm='],capture_output=True,text=True).stdout.strip()
     if actual==own['path']:
      try:os.kill(own['pid'],signal.SIGTERM)
      except ProcessLookupError:pass
    for process in processes:
     if process.poll() is None:process.terminate()
     try:process.communicate(timeout=2)
     except subprocess.TimeoutExpired:process.kill();process.communicate()
