/* Itemized native maintenance: inventory -> exact review -> explicit Trash acceptance. */
(function(){
    function label(text,x,y,w,h,size){var v=$.NSTextField.labelWithString(text);v.frame=$.NSMakeRect(x,y,w,h);v.font=$.NSFont.systemFontOfSize(size);v.textColor=$.NSColor.labelColor;return v;}
    function bytes(value){return value>=1073741824?(value/1073741824).toFixed(1)+' GB':value>=1048576?(value/1048576).toFixed(1)+' MB':value>=1024?(value/1024).toFixed(1)+' KB':value+' B';}
    function selectionSize(items){var total=0,unknown=0;items.forEach(function(row){if(typeof row.bytes==='number'&&isFinite(row.bytes)&&row.bytes>=0)total+=row.bytes;else unknown++;});return bytes(total)+(unknown?' + '+unknown+' size unavailable':'');}
    function create(mode,target,backend,transport,root){
        var editor={mode:mode,rows:[],chosen:{},phase:'inventory',job:null,root:root,transport:transport,backend:backend,target:target,
            panel:$.NSPanel.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(0,0,960,650),1,$.NSBackingStoreBuffered,false)};
        editor.panel.title=mode==='cleanup'?'Clean up temporary files':'Remove old saved configs';nativeWindowChrome(editor.panel);editor.panel.releasedWhenClosed=false;
        var content=editor.panel.contentView;content.addSubview(label(editor.panel.title,20,602,900,28,20));
        editor.message=label('Nothing selected. Items move to Trash only after your review and acceptance.',20,552,920,40,12);editor.message.cell.wraps=true;content.addSubview(editor.message);
        editor.message.toolTip='Selected size includes items hidden by filters. File sizes are refreshed at review; disk space is freed when Trash is emptied.';
        editor.filter=$.NSSearchField.alloc.initWithFrame($.NSMakeRect(20,506,430,30));editor.filter.placeholderString='Filter names or paths';editor.filter.delegate=target;editor.filter.setAccessibilityLabel('Filter maintenance items');content.addSubview(editor.filter);
        editor.show=$.NSPopUpButton.alloc.initWithFramePullsDown($.NSMakeRect(466,506,266,30),false);editor.show.addItemsWithTitles(['All items','Selectable','Selected','Protected']);editor.show.target=target;editor.show.action='maintenanceFilter:';editor.show.setAccessibilityLabel('Show maintenance items');content.addSubview(editor.show);
        editor.bulk=$.NSButton.buttonWithTitleTargetAction('Select all shown',target,'maintenanceBulk:');editor.bulk.frame=$.NSMakeRect(748,504,192,34);editor.bulk.toolTip='Toggle eligible items in this filtered list. Hidden selections are kept.';content.addSubview(editor.bulk);
        var scroll=$.NSScrollView.alloc.initWithFrame($.NSMakeRect(20,90,920,400));scroll.hasVerticalScroller=true;scroll.autohidesScrollers=true;scroll.drawsBackground=false;editor.scroll=scroll;content.addSubview(scroll);
        editor.primary=$.NSButton.buttonWithTitleTargetAction('Review selected…',target,'maintenancePrimary:');editor.primary.frame=$.NSMakeRect(694,25,246,38);content.addSubview(editor.primary);
        editor.close=$.NSButton.buttonWithTitleTargetAction('Close',target,'maintenanceClose:');editor.close.frame=$.NSMakeRect(576,25,106,38);editor.close.keyEquivalent='\u001b';content.addSubview(editor.close);
        editor.refresh=$.NSButton.buttonWithTitleTargetAction('Refresh',target,'maintenanceRefresh:');editor.refresh.frame=$.NSMakeRect(20,25,106,38);content.addSubview(editor.refresh);
        editor.spinner=$.NSProgressIndicator.alloc.initWithFrame($.NSMakeRect(146,38,400,10));editor.spinner.style=$.NSProgressIndicatorStyleBar;editor.spinner.indeterminate=true;editor.spinner.displayedWhenStopped=false;content.addSubview(editor.spinner);
        refresh(editor);return editor;
    }
    function visible(editor){
        if(editor.phase==='review')return editor.review.items;
        var query=ObjC.unwrap(editor.filter.stringValue).toLowerCase().trim(),mode=Number(editor.show.indexOfSelectedItem);
        return editor.rows.filter(function(row){return (!query||(row.title+' '+row.path+' '+row.reason+' '+row.blocked).toLowerCase().indexOf(query)>=0)&&(mode!==1||!row.blocked)&&(mode!==2||editor.chosen[row.id])&&(mode!==3||!!row.blocked);});
    }
    function render(editor){
        if(editor.document)Hovers.clear(editor.document);
        var rows=visible(editor),document=$.MacTweakFlippedView.alloc.initWithFrame($.NSMakeRect(0,0,904,Math.max(400,rows.length*116)));editor.buttons=[];editor.cards=[];
        document.wantsLayer=true;editor.document=document;
        rows.forEach(function(row,index){
            var card=$.NSBox.alloc.initWithFrame($.NSMakeRect(4,index*116+4,884,106));card.boxType=$.NSBoxCustom;card.titlePosition=$.NSNoTitle;card.contentViewMargins=$.NSMakeSize(0,0);card.cornerRadius=12;card.borderWidth=0;card.fillColor=$.NSColor.controlBackgroundColor;document.addSubview(card);
            var mark=selectionMark(16,68,22);card.addSubview(mark.box);
            var name=label(row.title,48,68,816,24,14);name.font=$.NSFont.boldSystemFontOfSize(14);card.addSubview(name);
            var path=label(row.path,48,35,816,32,11);path.cell.wraps=true;path.cell.lineBreakMode=$.NSLineBreakByCharWrapping;path.textColor=$.NSColor.secondaryLabelColor;card.addSubview(path);
            var note=label((typeof row.bytes==='number'?bytes(row.bytes)+' · ':row.sizeError?'Size unavailable · ':'')+(row.blocked||row.reason),48,6,816,28,11);note.cell.wraps=true;note.textColor=row.blocked?$.NSColor.secondaryLabelColor:$.NSColor.labelColor;card.addSubview(note);
            var check=$.NSButton.alloc.initWithFrame($.NSMakeRect(0,0,884,106));check.setButtonType(3);check.title='';check.transparent=true;check.state=editor.phase==='review'||editor.chosen[row.id]?1:0;
            check.enabled=editor.phase==='inventory'&&!row.blocked;check.target=editor.target;check.action='maintenanceToggle:';var sourceIndex=editor.rows.map(function(value){return value.id;}).indexOf(row.id);check.tag=sourceIndex;
            check.setAccessibilityLabel(row.title+' · '+row.path+(row.blocked?' · '+row.blocked:''));card.addSubview(check);editor.buttons[sourceIndex]=check;editor.cards.push({box:card,mark:mark,row:row});
        });
        editor.scroll.documentView=document;Hovers.sync(document);paintChoices(editor);
        if(!rows.length&&editor.phase==='inventory')editor.message.stringValue=editor.rows.length?'No matching items. Your selections are kept.':'No app-generated '+(editor.mode==='cleanup'?'temporary files':'old configuration copies')+' found.';
        update(editor);
    }
    function update(editor){
        var selected=Object.keys(editor.chosen).filter(function(id){return editor.chosen[id];}).length,busy=['preparing','applying'].indexOf(editor.phase)>=0;
        editor.primary.hidden=editor.phase==='finished'||editor.phase==='failed';
        editor.primary.enabled=editor.phase==='review'||editor.phase==='inventory'&&selected>0;
        editor.primary.title=editor.phase==='review'?'Move '+editor.review.items.length+' to Trash':editor.phase==='applying'?'Moving to Trash…':editor.phase==='preparing'?'Preparing review…':'Review selected…';
        editor.filter.enabled=editor.phase==='inventory';editor.show.enabled=editor.phase==='inventory';
        editor.buttons.forEach(function(button,index){if(button)button.enabled=editor.phase==='inventory'&&!editor.rows[index].blocked;});
        var eligible=visible(editor).filter(function(row){return !row.blocked;});
        editor.bulk.enabled=editor.phase==='inventory'&&eligible.length>0;
        editor.bulk.title=eligible.length&&eligible.every(function(row){return !!editor.chosen[row.id];})?'Deselect all shown':'Select all shown';
        editor.bulk.setAccessibilityLabel(ObjC.unwrap(editor.bulk.title));
        editor.close.enabled=editor.phase!=='applying';editor.close.title=editor.phase==='review'||editor.phase==='preparing'?'Cancel':'Close';editor.refresh.enabled=!busy;
        editor.spinner.hidden=!busy;
        if(busy){editor.spinner.indeterminate=editor.phase!=='applying';if(editor.phase==='applying'){editor.spinner.minValue=0;editor.spinner.maxValue=editor.review.items.length;}editor.spinner.startAnimation(null);}else editor.spinner.stopAnimation(null);
        if(editor.phase==='inventory'&&editor.rows.length)editor.message.stringValue=selected?selected+' selected · '+selectionSize(editor.rows.filter(function(row){return !!editor.chosen[row.id];}))+'\nReview the exact list before accepting.':'Nothing selected. Review and accept specific items before they move to Trash.';
        if(editor.phase==='review')editor.message.stringValue=editor.review.items.length+' selected · '+selectionSize(editor.review.items)+'\nClick Move to Trash to accept these paths; Cancel leaves them unchanged.';
        Hovers.track(editor.close);Hovers.track(editor.primary);
    }
    function refresh(editor){
        if(editor.phase==='applying')return;
        cancel(editor);editor.chosen={};editor.phase='inventory';
        editor.filter.hidden=false;editor.show.hidden=false;editor.bulk.hidden=false;editor.close.frame=$.NSMakeRect(576,25,106,38);
        editor.scroll.frame=$.NSMakeRect(20,90,920,400);
        try{editor.rows=JSON.parse(editor.backend('inventory',[editor.mode]));}catch(error){editor.rows=[];editor.phase='failed';editor.message.stringValue=String(error);}
        render(editor);
    }
    function choose(editor,row,value){
        editor.chosen[row.id]=value;
        if(value)(row.requires||[]).forEach(function(id){var dependency=editor.rows.filter(function(item){return item.id===id;})[0];if(dependency&&!dependency.blocked)editor.chosen[id]=true;});
    }
    function paintChoices(editor){
        editor.buttons.forEach(function(button,i){if(button)button.state=editor.phase==='review'||editor.chosen[editor.rows[i].id]?1:0;});
        editor.cards.forEach(function(card){var selected=editor.phase==='review'||!!editor.chosen[card.row.id];paintSelection(card.mark,selected,card.row.blocked?UI.theme.muted:UI.theme.accent);card.box.fillColor=selected?UI.theme.accent.colorWithAlphaComponent(UI.theme.dark?0.20:0.10):$.NSColor.controlBackgroundColor;});
    }
    function toggle(editor,index,value){
        var row=editor.rows[index];if(editor.phase!=='inventory'||!row||row.blocked)return;
        choose(editor,row,value);if(Number(editor.show.indexOfSelectedItem)===2)render(editor);else{paintChoices(editor);update(editor);}
    }
    function bulk(editor){
        if(editor.phase!=='inventory')return;
        var rows=visible(editor).filter(function(row){return !row.blocked;});if(!rows.length)return;
        var value=!rows.every(function(row){return !!editor.chosen[row.id];});rows.forEach(function(row){choose(editor,row,value);});
        if(Number(editor.show.indexOfSelectedItem)===2)render(editor);else{paintChoices(editor);update(editor);}
    }
    function primary(editor){
        if(editor.phase==='inventory'){
            var ids=editor.rows.filter(function(row){return editor.chosen[row.id];}).map(function(row){return row.id;});if(!ids.length)return;
            var uuid=ObjC.unwrap($.NSUUID.UUID.UUIDString),request=editor.transport+'/maintenance-'+uuid+'.json',output=editor.transport+'/maintenance-'+uuid+'.out';
            var fm=$.NSFileManager.defaultManager,attrs={NSFilePosixPermissions:384};
            if(!fm.createFileAtPathContentsAttributes(request,$(JSON.stringify({version:1,ids:ids})).dataUsingEncoding($.NSUTF8StringEncoding),attrs)||!fm.createFileAtPathContentsAttributes(output,$.NSData.data,attrs))throw new Error('Cannot prepare private review transport.');
            var task=$.NSTask.alloc.init,pipe=$.NSPipe.pipe,handle=$.NSFileHandle.fileHandleForWritingAtPath(output);task.launchPath='/usr/bin/osascript';
            task.arguments=['-l','JavaScript',editor.root+'/src/maintenance/bridge.js',editor.root+'/src','session',editor.mode,request];task.standardInput=pipe;task.standardOutput=handle;task.standardError=handle;task.launch;
            editor.job={task:task,pid:Number(task.processIdentifier),input:pipe.fileHandleForWriting,output:output,handle:handle};editor.phase='preparing';editor.spinner.doubleValue=0;editor.message.stringValue='Checking selected contents and recovery records…';update(editor);
        }else if(editor.phase==='review'){
            editor.phase='applying';editor.spinner.doubleValue=0;editor.message.stringValue='Moving only the accepted list to Trash. Keep this window open.';
            editor.job.input.writeData($('trash:'+editor.review.token+'\n').dataUsingEncoding($.NSUTF8StringEncoding));editor.job.input.closeFile;update(editor);
        }
    }
    function poll(editor){
        var job=editor.job;if(!job)return;
        var raw=ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(job.output,$.NSUTF8StringEncoding,Ref()))||'',events=[];
        raw.split('\n').forEach(function(line){try{var value=JSON.parse(line);if(value&&value.type)events.push(value);}catch(_){}});
        var wasApplying=editor.phase==='applying';if(wasApplying)editor.spinner.doubleValue=events.filter(function(row){return row.type==='moved'||row.type==='failed';}).length;
        var ready=events.filter(function(row){return row.type==='ready';})[0],result=events.filter(function(row){return row.type==='result';})[0];
        if(ready&&editor.phase==='preparing'){editor.review=ready;editor.phase='review';editor.message.stringValue='Review these exact paths. Click Move to Trash to accept; Cancel leaves them unchanged.';render(editor);}
        if(!job.task.running&&!result&&wasApplying){
            var receipt=events.filter(function(row){return row.type==='receipt';})[0],moved=events.filter(function(row){return row.type==='moved';}).map(function(row){return row.item;});
            var retained=null,context=MaintenanceIO.make(),retainedPath=context.state+'/maintenance/'+editor.review.token+'/receipt.json';
            try{if(/^[A-Fa-f0-9-]{36}$/.test(editor.review.token)&&MaintenanceIO.safeAncestors(retainedPath,context.home,false)){retained=MaintenanceIO.json(retainedPath);if(retained.version!==1||retained.id!==editor.review.token||retained.mode!==editor.mode||!Array.isArray(retained.items))retained=null;}}catch(_){}
            result={type:'result',status:'interrupted',message:'Cleanup was interrupted. Inspect the listed results before retrying.',receipt:retained?retainedPath:receipt?receipt.path:'',items:editor.review.items.map(function(row){
                var item=(retained?retained.items:[]).filter(function(item){return item.id===row.id&&item.path===row.path;})[0]||moved.filter(function(item){return item.id===row.id;})[0];
                if(item&&['completed','failed','unattempted'].indexOf(item.status)>=0)return item;
                return {id:row.id,path:row.path,title:row.title,status:'unknown',trash:'',error:'macOS did not confirm this outcome.'};
            })};
            var diagnostics=raw.split('\n').filter(function(line){try{return !JSON.parse(line).type;}catch(_){return !!line.trim();}}).join('\n');
            result.diagnostics=diagnostics.slice(-1800)||(Number(job.task.terminationStatus)?'Worker exit status: '+Number(job.task.terminationStatus):'');
            editor.changed=true;
        }
        if(result&&!job.task.running){
            editor.result=result;editor.changed=editor.changed||(result.items||[]).some(function(row){return row.status==='completed'||row.status==='attempting';});editor.phase='finished';update(editor);
            editor.filter.hidden=true;editor.show.hidden=true;editor.bulk.hidden=true;editor.close.frame=$.NSMakeRect(834,25,106,38);
            editor.scroll.frame=$.NSMakeRect(20,90,920,444);
            var text=result.message+'\n\n'+(result.items||[]).map(function(row){return row.status.toUpperCase()+' · '+row.path+(row.trash?'\nTrash: '+row.trash:'')+(row.error?'\n'+row.error:'');}).join('\n\n')+(result.receipt?'\n\nReceipt: '+result.receipt:'')+(result.diagnostics?'\n\nDiagnostics: '+result.diagnostics:'');
            var document=$.NSTextView.alloc.initWithFrame($.NSMakeRect(0,0,904,450));document.editable=false;document.richText=false;document.font=$.NSFont.monospacedSystemFontOfSizeWeight(11,$.NSFontWeightRegular);document.textContainerInset=$.NSMakeSize(12,12);document.textContainer.containerSize=$.NSMakeSize(878,1000000);document.textContainer.widthTracksTextView=true;document.minSize=$.NSMakeSize(0,450);document.maxSize=$.NSMakeSize(1000000,1000000);document.verticallyResizable=true;document.horizontallyResizable=false;document.autoresizingMask=2;document.textColor=$.NSColor.textColor;document.backgroundColor=$.NSColor.textBackgroundColor;document.string=text;editor.scroll.documentView=document;editor.message.stringValue=result.message;
            job.handle.closeFile;editor.job=null;
            if(result.receipt&&editor.review&&MaintenanceIO.attributes(MaintenanceIO.make().state+'/lock')){try{editor.backend('recover-session',[editor.review.token,String(job.pid)]);}catch(error){editor.message.stringValue=result.message+' The app lock needs inspection before another run.';}}
        }else if(!job.task.running&&!result){editor.phase='failed';update(editor);editor.message.stringValue=raw.slice(-1600)||'Review could not finish. No new acceptance was sent.';job.handle.closeFile;editor.job=null;}
    }
    function cancel(editor){if(editor.job&&editor.phase!=='applying'){try{editor.job.input.closeFile;}catch(_){}try{if(editor.job.task.running)editor.job.task.terminate;}catch(_){}try{editor.job.handle.closeFile;}catch(_){}editor.job=null;} }
    return{filter:render,visible:visible,create:create,refresh:refresh,toggle:toggle,bulk:bulk,primary:primary,poll:poll,cancel:cancel,update:update};
}())
