/* Injected clocks and native adapters: never opens Settings or a screen saver. */
ObjC.import('Foundation');
function run(argv){
    var text=ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(argv[0]+'/src/gui/settings-navigation.js',$.NSUTF8StringEncoding,Ref()));
    var navigation=(0,eval)(text),url='x-apple.systempreferences:com.apple.Wallpaper-Settings.extension?ScreenSaver',parent=url.split('?')[0],count=0;
    function check(value,message){if(!value)throw new Error(message);count++;}
    function fixture(){var f={clock:0,state:{pid:0,ready:false,safe:true},calls:[],fail:''};f.router=navigation.create({now:function(){return f.clock;},inspect:function(){return f.state;},open:function(value){f.calls.push(value);return value!==f.fail;}});return f;}
    function rejected(callback){try{callback();}catch(_){count++;return;}throw new Error('Expected navigation failure.');}
    var f=fixture();check(f.router.open(url)&&f.calls.join()===parent,'Cold launch opens only the parent.');
    f.router.open(url);check(f.calls.length===1,'Repeated requests must coalesce.');
    f.clock=2000;check(!f.router.poll()&&f.calls.length===1,'No chooser before Settings is ready.');
    f.state={pid:11,ready:true,safe:true};f.router.poll();f.clock=3199;check(!f.router.poll(),'Wait for a settled window.');f.clock=3200;check(f.router.poll()&&f.calls[1]===url&&!f.router.pending(),'Open chooser after hydration.');
    check(!f.router.open(url)&&f.calls[2]===url,'Same hydrated Settings process opens directly.');
    f.state={pid:12,ready:true,safe:true};check(f.router.open(url)&&f.calls[3]===parent,'A restarted process must hydrate again.');f.router.poll();f.clock+=1200;f.router.poll();check(f.calls[4]===url,'Restarted process eventually opens the anchor.');
    f.state.ready=false;check(f.router.open(url)&&f.calls[5]===parent,'A missing window must load the parent again.');f.router.cancel();f.clock+=5000;f.state.ready=true;f.router.poll();check(f.calls.length===6&&!f.router.pending(),'Cancellation prevents late navigation.');
    f=fixture();f.router.open(url);f.clock=10000;rejected(function(){f.router.poll();});check(f.calls.length===1&&!f.router.pending(),'Timeout preserves the saved selection and stops.');
    f=fixture();f.router.open(url);f.state={pid:13,ready:true,safe:true};f.router.poll();f.clock=1000;f.state.ready=false;f.router.poll();f.clock=1200;f.state.ready=true;f.router.poll();f.clock=2399;check(!f.router.poll(),'Readiness must remain stable after a disappearing window.');f.clock=2400;check(f.router.poll(),'Readiness settles after the window returns.');
    f=fixture();f.state.safe=false;rejected(function(){f.router.open(url);});check(!f.calls.length,'A protected desktop must not be activated over.');
    f=fixture();f.router.open(url);f.state.safe=false;rejected(function(){f.router.poll();});check(f.calls.length===1&&!f.router.pending(),'A protected transition cancels the anchor.');
    f=fixture();f.fail=parent;rejected(function(){f.router.open(url);});check(!f.router.pending(),'A failed parent launch has no pending work.');
    f=fixture();f.router.open(url);f.fail=url;f.state={pid:14,ready:true,safe:true};f.router.poll();f.clock=1200;rejected(function(){f.router.poll();});check(!f.router.pending(),'A failed anchor stops cleanly.');
    f=fixture();var legacy='x-apple.systempreferences:com.apple.ScreenSaver-Settings.extension';check(!f.router.open(legacy)&&f.calls[0]===legacy,'Legacy navigation stays direct.');
    check(!f.router.open('x-apple.systempreferences:com.apple.Displays-Settings.extension')&&f.calls.length===2,'Other native pages stay direct.');
    return 'PASS: '+count+' cold/warm/restart, stable readiness, cancellation, timeout, protected-session and native-launch error checks; no settings writes';
}
