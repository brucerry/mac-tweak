/* Launch feedback is testable without starting hooks or touching production apps. */
(function(){
    var names={gestures:'DockMinimizer',closing:'QuitOnRed',windowskeys:'WindowsKeys'};
    function results(ids,adapter,progress){
        var selected=ids.filter(function(id){return names[id];}),rows=[];
        selected.forEach(function(id,index){var name=names[id],row={id:id,name:name,status:'missing',message:'Select this card, then Review and Apply to install.'};
            progress('Starting '+name+'…',index);
            try{
                var state=adapter.inspect(name);
                if(!state.exists){}else if(!state.valid){row.status='failed';row.message='The installed app identity is invalid. Review setup before starting it.';}
                else if(state.running){row.status='running';row.message='Already running. Check its menu bar icon and macOS permissions.';}
                else{var value=adapter.launch(state.path);if(!value)throw new Error('macOS did not confirm the launch.');row.status='started';row.message=(state.legacy?'Existing installation started. ':'Started. ')+'Accessibility or Input Monitoring may still need approval in System Settings.';}
            }catch(error){row.status='failed';row.message=String(error);}
            rows.push(row);progress(name+': '+row.status,index+1);
        });return rows;
    }
    function native(home){
        return {inspect:function(name){var path=home+'/Applications/'+name+'.app',exists=!!$.NSFileManager.defaultManager.fileExistsAtPath(path),metadata=null;
            if(exists){var info=$.NSDictionary.dictionaryWithContentsOfFile(path+'/Contents/Info.plist');if(info&&typeof info.objectForKey==='function')metadata=ObjC.deepUnwrap(info);}
            var valid=!!metadata&&metadata.CFBundleIdentifier==='local.bruce.'+name;
            var running=exists&&Number($.NSRunningApplication.runningApplicationsWithBundleIdentifier('local.bruce.'+name).count)>0;
            return {path:path,exists:exists,valid:valid,running:running,legacy:!$.NSFileManager.defaultManager.fileExistsAtPath(path+'/Contents/Resources/source.sha256')};},
            launch:function(path){var error=Ref(),app=$.NSWorkspace.sharedWorkspace.launchApplicationAtURLOptionsConfigurationError($.NSURL.fileURLWithPath(path),$.NSWorkspaceLaunchWithoutActivation,$({}),error);if(!app||!Number.isFinite(Number(app.processIdentifier))||Number(app.processIdentifier)<=0){throw new Error('macOS could not start this app. Check its installation, then Review setup again.');}return app;}};
    }
    return {results:results,native:native,names:names};
}())
