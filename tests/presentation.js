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
    return 'PASS: native presentation policy protects locked, saver and shield states without activating or stopping services';
}
