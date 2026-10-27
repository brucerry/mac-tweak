"""Exercise the native launch API with a unique, short-lived fixture app; no helper hooks."""
import os,pathlib,plistlib,subprocess,tempfile,uuid
repo=pathlib.Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='mac-tweak-launch-test-') as temporary:
    root=pathlib.Path(temporary);app=root/'Launch Fixture.app';binary=app/'Contents/MacOS';binary.mkdir(parents=True)
    identifier='io.github.brucerry.MacTweak.test.'+str(uuid.uuid4())
    (app/'Contents/Info.plist').write_bytes(plistlib.dumps(dict(CFBundleIdentifier=identifier,CFBundleName='Mac Tweak launch fixture',CFBundleExecutable='Fixture',CFBundlePackageType='APPL',CFBundleVersion='1',LSUIElement=True)))
    source=root/'main.swift';source.write_text('import AppKit\nlet app=NSApplication.shared\napp.setActivationPolicy(.accessory)\nDispatchQueue.main.asyncAfter(deadline:.now()+0.5){app.terminate(nil)}\napp.run()\n')
    subprocess.run(['xcrun','swiftc',str(source),'-o',str(binary/'Fixture')],check=True,capture_output=True)
    subprocess.run(['codesign','--force','--sign','-',str(app)],check=True,capture_output=True)
    script=root/'launch.js';script.write_text('''ObjC.import('Cocoa');
function run(argv){var source=ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(argv[0]+'/src/gui/helpers.js',$.NSUTF8StringEncoding,Ref())),helpers=(0,eval)(source),adapter=helpers.native(argv[1]);
var missing=adapter.inspect('WindowsKeys');if(missing.exists||missing.valid)throw new Error('Missing helper inspection must return a missing state.');var app=adapter.launch(argv[2]);if(!app)throw new Error('Native launch did not return an application.');
var failed=false;try{adapter.launch(argv[2]+'/missing.app');}catch(_){failed=true;}if(!failed)throw new Error('Native failure was not reported.');
for(var i=0;i<100&&!app.terminated;i++)$.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.05));if(!app.terminated)throw new Error('Fixture must exit before cleanup.');
return 'PASS: native launch success and missing-app failure with a unique disposable app; no helper launched';}
''')
    result=subprocess.run(['/usr/bin/osascript','-l','JavaScript',str(script),str(repo),str(root),str(app)],capture_output=True,text=True,timeout=20)
    assert result.returncode==0 and 'PASS:' in result.stdout,str(result.returncode)+' '+result.stdout+result.stderr
    print(result.stdout.strip())
