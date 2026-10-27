/* Permanent read-only configuration browser; independent of transient Review jobs. */
(function () {
    function label(text,x,y,w,h,size) { var view=$.NSTextField.labelWithString(text); view.frame=$.NSMakeRect(x,y,w,h); view.font=$.NSFont.systemFontOfSize(size); view.textColor=$.NSColor.labelColor; return view; }
    function create(root,parts,titles,component,target,backend) {
        var editor={root:root,parts:parts,rows:[],selected:null,backend:backend,panel:$.NSPanel.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(0,0,980,620),1,$.NSBackingStoreBuffered,false)};
        editor.panel.title='Saved configuration';nativeWindowChrome(editor.panel); editor.panel.releasedWhenClosed=false;
        var content=editor.panel.contentView; content.addSubview(label('Saved files',20,574,180,26,19));
        editor.group=$.NSPopUpButton.alloc.initWithFramePullsDown($.NSMakeRect(212,572,748,28),false);
        editor.group.addItemsWithTitles(parts.map(function(part){return titles[part.id]||part.title||part.id;}));
        editor.group.target=target; editor.group.action='savedGroup:'; editor.group.setAccessibilityLabel('Saved configuration component');content.addSubview(editor.group);
        var list=$.NSScrollView.alloc.initWithFrame($.NSMakeRect(20,76,370,480));list.hasVerticalScroller=true;list.autohidesScrollers=true;list.drawsBackground=false;
        editor.list=list;content.addSubview(list);
        var scroll=$.NSScrollView.alloc.initWithFrame($.NSMakeRect(408,76,552,480));scroll.hasVerticalScroller=true;scroll.autohidesScrollers=true;
        editor.text=$.NSTextView.alloc.initWithFrame($.NSMakeRect(0,0,536,480));editor.text.editable=false;editor.text.richText=false;editor.text.font=$.NSFont.monospacedSystemFontOfSizeWeight(11,$.NSFontWeightRegular);
        editor.text.textContainerInset=$.NSMakeSize(12,12);editor.text.textContainer.containerSize=$.NSMakeSize(510,1000000);editor.text.textContainer.widthTracksTextView=true;
        editor.text.minSize=$.NSMakeSize(0,480);editor.text.maxSize=$.NSMakeSize(1000000,1000000);editor.text.verticallyResizable=true;editor.text.horizontallyResizable=false;editor.text.autoresizingMask=2;editor.text.backgroundColor=$.NSColor.textBackgroundColor;editor.text.textColor=$.NSColor.textColor;
        scroll.documentView=editor.text;content.addSubview(scroll);
        editor.reveal=$.NSButton.buttonWithTitleTargetAction('Reveal in Finder',target,'revealSaved:');editor.reveal.frame=$.NSMakeRect(20,20,170,34);editor.reveal.enabled=false;content.addSubview(editor.reveal);
        var refresh=$.NSButton.buttonWithTitleTargetAction('Refresh',target,'refreshSaved:');refresh.frame=$.NSMakeRect(204,20,100,34);content.addSubview(refresh);
        var close=$.NSButton.buttonWithTitleTargetAction('Close',target,'closeSaved:');close.frame=$.NSMakeRect(854,20,106,34);close.keyEquivalent='\u001b';content.addSubview(close);
        editor.notice=label('',320,20,520,34,11);editor.notice.cell.wraps=true;content.addSubview(editor.notice);
        editor.refresh=function(id){
            editor.notice.stringValue='';
            if(editor.document)Hovers.clear(editor.document);
            editor.component=id;editor.selected=null;editor.reveal.enabled=false;editor.group.selectItemAtIndex(parts.map(function(part){return part.id;}).indexOf(id));
            try{editor.rows=JSON.parse(backend('resources',[id]));}catch(error){editor.rows=[];list.documentView=$.MacTweakFlippedView.alloc.initWithFrame($.NSMakeRect(0,0,354,480));editor.text.string=String(error);return;}
            var document=$.MacTweakFlippedView.alloc.initWithFrame($.NSMakeRect(0,0,354,Math.max(480,editor.rows.length*82)));
            document.wantsLayer=true;editor.document=document;
            editor.rows.forEach(function(row,index){
                var name=label(row.title+(row.exists?'':' · Not present'),8,index*82+4,336,22,12);name.font=$.NSFont.boldSystemFontOfSize(12);document.addSubview(name);
                var path=label(row.path,8,index*82+28,336,46,10);path.cell.wraps=true;path.cell.lineBreakMode=$.NSLineBreakByCharWrapping;path.textColor=$.NSColor.secondaryLabelColor;document.addSubview(path);
                var button=$.NSButton.alloc.initWithFrame($.NSMakeRect(0,index*82,354,78));button.title='';button.transparent=true;button.target=target;button.action='savedResource:';button.tag=index;
                button.setAccessibilityLabel(row.title+' · '+row.path+(row.exists?' · Present':' · Not present'));document.addSubview(button);
            });
            list.documentView=document;Hovers.sync(document);
            if(editor.rows.length)choose(editor,0);else editor.text.string='No saved records yet. This browser is available before Review and after reopening the app.';
        };
        editor.refresh(component);return editor;
    }
    function choose(editor,index){
        var row=editor.rows[index];if(!row)return;editor.notice.stringValue='';editor.selected=row;editor.reveal.enabled=row.exists;
        try{editor.text.string=editor.backend('view',[editor.component,String(row.id),row.path]);}catch(error){editor.text.string=row.path+'\n\n'+String(error);}
        editor.text.scrollRangeToVisible($.NSMakeRange(0,0));
    }
    function reveal(editor,adapter){
        if(!editor||!editor.selected||!editor.reveal.enabled)return;
        try{(adapter||NativeFiles.reveal)(editor.selected.path);editor.notice.textColor=$.NSColor.secondaryLabelColor;editor.notice.stringValue='';}
        catch(error){editor.notice.textColor=$.NSColor.systemRedColor;editor.notice.stringValue=String(error);editor.reveal.enabled=false;}
    }
    return {create:create,choose:choose,reveal:reveal};
}())
