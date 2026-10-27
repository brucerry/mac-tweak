/* Native presentation only. Retained approval stays in the controller. */
(function () {
    function recommendation(actions, canApply) {
        var alert=$.NSAlert.alloc.init;alert.alertStyle=canApply?$.NSAlertStyleInformational:$.NSAlertStyleWarning;
        alert.icon=Icons.image(canApply?'wrench.and.screwdriver':'exclamationmark.triangle');
        alert.messageText=canApply?'Apply these changes?':'A manual step is needed';
        alert.informativeText=actions.map(function(action){return '• '+action;}).join('\n\n')+(canApply?'\n\nOriginals are saved before changes.':'\n\nResolve these requirements, then try Review again.');
        if(actions.join('\n').length>750){
            alert.informativeText=canApply?'Review the changes below. Originals are saved first.':'Resolve these requirements, then try Review again.';
            var scroll=$.NSScrollView.alloc.initWithFrame($.NSMakeRect(0,0,560,240));scroll.hasVerticalScroller=true;scroll.autohidesScrollers=true;
            var view=$.NSTextView.alloc.initWithFrame($.NSMakeRect(0,0,544,240));view.editable=false;view.richText=false;view.font=$.NSFont.systemFontOfSize(13);view.textContainerInset=$.NSMakeSize(10,10);view.textContainer.containerSize=$.NSMakeSize(520,1000000);view.textContainer.widthTracksTextView=true;view.verticallyResizable=true;view.maxSize=$.NSMakeSize(1000000,1000000);view.string=actions.map(function(action){return '• '+action;}).join('\n\n');scroll.documentView=view;alert.accessoryView=scroll;
        }
        if(canApply){alert.addButtonWithTitle('Apply');alert.addButtonWithTitle('Cancel');alert.addButtonWithTitle('Later');}else{alert.addButtonWithTitle('Later');}
        return alert;
    }
    function noChanges(){var alert=$.NSAlert.alloc.init;alert.alertStyle=$.NSAlertStyleInformational;alert.messageText='No changes to apply';alert.informativeText='The selected setup is already up to date. Apply is unavailable until Review finds a change.';alert.addButtonWithTitle('OK');return alert;}
    return {recommendation:recommendation,noChanges:noChanges};
}())
