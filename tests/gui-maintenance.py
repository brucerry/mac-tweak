"""Own-view native AppKit tests with private home, inventory, running-app and Trash adapters."""
import argparse,json,os,pathlib,plistlib,subprocess,tempfile,shutil
repo=pathlib.Path(__file__).resolve().parent.parent
visual=pathlib.Path('/tmp/mac-tweak-maintenance-visuals');visual.mkdir(exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--mode',action='append');parser.add_argument('--appearance',choices=['light','dark'],action='append');options=parser.parse_args()
for appearance in options.appearance or ['light','dark']:
 for mode in options.mode or ['ux-details','ux-cleanup-cancel','ux-cleanup-accept','ux-cleanup-stale','ux-cleanup-failure','ux-cleanup-interrupt','ux-remove-cancel','ux-remove-accept']:
  with tempfile.TemporaryDirectory(prefix='mac-tweak-maintenance-gui-') as directory:
   root=pathlib.Path(directory).resolve();home=root/'home';home.mkdir();temporary=root/'temporary';temporary.mkdir();apps=root/'Applications';apps.mkdir();images=root/'visual';images.mkdir()
   store=root/'store.json';store.write_text('{"version":1,"values":{}}')
   snippet=home/'.config/mac-tweak/aliases.zsh';snippet.parent.mkdir(parents=True);snippet.write_text("alias ll='ls -al'\n")
   stage=home/'.local/state/mac-tweak/runs/20261026T010000Z-999999/stage';stage.mkdir(parents=True);(stage/'download').write_text('temporary bytes')
   old=stage.parent/'backups/0';old.parent.mkdir();old.write_text('old config');(stage.parent/'events.txt').write_text('backup|'+str(snippet)+'|'+str(old)+'\nchanged|'+str(snippet)+'|hash\ncompleted|run|\n')
   app=apps/'Example.app';(app/'Contents').mkdir(parents=True);(app/'Contents/Info.plist').write_bytes(plistlib.dumps(dict(CFBundleIdentifier='org.example.test')))
   env=dict(os.environ,HOME=str(home),MAC_TWEAK_GUI_TEST='1',MAC_TWEAK_GUI_APPEARANCE=appearance,MAC_TWEAK_PREFERENCES_TEST='1',MAC_TWEAK_PREFERENCE_STORE=str(store),MAC_TWEAK_MAINTENANCE_TEST='1',MAC_TWEAK_MAINTENANCE_FIXTURE=str(root),MAC_TWEAK_VISUAL_DIR=str(images))
   native_inode=stage.stat().st_ino
   if mode=='ux-cleanup-native':env['MAC_TWEAK_NATIVE_TRASH_TEST']='1'
   if mode=='ux-cleanup-failure':
    import hashlib
    (root/'fail-trash.json').write_text(json.dumps([hashlib.sha256(str(stage).encode()).hexdigest()]))
   if mode=='ux-cleanup-interrupt':
    import hashlib
    (root/'pause-after-move.json').write_text(json.dumps([hashlib.sha256(str(stage).encode()).hexdigest()]))
   p=subprocess.run(['/bin/bash',str(repo/'tweak.sh'),'gui','--smoke-'+mode],env=env,text=True,capture_output=True,timeout=40)
   text=p.stdout+p.stderr;assert p.returncode==0 and 'PASS: native' in text and 'FAIL:' not in text,text
   if mode in ['ux-details','ux-cleanup-cancel','ux-remove-cancel','ux-cleanup-stale','ux-cleanup-failure']:assert stage.exists()
   if mode=='ux-cleanup-accept':assert not stage.exists() and (home/'.Trash').is_dir()
   if mode=='ux-cleanup-native':
    receipt=json.loads(next((home/'.local/state/mac-tweak/maintenance').glob('*/receipt.json')).read_text());destination=pathlib.Path(receipt['items'][0]['trash']);assert receipt['status']=='completed' and not stage.exists() and destination.stat().st_ino==native_inode;destination.rename(stage);assert (stage/'download').read_text()=='temporary bytes'
   if mode=='ux-remove-accept':assert not old.exists() and app.exists() and snippet.exists() and (home/'.Trash').is_dir()
   else:assert app.exists()
   for image in images.glob('*.png'):shutil.copyfile(image,visual/(appearance+'-'+mode+'-'+image.name))
   print(appearance+': '+text.strip(),flush=True)
