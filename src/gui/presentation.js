/* Metadata-only desktop guard. Never activates or signals a visual service. */
(function(){
    ObjC.import('Cocoa');ObjC.import('CoreGraphics');
    function flag(value){return value===true||value===1;}
    function allows(state){
        var session=state&&state.session;
        if(!session||!flag(session.kCGSSessionOnConsoleKey)||!flag(session.kCGSessionLoginDoneKey)||flag(session.CGSSessionScreenIsLocked))return false;
        if(session.CGSSessionScreenIsLocked!==undefined&&[true,false,0,1].indexOf(session.CGSSessionScreenIsLocked)<0)return false;
        var front=(state.front||'').toLowerCase();
        if(/^(com\.apple\.(screensaver|wallpaper)|com\.apple\.loginwindow)/.test(front))return false;
        if((state.running||[]).some(function(id){return /^com\.apple\.screensaver/i.test(id);}))return false;
        if(!Array.isArray(state.windows)||!Array.isArray(state.displays)||!state.displays.length||!Number.isFinite(state.screenLevel))return false;
        return !state.windows.some(function(window){
            if(Number(window.kCGWindowLayer)<state.screenLevel||Number(window.kCGWindowAlpha)<=0.01)return false;
            var bounds=window.kCGWindowBounds;if(!bounds)return true;
            return state.displays.some(function(display){
                var width=Math.max(0,Math.min(bounds.X+bounds.Width,display.x+display.width)-Math.max(bounds.X,display.x));
                var height=Math.max(0,Math.min(bounds.Y+bounds.Height,display.y+display.height)-Math.max(bounds.Y,display.y));
                return width>=display.width*0.95&&height>=display.height*0.95;
            });
        });
    }
    function read(){
        var workspace=$.NSWorkspace.sharedWorkspace,running=workspace.runningApplications,ids=[],screens=$.NSScreen.screens,displays=[];
        for(var i=0;i<Number(running.count);i++)ids.push(ObjC.unwrap(running.objectAtIndex(i).bundleIdentifier)||'');
        for(var n=0;n<Number(screens.count);n++){
            var number=Number(ObjC.unwrap(screens.objectAtIndex(n).deviceDescription.objectForKey('NSScreenNumber'))),bounds=$.CGDisplayBounds(number);
            displays.push({x:Number(bounds.origin.x),y:Number(bounds.origin.y),width:Number(bounds.size.width),height:Number(bounds.size.height)});
        }
        return {session:ObjC.deepUnwrap(ObjC.castRefToObject($.CGSessionCopyCurrentDictionary())),front:ObjC.unwrap(workspace.frontmostApplication.bundleIdentifier)||'',running:ids,displays:displays,
            windows:ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1|16,0))),screenLevel:Number($.CGWindowLevelForKey($.kCGScreenSaverWindowLevelKey))};
    }
    function inspect(){try{var state=read();return {safe:allows(state),state:state};}catch(error){return {safe:false,error:String(error)};}}
    function describe(observation){
        if(observation.error)return 'Metadata unavailable: '+observation.error;
        var state=observation.state||{},session=state.session||{};
        return JSON.stringify({onConsole:session.kCGSSessionOnConsoleKey,loggedIn:session.kCGSessionLoginDoneKey,
            locked:session.CGSSessionScreenIsLocked,front:state.front,displays:(state.displays||[]).length,
            savers:(state.running||[]).filter(function(id){return /^com\.apple\.screensaver/i.test(id);}),
            screenLevel:state.screenLevel,highWindows:(state.windows||[]).filter(function(window){
                return Number(window.kCGWindowLayer)>=state.screenLevel&&Number(window.kCGWindowAlpha)>0.01;
            }).slice(0,10).map(function(window){return {layer:window.kCGWindowLayer,bounds:window.kCGWindowBounds};})});
    }
    function desktopError(observation){return new Error('Native UI checks require an unlocked desktop without an active screen saver. No visual service was activated or stopped. Context: '+describe(observation));}
    function safe(){return inspect().safe;}
    // Test launchers wait outside an app event loop for workspace handoff to
    // settle. The caller must still perform the ordinary native safety check.
    function waitForDesktop(milliseconds,adapter){
        if(!Number.isFinite(milliseconds)||milliseconds<250||milliseconds>5000)throw new Error('Invalid desktop readiness timeout.');
        adapter=adapter||{now:function(){return Number($.NSProcessInfo.processInfo.systemUptime)*1000;},inspect:inspect,
            pause:function(duration){$.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(duration/1000));}};
        var deadline=adapter.now()+milliseconds,stableSince=null,last;
        while(true){
            var now=adapter.now();last=adapter.inspect();
            if(last.safe){if(stableSince===null)stableSince=now;if(now-stableSince>=250)return;}
            else stableSince=null;
            if(now>=deadline)throw desktopError(last);
            adapter.pause(Math.min(50,deadline-now));
        }
    }
    var checkedAt=-Infinity;
    function testDesktop(){if(Date.now()-checkedAt<250)return;var observation=inspect();if(!observation.safe)throw desktopError(observation);checkedAt=Date.now();}
    return {allows:allows,safe:safe,read:read,testDesktop:testDesktop,waitForDesktop:waitForDesktop};
}())
