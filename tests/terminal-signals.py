"""Real PTY signals against inert JXA workers; no app or desktop is opened."""
import json,os,pathlib,shutil,signal,subprocess,tempfile
from terminal_support import start_terminal,wait,drain
repo=pathlib.Path(__file__).resolve().parent.parent
worker=r'''ObjC.import('Foundation');ObjC.bindFunction('getpgrp',['int',[]]);
function run(a){var root=a[0],fm=$.NSFileManager.defaultManager,env=$.NSProcessInfo.processInfo.environment,channel=ObjC.unwrap(env.objectForKey('MAC_TWEAK_LAUNCH_CHANNEL'));
function save(name,value){$(JSON.stringify(value)).writeToFileAtomicallyEncodingError(root+'/'+name,true,$.NSUTF8StringEncoding,Ref());}
save('ready.json',{pid:Number($.NSProcessInfo.processInfo.processIdentifier),group:Number($.getpgrp()),channel:channel});
var previous='';while(!fm.fileExistsAtPath(root+'/close')){var text=$.NSString.stringWithContentsOfFileEncodingError(channel+'/interrupt',$.NSUTF8StringEncoding,Ref()),raw=ObjC.unwrap(text),value=typeof raw==='string'?raw.trim():'';
if(value&&value!==previous){previous=value;save('received.json',{request:value});if(!fm.fileExistsAtPath(root+'/busy')||fm.fileExistsAtPath(root+'/allow'))return 'SIMULATED_CLOSE';}
$.NSThread.sleepForTimeInterval(0.01);}return 'SIMULATED_CLOSE';}'''
with tempfile.TemporaryDirectory(prefix='mac-tweak-terminal-signals-') as temporary:
 root=pathlib.Path(temporary).resolve();project=root/'checkout with spaces';(project/'src/app').mkdir(parents=True)
 for name in ['tweak.sh','Tweak.command']:shutil.copy2(repo/name,project/name)
 shutil.copy2(repo/'src/app/launch.sh',project/'src/app/launch.sh');(project/'src/app/host.js').write_text(worker)
 for launcher in ['tweak.sh','Tweak.command']:
  for mode in ['interrupt','busy-retry','close','term','hup']:
   for name in ['ready.json','received.json','close','busy','allow']:(project/name).unlink(missing_ok=True)
   if mode=='busy-retry':(project/'busy').touch()
   p,master=start_terminal([str(project/launcher),'gui'])
   try:
    ready=wait(p,master,lambda:json.loads((project/'ready.json').read_text()) if (project/'ready.json').exists() else None)
    assert ready['group']!=p.pid,(p.pid,ready)
    if mode=='close':(project/'close').touch()
    elif mode in ['term','hup']:os.kill(p.pid,signal.SIGTERM if mode=='term' else signal.SIGHUP)
    else:
     os.write(master,b'\x03')
     if mode=='busy-retry':
      wait(p,master,lambda:(project/'received.json').exists());assert p.poll() is None and pathlib.Path(ready['channel']).is_dir()
      (project/'allow').touch();os.write(master,b'\x03')
    status=p.wait(timeout=8);output=drain(master).decode(errors='replace');expected={'close':0,'term':143,'hup':129}.get(mode,130)
    assert status==expected and not pathlib.Path(ready['channel']).exists(),(status,output)
    print('PASS: '+launcher+' real PTY '+mode+', isolated worker group and channel cleanup',flush=True)
   except BaseException:
    print('Terminal fixture failure:',launcher,mode,'launcher',p.pid,'status',p.poll(),'worker',locals().get('ready'),'output',(p.output+drain(master)).decode(errors='replace'),flush=True)
    if 'ready' in locals():print(subprocess.run(['/bin/ps','-p',str(p.pid)+','+str(ready['pid']),'-o','pid=,ppid=,pgid=,stat=,wchan=,comm='],capture_output=True,text=True).stdout,flush=True)
    raise
   finally:
    if p.poll() is None:
     (project/'close').touch()
     try:p.wait(timeout=2)
     except subprocess.TimeoutExpired:p.kill();p.wait(timeout=2)
    os.close(master)
