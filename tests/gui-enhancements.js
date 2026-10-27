ObjC.import('Foundation');
function run(argv){
    var root=argv[0],source=ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(root+'/src/gui/helpers.js',$.NSUTF8StringEncoding,Ref())),helpers=(0,eval)(source);
    function check(value,message){if(!value)throw new Error(message);}
    var states={DockMinimizer:{exists:false},QuitOnRed:{exists:true,valid:true,running:true},WindowsKeys:{exists:true,valid:true,running:false,path:'/fixture/WindowsKeys.app'}};
    var launched=[],steps=[],adapter={inspect:function(name){return states[name];},launch:function(path){launched.push(path);return true;}};
    var rows=helpers.results(['gestures','closing','windowskeys','node'],adapter,function(text,value){steps.push(value);});
    check(rows.map(function(row){return row.status;}).join(',')==='missing,running,started','Missing, running and successful helper states must be visible.');
    check(launched.length===1&&steps[steps.length-1]===3,'Only stopped installed helpers launch; progress finishes at the selected count.');
    adapter.launch=function(){throw new Error('Injected launch failure');};rows=helpers.results(['windowskeys'],adapter,function(){});check(rows[0].status==='failed'&&rows[0].message.indexOf('Injected')>=0,'Launch errors must not claim success.');
    states.WindowsKeys.valid=false;rows=helpers.results(['windowskeys'],adapter,function(){});check(rows[0].status==='failed','Invalid app identity must block launch.');
    check(!helpers.results([],adapter,function(){}).length,'An empty helper choice has no launch side effects.');
    return 'PASS: isolated helper launch outcomes, identity checks and counted progress; no real helper started';
}
