/* Native file adapters. Callers retain selection, eligibility and acceptance. */
(function(){
    ObjC.import('AppKit');
    function url(path,requireExists){
        if(typeof path!=='string'||path[0]!=='/'||/[\x00-\x1f]/.test(path)||path.split('/').some(function(part){return part==='.'||part==='..';}))throw new Error('Invalid file location.');
        var attrs=$.NSFileManager.defaultManager.attributesOfItemAtPathError(path,Ref());
        var value=attrs?ObjC.deepUnwrap(attrs):null;
        if(requireExists!==false&&(!value||!value.NSFileType))throw new Error('This item no longer exists. Refresh the list.');
        return $.NSURL.fileURLWithPath(path);
    }
    function reveal(path){
        if(typeof Presentation!=='undefined'&&Presentation&&!Presentation.safe())throw new Error('Return to the unlocked desktop, then try again.');
        // JS arrays coerce NSURL objects to dictionaries in the JXA bridge.
        $.NSWorkspace.sharedWorkspace.activateFileViewerSelectingURLs($.NSArray.arrayWithObject(url(path)));
        return path;
    }
    function trash(path){
        var source=url(path,false),existed=!!$.NSFileManager.defaultManager.fileExistsAtPath(path),done=false,destination='',failure='';
        // An asynchronous URL map avoids the unsafe NSURL** out-parameter
        // dereference which crashed the original osascript worker after moving.
        $.NSWorkspace.sharedWorkspace.recycleURLsCompletionHandler($.NSArray.arrayWithObject(source),function(mapping,error){
            try{destination=ObjC.unwrap(mapping.objectForKey(source).path)||'';failure=ObjC.unwrap(error.localizedDescription)||'';}catch(value){failure=String(value);}
            done=true;
        });
        var deadline=Date.now()+120000;
        while(!done&&Date.now()<deadline)$.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.02));
        if(!done||!destination||!$.NSFileManager.defaultManager.fileExistsAtPath(destination)){
            var error=new Error(failure||(!done?'macOS has not confirmed this Trash operation. Inspect the receipt before retrying.':'macOS could not move this item to Trash.'));
            error.uncertain=!done||existed&&!$.NSFileManager.defaultManager.fileExistsAtPath(path);throw error;
        }
        return destination;
    }
    return {reveal:reveal,trash:trash};
}())
