ObjC.import('Foundation');
function run(argv){
    var text=ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(argv[0]+'/src/gui/presentation.js',$.NSUTF8StringEncoding,Ref())),policy=(0,eval)(text);
    var state={session:{kCGSSessionOnConsoleKey:true,kCGSessionLoginDoneKey:true},front:'com.apple.finder',running:['com.apple.wallpaper.extension.aerials'],displays:[{x:0,y:0,width:1920,height:1080}],screenLevel:1000,windows:[]};
    function check(value,message){if(!value)throw new Error(message);}
    check(policy.allows(state),'Normal desktop with background wallpaper services must be usable.');
    [true,1,'unknown'].forEach(function(value){state.session.CGSSessionScreenIsLocked=value;check(!policy.allows(state),'Locked/uncertain sessions must remain untouched.');});delete state.session.CGSSessionScreenIsLocked;
    ['com.apple.ScreenSaver.Engine','com.apple.wallpaper.extension.aerials','com.apple.loginwindow'].forEach(function(value){state.front=value;check(!policy.allows(state),'Protected foreground services must never be activated over.');});state.front='com.apple.finder';
    state.running.push('com.apple.ScreenSaver.Engine');check(!policy.allows(state),'An unlocked running saver must block UI tests.');state.running.pop();
    state.windows=[{kCGWindowLayer:1000,kCGWindowAlpha:1,kCGWindowBounds:{X:0,Y:0,Width:1920,Height:1080}}];check(!policy.allows(state),'Full-screen protection must block UI tests.');state.windows[0].kCGWindowBounds.Width=20;check(policy.allows(state),'A cursor-sized shield must not disable normal use.');
    state.windows=null;check(!policy.allows(state),'Unknown native metadata must fail closed.');
    var fixture={session:{kCGSSessionOnConsoleKey:true,kCGSessionLoginDoneKey:true},front:'com.apple.finder',running:[],displays:[{x:0,y:0,width:1920,height:1080}],screenLevel:1000,windows:[]};
    function readiness(sequence,timeout){
        var clock=0,polls=0,last;
        policy.waitForDesktop(timeout===undefined?1000:timeout,{now:function(){return clock;},inspect:function(){last=sequence[Math.min(polls++,sequence.length-1)];return last;},pause:function(duration){clock+=duration;}});
        return {clock:clock,polls:polls,last:last};
    }
    var ready={safe:true,state:fixture},protectedState={safe:false,state:{session:{CGSSessionScreenIsLocked:true},front:'com.apple.loginwindow'}};
    var settled=readiness([protectedState,ready]);check(settled.clock===300&&settled.polls===7,'A test launch must wait for a continuous safe interval after workspace handoff.');
    settled=readiness([ready,ready,protectedState,ready]);check(settled.clock===400,'An unsafe observation must restart the stable interval.');
    [protectedState,{safe:false,error:'injected unavailable metadata'}].forEach(function(observation){
        var error='';try{readiness([observation],500);}catch(value){error=String(value);}
        check(error.indexOf('Native UI checks require')>=0&&error.indexOf(observation.error?'injected unavailable metadata':'com.apple.loginwindow')>=0,'A protected or unknown desktop must time out with metadata context.');
    });
    [0,100,5001,Infinity].forEach(function(timeout){var rejected=false;try{readiness([ready],timeout);}catch(_){rejected=true;}check(rejected,'Readiness waits must stay bounded.');});
    check(!policy.allows(protectedState.state),'Waiting must never change the presentation safety policy.');
    return 'PASS: native presentation policy, stable handoff waits, protected/unknown timeouts and bounded diagnostics; no visual service activated or stopped';
}
