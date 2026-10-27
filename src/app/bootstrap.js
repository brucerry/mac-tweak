/* Run the chooser inside its identified app, sharing macOS's built-in JXA runtime. */
ObjC.import('Cocoa');
function run() {
    if(typeof UI!=='undefined'&&UI&&UI.hosted&&UI.window){restoreMacTweakWindow();return 'MAC_TWEAK_UI_READY';}
    var bootstrap=run;
    var resources=ObjC.unwrap($.NSBundle.mainBundle.resourcePath),root=resources;
    var marker=ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(resources+'/project-root.json',$.NSUTF8StringEncoding,Ref()));
    if(typeof marker==='string'&&marker){var project=JSON.parse(marker);if(project.version!==1||typeof project.root!=='string'||project.root[0]!=='/')throw new Error('Invalid project location.');root=project.root;}
    var args=ObjC.deepUnwrap($.NSProcessInfo.processInfo.arguments).slice(1).filter(function(value){return value.indexOf('-psn_')!==0;});
    var applet=ObjC.unwrap($.NSBundle.mainBundle.objectForInfoDictionaryKey('CFBundleExecutable'))==='applet';
    args.push('--native-host');
    if(applet)args.push('--applet-host');
    var source=ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(root+'/src/gui/main.js',$.NSUTF8StringEncoding,Ref()));
    if(typeof source!=='string'||!source)throw new Error('Mac Tweak source is missing. Reopen it from the project folder.');
    console.log=function(value){$.NSFileHandle.fileHandleWithStandardError.writeData($(String(value)+'\n').dataUsingEncoding($.NSUTF8StringEncoding));};
    (0,eval)(source);
    var entry=run;globalThis.run=bootstrap;
    var result;
    try{result=entry([root].concat(args));}catch(error){
        console.log('FAIL: '+String(error));
        if(ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('MAC_TWEAK_GUI_TEST'))==='1'){$.NSApplication.sharedApplication.terminate(null);return;}
        throw error;
    }
    if(typeof result==='string'&&result!=='MAC_TWEAK_UI_READY')$.NSFileHandle.fileHandleWithStandardOutput.writeData($(result+'\n').dataUsingEncoding($.NSUTF8StringEncoding));
    if(applet&&result!=='MAC_TWEAK_UI_READY')$.NSApplication.sharedApplication.terminate(null);
    return result;
}
function reopen(){if(typeof UI!=='undefined'&&UI&&UI.window)restoreMacTweakWindow();}
function quit(){
    // Stay-open applets receive the standard quit Apple event as a script
    // handler. Forward it to the same guarded shutdown path.
    if(typeof UI!=='undefined'&&UI&&UI.window){UI.handlingQuit=true;try{return requestMacTweakQuit();}finally{UI.handlingQuit=false;}}
    else{ObjC.bindFunction('exit',['void',['int']]);$.exit(0);}
}
