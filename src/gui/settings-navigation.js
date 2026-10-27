/* Native Settings can open its saver sheet before the Wallpaper model loads. */
(function(){
    var saver='x-apple.systempreferences:com.apple.Wallpaper-Settings.extension?ScreenSaver';
    function create(adapter){
        var pending=null,hydratedPID=0;
        function dispatch(url){if(adapter.open(url)===false)throw new Error('System Settings could not open.');}
        function open(url){
            if(pending)return true;
            if(url!==saver){dispatch(url);return false;}
            var state=adapter.inspect();
            if(state.safe===false)throw new Error('Reopen the chooser after unlocking the desktop.');
            if(state.ready&&state.pid>0&&state.pid===hydratedPID){dispatch(url);return false;}
            dispatch(url.split('?')[0]);
            pending={url:url,started:adapter.now(),readySince:null,pid:0};return true;
        }
        function poll(){
            if(!pending)return true;
            try{
                var now=adapter.now(),state=adapter.inspect();
                if(state.safe===false)throw new Error('Reopen the chooser after unlocking the desktop.');
                if(now-pending.started>=10000)throw new Error('System Settings is still loading. Try Choose screen saver again.');
                if(!state.ready||!(state.pid>0)){pending.readySince=null;pending.pid=0;return false;}
                if(pending.pid!==state.pid){pending.pid=state.pid;pending.readySince=now;}
                // No public pane-model readiness API exists. A settled native
                // window lets Wallpaper finish loading its current selections.
                if(now-pending.readySince<1200)return false;
                dispatch(pending.url);hydratedPID=state.pid;pending=null;return true;
            }catch(error){pending=null;throw error;}
        }
        return {open:open,poll:poll,cancel:function(){pending=null;},pending:function(){return !!pending;}};
    }
    return {create:create};
}())
