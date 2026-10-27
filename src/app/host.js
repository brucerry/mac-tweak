/* Built-in osacompile supplies the source checkout's native app host; no CLT required. */
ObjC.import('Cocoa');
function run(argv){
    var root=argv[0],fm=$.NSFileManager.defaultManager;
    function text(path){return ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(path,$.NSUTF8StringEncoding,Ref()))||'';}
    var io=(0,eval)(text(root+'/src/maintenance/io.js')),context=io.make(),metadata=JSON.parse(text(root+'/src/app/metadata.json'));
    var channel=io.env('MAC_TWEAK_LAUNCH_CHANNEL'),seenRequest='';
    if(channel){
        var temporaryRoot=io.canonical(ObjC.unwrap($.NSTemporaryDirectory())).replace(/\/$/,''),attrs=io.attributes(channel);
        if(channel.indexOf(temporaryRoot+'/mac-tweak-launch.')!==0||!/^mac-tweak-launch\.[A-Za-z0-9]{8}$/.test(channel.split('/').pop())||!io.safeAncestors(channel,temporaryRoot,false)||!attrs||attrs.type!=='NSFileTypeDirectory'||attrs.uid!==context.uid||attrs.mode!==448)throw new Error('Invalid private launcher channel.');
    }
    function interrupted(){
        if(!channel)return '';
        var path=channel+'/interrupt',attrs=io.attributes(path);if(!attrs)return '';
        if(attrs.type!=='NSFileTypeRegular'||attrs.uid!==context.uid||attrs.mode!==384||attrs.size>32||!io.safeAncestors(path,channel,false))throw new Error('Unsafe launcher interrupt request.');
        var value=io.read(path,32).trim();if(!/^[1-9][0-9]{0,8}$/.test(value))throw new Error('Invalid launcher interrupt request.');return value;
    }
    var presentation=(0,eval)(text(root+'/src/gui/presentation.js')),safeDesktop=presentation.safe();
    if(io.env('MAC_TWEAK_GUI_TEST')==='1')presentation.testDesktop();
    var cache=context.home+'/Library/Caches/'+metadata.bundleIdentifier+'/hosts',key=io.hex(io.shaText(root+'\n'+text(root+'/src/app/bootstrap.js')+'\n'+JSON.stringify(metadata))),base=cache+'/'+key,app=base+'/Mac Tweak.app';
    if(!io.safeAncestors(base,context.home,false))throw new Error('Unsafe app cache location.');io.mkdir(base);
    if(!io.attributes(app)){
        var stage=base+'/build-'+ObjC.unwrap($.NSUUID.UUID.UUIDString),built=stage+'/Mac Tweak.app';io.mkdir(stage);
        try{
            io.capture('/usr/bin/osacompile',['-s','-l','JavaScript','-o',built,root+'/src/app/bootstrap.js']);
            var path=built+'/Contents/Info.plist',info=ObjC.deepUnwrap($.NSDictionary.dictionaryWithContentsOfFile(path));
            var values={CFBundleIdentifier:metadata.bundleIdentifier,CFBundleName:metadata.name,CFBundleDisplayName:metadata.name,CFBundleShortVersionString:metadata.version,CFBundleVersion:metadata.version,CFBundleIconFile:'MacTweak',LSMinimumSystemVersion:metadata.minimumMacOS,LSUIElement:false,NSHighResolutionCapable:true};
            Object.keys(values).forEach(function(key){info[key]=values[key];});
            var bytes=$.NSPropertyListSerialization.dataWithPropertyListFormatOptionsError($(info),$.NSPropertyListXMLFormat_v1_0,0,Ref());if(!bytes.writeToFileAtomically(path,true))throw new Error('Cannot save native app identity.');
            io.write(built+'/Contents/Resources/project-root.json',{version:1,root:root});
            if(!fm.copyItemAtPathToPathError(root+'/src/gui/assets/MacTweak.icns',built+'/Contents/Resources/MacTweak.icns',Ref()))throw new Error('Cannot prepare the app icon.');
            io.capture('/usr/bin/codesign',['--force','--sign','-',built]);
            if(!fm.moveItemAtPathToPathError(built,app,Ref())&&!io.attributes(app))throw new Error('Cannot save the native app host.');
            io.write(base+'/host.json',{version:1,root:root,app:app});
        }finally{fm.removeItemAtPathError(stage,Ref());}
    }
    if(!io.safeAncestors(app,context.home,false)||ObjC.unwrap($.NSDictionary.dictionaryWithContentsOfFile(app+'/Contents/Info.plist').objectForKey('CFBundleIdentifier'))!==metadata.bundleIdentifier)throw new Error('Invalid cached app identity.');
    if(interrupted())return '';
    var temporary=context.temporary+'/mac-tweak-gui-'+ObjC.unwrap($.NSUUID.UUID.UUIDString);io.mkdir(temporary);
    io.write(temporary+'/session.json',{version:1,pid:Number($.NSProcessInfo.processInfo.processIdentifier),uid:context.uid,start:io.capture('/bin/ps',['-p',String($.NSProcessInfo.processInfo.processIdentifier),'-o','lstart=']).trim()});
    var args=['-W','--stdout',temporary+'/stdout','--stderr',temporary+'/stderr'];
    if(!safeDesktop||io.env('MAC_TWEAK_GUI_TEST')==='1'&&!(context.fixture&&io.env('MAC_TWEAK_GUI_TEST_FOREGROUND')==='1'))args.unshift('-g');
    var environment=ObjC.deepUnwrap($.NSProcessInfo.processInfo.environment);Object.keys(environment).filter(function(key){return key!=='MAC_TWEAK_LAUNCH_CHANNEL'&&(['HOME','PATH','ZDOTDIR'].indexOf(key)>=0||key.indexOf('MAC_TWEAK_')===0);}).forEach(function(key){args.push('--env',key+'='+environment[key]);});
    function openAndWait(){
        var arguments=args.concat([app,'--args']).concat(argv.slice(1));
        if(!channel){io.capture('/usr/bin/open',arguments);return;}
        if(interrupted())return;
        var path=temporary+'/open-output',task=$.NSTask.alloc.init,handle;
        if(!fm.createFileAtPathContentsAttributes(path,$.NSData.data,{NSFilePosixPermissions:384}))throw new Error('Cannot prepare launcher output.');
        handle=$.NSFileHandle.fileHandleForWritingAtPath(path);task.launchPath='/usr/bin/open';task.arguments=arguments;task.standardOutput=handle;task.standardError=handle;
        try{
            task.launch;
            while(task.running){
                var request=interrupted();
                if(request&&request!==seenRequest){
                    var apps=$.NSRunningApplication.runningApplicationsWithBundleIdentifier(metadata.bundleIdentifier),matches=[];
                    for(var i=0;i<Number(apps.count);i++){var candidate=apps.objectAtIndex(i);try{if(!candidate.terminated&&ObjC.unwrap(candidate.bundleURL.path)===app&&ObjC.unwrap(candidate.executableURL.path)===app+'/Contents/MacOS/applet')matches.push(candidate);}catch(_){} }
                    if(matches.length===1&&matches[0].finishedLaunching){
                        // terminate sends normal Quit; the app's active-work
                        // guard can refuse it. Never signal or force the app.
                        seenRequest=request;matches[0].terminate;
                    }
                }
                $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.05));
            }
            task.waitUntilExit;
            if(Number(task.terminationStatus)!==0)throw new Error(text(path)||'The native app could not open.');
        }finally{handle.closeFile;}
    }
    try{openAndWait();var out=text(temporary+'/stdout'),err=text(temporary+'/stderr');if(err)$.NSFileHandle.fileHandleWithStandardError.writeData($(err).dataUsingEncoding($.NSUTF8StringEncoding));return out.trim();}
    finally{fm.removeItemAtPathError(temporary,Ref());}
}
