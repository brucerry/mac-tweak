/* Native tracking areas keep pointer feedback separate from selection and keyboard focus. */
(function () {
    var rows={}, next=1, owner=null, palette=null, scans=0;
    function configure(target,theme){owner=target;palette=theme;Object.keys(rows).forEach(function(id){if(rows[id].hovered)set(id,true,true);});}
    function geometry(row){
        var parent=row.view.superview;if(!parent)return;
        if(!row.plate.superview||!row.plate.superview.isEqual(parent)){row.plate.removeFromSuperview;parent.addSubviewPositionedRelativeTo(row.plate,$.NSWindowBelow,row.view);}
        row.plate.frame=row.view.frame;
        if(row.view.hidden||!row.view.enabled){row.plate.hidden=true;if(row.hovered&&row.callback)row.callback(false);row.hovered=false;}
    }
    function set(id,hovered,force){var row=rows[id];if(!row)return;geometry(row);hovered=hovered&&!!row.view.enabled&&!row.view.hidden;if(row.hovered===hovered&&!force)return;row.hovered=hovered;
        var tint=row.tint?row.tint():palette.accent;row.plate.hidden=!hovered;if(hovered)row.plate.fillColor=tint.colorWithAlphaComponent(palette.dark?0.20:0.12);
        if(row.callback)row.callback(hovered);if(hovered)$.NSCursor.pointingHandCursor.set;else $.NSCursor.arrowCursor.set;}
    function track(view,callback,tint){
        if(!view.superview)return;
        var existing=ObjC.unwrap(view.identifier)||'';
        if(existing.indexOf('mac-tweak-hover-')===0){if(rows[existing]){geometry(rows[existing]);if(callback)rows[existing].callback=callback;if(tint)rows[existing].tint=tint;}return;}
        var id='mac-tweak-hover-'+next++,f=view.frame;
        var plate=$.NSBox.alloc.initWithFrame(f);
        plate.identifier=id+'-surface';
        plate.boxType=$.NSBoxCustom;plate.titlePosition=$.NSNoTitle;plate.contentViewMargins=$.NSMakeSize(0,0);plate.cornerRadius=Math.min(14,Number(f.size.height)/4);plate.borderWidth=0;plate.hidden=true;
        view.superview.addSubviewPositionedRelativeTo(plate,$.NSWindowBelow,view);view.identifier=id;
        var area=$.NSTrackingArea.alloc.initWithRectOptionsOwnerUserInfo(view.bounds,$.NSTrackingMouseEnteredAndExited|$.NSTrackingCursorUpdate|$.NSTrackingActiveAlways|$.NSTrackingInVisibleRect,owner,$({id:id}));
        view.addTrackingArea(area);rows[id]={view:view,plate:plate,area:area,callback:callback,tint:tint,hovered:false};
    }
    function sync(root){
        scans++;
        Object.keys(rows).forEach(function(id){var row=rows[id];if(!row.view.window){try{row.view.removeTrackingArea(row.area);row.view.identifier='';row.plate.removeFromSuperview;}catch(_){}delete rows[id];}});
        function visit(view){if(view.isKindOfClass($.NSButton)||view.isKindOfClass($.NSSwitch)||view.isKindOfClass($.NSSlider)||view.isKindOfClass($.NSStepper))track(view);var children=view.subviews;for(var i=0;i<Number(children.count);i++)visit(children.objectAtIndex(i));}visit(root);
    }
    function eventID(value){try{var area=value&&value.trackingArea,info=area&&area.userInfo;if(!info||typeof info.objectForKey!=='function')return '';var id=ObjC.unwrap(info.objectForKey('id'));return typeof id==='string'?id:'';}catch(_){return '';}}
    function event(value,hovered){var id=eventID(value);if(id)set(id,hovered);}
    function clear(root){Object.keys(rows).forEach(function(id){var row=rows[id];if(row.view.isDescendantOf(root)){row.view.removeTrackingArea(row.area);row.view.identifier='';row.plate.removeFromSuperview;delete rows[id];}});}
    function cursor(value){var id=eventID(value);if(!id)return;var row=rows[id];if(row&&row.view.enabled)$.NSCursor.pointingHandCursor.set;else $.NSCursor.arrowCursor.set;}
    return {clear:clear,cursor:cursor,configure:configure,track:track,sync:sync,event:event,set:set,count:function(){return Object.keys(rows).length;},scans:function(){return scans;}};
}())
