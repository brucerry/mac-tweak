"""Use real macOS file APIs only on newly created, uniquely identified files."""
import json,os,pathlib,subprocess,tempfile,uuid
repo=pathlib.Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='mac-tweak-native-files-') as directory:
 root=pathlib.Path(directory).resolve();file=root/('owned-'+str(uuid.uuid4())+'.txt');marker=str(uuid.uuid4());file.write_text(marker);inode=file.stat().st_ino
 script=root/'check.js';script.write_text('''ObjC.import('Cocoa');function run(argv){
function source(path){return ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(path,$.NSUTF8StringEncoding,Ref()));}
var Presentation=(0,eval)(source(argv[0]+'/src/gui/presentation.js'));Presentation.testDesktop();var files=(0,eval)(source(argv[0]+'/src/maintenance/native-files.js'));
var missing=false;try{files.trash(argv[1]+'/missing');}catch(error){missing=true;if(error.uncertain)throw new Error('A nonexistent source must be a definite failure.');}if(!missing)throw new Error('Native Trash must report failure.');
return JSON.stringify({trash:files.trash(argv[1]),failed:missing});}''')
 result=subprocess.run(['/usr/bin/osascript','-l','JavaScript',str(script),str(repo),str(file)],text=True,capture_output=True,timeout=25)
 assert result.returncode==0,result.stdout+result.stderr
 value=json.loads(result.stdout);destination=pathlib.Path(value['trash']);assert value['failed'] and not file.exists() and destination.stat().st_ino==inode and destination.read_text()==marker
 destination.rename(file)
 print('PASS: real native Trash success, recoverable exact destination, native failure and restored disposable file; no out-parameter bridge')
