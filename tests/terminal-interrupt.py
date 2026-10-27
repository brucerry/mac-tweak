"""Real public launchers and terminal Ctrl+C against disposable native app hosts."""
import argparse,json,os,pathlib,shutil,signal,subprocess,tempfile,time,uuid
from terminal_support import start_terminal,wait,drain
repo=pathlib.Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--launcher',action='append',choices=['tweak.sh','Tweak.command']);parser.add_argument('--mode',action='append',choices=['idle','modal','busy','close','reused','startup']);options=parser.parse_args()
with tempfile.TemporaryDirectory(prefix='mac-tweak-terminal-native-') as directory:
 root=pathlib.Path(directory).resolve();project=root/'checkout with spaces';project.mkdir();shutil.copytree(repo/'src',project/'src')
 for name in ['tweak.sh','Tweak.command']:shutil.copy2(repo/name,project/name)
 identity='org.mactweak.terminaltest.'+str(uuid.uuid4());metadata=project/'src/app/metadata.json';value=json.loads(metadata.read_text());value['bundleIdentifier']=identity;metadata.write_text(json.dumps(value))
 home=root/'home';home.mkdir();(root/'temporary').mkdir();(root/'Applications').mkdir();store=root/'store.json';store.write_text('{"version":1,"values":{}}')
 env=dict(os.environ,HOME=str(home),MAC_TWEAK_GUI_TEST='1',MAC_TWEAK_PREFERENCES_TEST='1',MAC_TWEAK_PREFERENCE_STORE=str(store),MAC_TWEAK_MAINTENANCE_TEST='1',MAC_TWEAK_MAINTENANCE_FIXTURE=str(root))
 query="""ObjC.import('AppKit');function run(a){var apps=$.NSRunningApplication.runningApplicationsWithBundleIdentifier(a[0]),rows=[];for(var i=0;i<Number(apps.count);i++){var app=apps.objectAtIndex(i);try{var path=ObjC.unwrap(app.executableURL.path);if(!app.terminated&&path.indexOf(a[1]+'/')===0)rows.push({pid:Number(app.processIdentifier),path:path});}catch(_){}}return JSON.stringify(rows);} """
 def apps():
  p=subprocess.run(['/usr/bin/osascript','-l','JavaScript','-e',query,identity,str(root)],capture_output=True,text=True,timeout=5);assert p.returncode==0,p.stderr;return json.loads(p.stdout)
 def normal_quit(report):
  script="""ObjC.import('AppKit');function run(a){var app=$.NSRunningApplication.runningApplicationWithProcessIdentifier(Number(a[0]));if(ObjC.unwrap(app.executableURL.path)!==a[1])throw new Error('Wrong target.');return String(app.terminate);} """
  p=subprocess.run(['/usr/bin/osascript','-l','JavaScript','-e',script,str(report['pid']),report['path']],capture_output=True,text=True,timeout=5);assert p.returncode==0,p.stderr
 def channel(pid):
  for candidate in pathlib.Path(tempfile.gettempdir()).glob('mac-tweak-launch.*'):
   try:
    if (candidate/'launcher.pid').read_text().strip()==str(pid):return candidate.resolve()
   except OSError:pass
 def report_for(mode):
  for path in root.glob('lifecycle-*.json'):
   try:
    value=json.loads(path.read_text())
    if mode=='busy' and not value.get('busy') or mode=='modal' and not value.get('modal') or mode=='reused' and not value.get('minimized'):continue
    return value
   except (ValueError,OSError):pass
 for launcher in options.launcher or ['tweak.sh','Tweak.command']:
  for mode in options.mode or ['startup','idle','modal','busy','close','reused']:
   for path in root.glob('lifecycle-*.json'):path.unlink()
   smoke={'modal':'modal-quit','busy':'busy-external','close':'close','reused':'reopen'}.get(mode,'external-quit')
   command=[str(project/launcher),'gui','--native-host','--smoke-ux-host-'+smoke];processes=[];report=None;channels=[]
   try:
    case_env=env
    if mode=='startup':
     startup_home=root/('startup-home-'+launcher);startup_home.mkdir(exist_ok=True);case_env=dict(env,HOME=str(startup_home))
    p,master=start_terminal(command,case_env);processes.append((p,master))
    control=wait(p,master,lambda:channel(p.pid));channels.append(control)
    if mode=='startup':
     os.write(master,b'\x03');assert p.wait(timeout=20)==130,(p.returncode,p.output)
     assert not apps() and not list(root.glob('lifecycle-*.json')) and not control.exists() and b'Native UI checks require' not in p.output
     print('PASS: '+launcher+' Ctrl+C during preparation skips native launch and cleans its channel',flush=True);continue
    report=wait(p,master,lambda:report_for(mode));assert report['path'].startswith(str(root)+'/'),report
    if mode=='reused':
     other,other_master=start_terminal(command,env);processes.append((other,other_master));other_control=wait(other,other_master,lambda:channel(other.pid));channels.append(other_control)
     wait(other,other_master,lambda:(root/('reopened-'+str(report['pid'])+'.json')).exists())
     assert len(apps())==1,'Reopening created another native app.'
     os.write(other_master,b'\x03');assert other.wait(timeout=12)==130,(other.returncode,other.output)
     assert p.wait(timeout=12)==0,(p.returncode,p.output)
    elif mode=='close':assert p.wait(timeout=12)==0,(p.returncode,p.output)
    else:
     os.write(master,b'\x03')
     if mode=='busy':
      wait(p,master,lambda:(root/('guarded-'+str(report['pid'])+'.json')).exists());assert p.poll() is None and not (root/('closed-'+str(report['pid'])+'.json')).exists() and control.exists()
      os.write(master,b'\x03')
     assert p.wait(timeout=12)==130,(p.returncode,p.output)
    assert (root/('closed-'+str(report['pid'])+'.json')).exists() and not pathlib.Path(report['transport']).exists(),report
    assert not apps() and all(not path.exists() for path in channels)
    assert json.loads(store.read_text())=={'version':1,'values':{}} and not (home/'.config').exists()
    print('PASS: '+launcher+' native PTY '+mode+', guarded Quit, app exit and transport cleanup',flush=True)
   except BaseException:
    print('Native terminal failure:',launcher,mode,report,[(p.pid,p.poll(),p.output.decode(errors='replace')) for p,_ in processes],flush=True)
    if report:print(subprocess.run(['/bin/ps','-p',str(report['pid']),'-o','pid=,ppid=,pgid=,stat=,comm='],capture_output=True,text=True).stdout,flush=True)
    for log in (root/'temporary').glob('mac-tweak-gui-*/stderr'):print(log.read_text()[-2400:],flush=True)
    raise
   finally:
    # Only this UUID identity and private executable root can be terminated.
    for own in apps():
     actual=subprocess.run(['/bin/ps','-p',str(own['pid']),'-o','comm='],capture_output=True,text=True).stdout.strip()
     if actual==own['path']:
      try:os.kill(own['pid'],signal.SIGTERM)
      except ProcessLookupError:pass
    for process,fd in processes:
     if process.poll() is None:
      try:process.wait(timeout=3)
      except subprocess.TimeoutExpired:process.kill();process.wait(timeout=3)
     os.close(fd)
    for path in channels:
     if path.exists():shutil.rmtree(path)
