/* Honest progress for read-only discovery, builds and native launch requests. */
(function(){
    var transport='',active=null;
    function init(path){transport=path;}
    function flush(){if(active){active.panel.displayIfNeeded;$.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.025));}}
    function begin(title,parent,total){
        var panel=$.NSPanel.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(0,0,480,132),1,$.NSBackingStoreBuffered,false);panel.title=title;nativeWindowChrome(panel);panel.releasedWhenClosed=false;
        var text=$.NSTextField.labelWithString(title);text.frame=$.NSMakeRect(24,76,432,26);text.font=$.NSFont.systemFontOfSize(14);panel.contentView.addSubview(text);
        var bar=$.NSProgressIndicator.alloc.initWithFrame($.NSMakeRect(24,40,432,14));bar.style=$.NSProgressIndicatorStyleBar;bar.indeterminate=!total;bar.minValue=0;bar.maxValue=total||100;panel.contentView.addSubview(bar);bar.startAnimation(null);
        active={panel:panel,bar:bar,text:text,parent:parent};if(parent)parent.beginSheetCompletionHandler(panel,function(){});else{panel.center;panel.makeKeyAndOrderFront(null);}flush();return active;
    }
    function step(text,value){if(!active)return;active.text.stringValue=text;if(value!==undefined){active.bar.indeterminate=false;active.bar.doubleValue=value;}flush();}
    function end(){if(!active)return;var value=active;active=null;value.bar.stopAnimation(null);if(value.parent)value.parent.endSheet(value.panel);value.panel.orderOut(null);}
    function capture(executable,args,title,parent){
        var owns=!active;if(owns)begin(title||'Loading…',parent,0);
        var output=transport+'/load-'+ObjC.unwrap($.NSUUID.UUID.UUIDString)+'.txt',fm=$.NSFileManager.defaultManager,handle,task;
        try{
            if(!fm.createFileAtPathContentsAttributes(output,$.NSData.data,{NSFilePosixPermissions:384}))throw new Error('Cannot create private loading transport.');
            handle=$.NSFileHandle.fileHandleForWritingAtPath(output);task=$.NSTask.alloc.init;task.launchPath=executable;task.arguments=args;task.standardOutput=handle;task.standardError=handle;task.launch;
            while(task.running){flush();}task.waitUntilExit;handle.closeFile;handle=null;
            var text=ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(output,$.NSUTF8StringEncoding,Ref()))||'';
            if(Number(task.terminationStatus)!==0)throw new Error(text.slice(-1800)||'Loading failed.');return text;
        }finally{if(handle)handle.closeFile;fm.removeItemAtPathError(output,Ref());if(owns)end();}
    }
    return {init:init,begin:begin,step:step,end:end,capture:capture};
}())
