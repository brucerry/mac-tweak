/* Native preference sheet. Controls edit a draft; only Done can commit it. */
(function () {
    function label(text, x, y, width, height, size, bold) {
        var view = $.NSTextField.labelWithString(text);
        view.frame = $.NSMakeRect(x, y, width, height);
        view.font = bold ? $.NSFont.boldSystemFontOfSize(size) : $.NSFont.systemFontOfSize(size);
        view.textColor = $.NSColor.labelColor;
        return view;
    }
    function popup(items, x, y, width, target, action, tag) {
        var control = $.NSPopUpButton.alloc.initWithFramePullsDown($.NSMakeRect(x, y, width, 28), false);
        control.addItemsWithTitles(items); control.target = target; control.action = action; control.tag = tag;
        return control;
    }
    function currentValue(row) {
        if(row.setting.id==='screensaver-idle')return Math.round(Number(row.control.doubleValue))*60;
        if (row.setting.type === 'number') return Math.round(Number(row.control.doubleValue) / (row.setting.step || 1)) * (row.setting.step || 1);
        if (row.setting.type === 'boolean') return Number(row.control.indexOfSelectedItem) === 0;
        return row.setting.values[Number(row.control.indexOfSelectedItem)];
    }
    function update(editor, index) {
        var row = editor.rows[index], active = Number(row.mode.indexOfSelectedItem) === 2;
        row.control.enabled = active;
        row.control.hidden = !active;
        if (row.number) { row.number.hidden = !active; row.control.doubleValue = currentValue(row)/(row.setting.id==='screensaver-idle'?60:1); row.number.stringValue = row.setting.id==='screensaver-idle'?(currentValue(row)===0?'Never':Math.round(currentValue(row)/60)+' min'):String(currentValue(row)); }
        if(row.decrease){row.decrease.hidden=!active;row.increase.hidden=!active;row.decrease.enabled=active&&currentValue(row)>row.setting.minimum;row.increase.enabled=active&&currentValue(row)<row.setting.maximum;Hovers.track(row.decrease);Hovers.track(row.increase);}
    }
    function adjust(editor,index,direction){var row=editor.rows[index];if(!row||!row.decrease||Number(row.mode.indexOfSelectedItem)!==2||[1,-1].indexOf(direction)<0)return;row.control.doubleValue=Math.max(row.setting.minimum,Math.min(row.setting.maximum,currentValue(row)+direction*60))/60;update(editor,index);}
    function visibleDraft(editor) {
        return editor.rows.map(function (row) {
            var mode = ['keep', 'default', 'set'][Number(row.mode.indexOfSelectedItem)];
            var value = { id: row.setting.id, mode: mode };
            if (mode === 'set') value.value = currentValue(row);
            return value;
        });
    }
    function draft(editor) {
        var visible = visibleDraft(editor), ids = visible.map(function (row) { return row.id; });
        return editor.values.filter(function (row) { return ids.indexOf(row.id) < 0; }).concat(visible);
    }
    function select(editor, component) {
        editor.values = draft(editor);
        editor.group.selectItemAtIndex(editor.selected.indexOf(component));
        editor.render(component);
    }
    function create(settings, selected, desired, target, pages, initial) {
        var editor = { rows: [], selected: selected.slice(), values: desired.map(function (row) { var value = { id: row.id, mode: row.choice.mode }; if (row.choice.mode === 'set') value.value = row.choice.value; return value; }), panel: $.NSPanel.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(0, 0, 640, 560), 1, $.NSBackingStoreBuffered, false) };
        editor.panel.title = 'Preferences';nativeWindowChrome(editor.panel); editor.panel.releasedWhenClosed = false;
        var content = editor.panel.contentView;
        content.addSubview(label('Preferences', 20, 520, 180, 24, 18, true));
        var scroll = $.NSScrollView.alloc.initWithFrame($.NSMakeRect(20, 78, 600, 424));
        scroll.hasVerticalScroller = true; scroll.autohidesScrollers = true;
        scroll.drawsBackground = false;
        pages=pages||{};
        var names = { wallpaper:'Wallpaper', screensaver:'Screen saver', protection:'Screen protection', displays:'Display', power:'Power', finder: 'Finder', dock: 'Dock', keyboard: 'Keyboard', screenshots: 'Screenshots', terminal: 'Terminal', windowskeys: 'Windows keyboard', gestures: 'Dock & gestures', closing: 'App close behavior' };
        function title(component) { return names[component] || component[0].toUpperCase() + component.slice(1); }
        editor.group = popup(selected.map(title), 218, 516, 400, target, 'preferenceGroup:', 0);
        editor.group.setAccessibilityLabel('Preference group'); content.addSubview(editor.group);
        editor.render = function (component) {
            if(editor.document)Hovers.clear(editor.document);
            editor.rows = [];
            var document = $.MacTweakFlippedView.alloc.initWithFrame($.NSMakeRect(0, 0, 584, 424)), y = 8;
            document.wantsLayer=true;editor.document=document;
            editor.guidedActions=[];var page=pages[component];
            if(page){var note=label(page.note,8,y+6,568,66,12,false);note.cell.wraps=true;document.addSubview(note);y+=80;page.actions.forEach(function(action,index){var button=$.NSButton.buttonWithTitleTargetAction(action.title,target,'openSettingsPage:');button.frame=$.NSMakeRect(8,y,568,32);button.tag=index;button.setAccessibilityLabel(action.title);document.addSubview(button);editor.guidedActions.push(action);y+=42;});y+=12;}
            settings.filter(function (setting) { return setting.component === component; }).forEach(function (setting) {
                var choice = editor.values.filter(function (row) { return row.id === setting.id; })[0];
                var index = editor.rows.length, row = { setting: setting };
                row.label=label(setting.id==='screensaver-idle'?'Custom delay (min)':setting.label, 8, y + 14, 226, 20, 12, false);document.addSubview(row.label);
                row.mode = popup(['Keep current', 'Use macOS default', 'Set value'], 238, y + 8, 174, target, 'preferenceMode:', index);
                row.mode.selectItemAtIndex(['keep', 'default', 'set'].indexOf(choice.mode));
                row.mode.setAccessibilityLabel((setting.id==='screensaver-idle'?'Custom delay':setting.label) + ' action');
                var value = choice.mode === 'set' ? choice.value : setting.choice.mode === 'set' ? setting.choice.value : setting.type === 'number' ? setting.minimum : setting.type === 'boolean' ? false : setting.values[0];
                if(setting.id==='screensaver-idle'&&choice.mode!=='set'){var observed=(initial||{})[setting.id];value=typeof observed==='number'&&observed>=0&&observed<=10800?observed:600;}
                if (setting.type === 'number') {
                    row.control = $.NSSlider.alloc.initWithFrame($.NSMakeRect(422, y + 12, 112, 24));
                    var divisor=setting.id==='screensaver-idle'?60:1;row.control.minValue = setting.minimum/divisor; row.control.maxValue = setting.maximum/divisor; row.control.doubleValue = value/divisor;
                    row.control.continuous = true; row.control.target = target; row.control.action = 'preferenceValue:'; row.control.tag = index;
                    row.control.setAccessibilityHelp(setting.id==='screensaver-idle'?'Range 0 to 180 minutes. Zero means Never.':'Range ' + setting.minimum + ' to ' + setting.maximum + '.');
                    row.number = label(String(value), 540, y + 14, 40, 20, 12, false); document.addSubview(row.number);
                    if(setting.id==='screensaver-idle'){
                        row.control.frame=$.NSMakeRect(284,y+50,186,24);row.number.frame=$.NSMakeRect(480,y+50,54,24);
                        [['decrease','−',238,0,'Decrease custom delay by one minute'],['increase','+',542,1,'Increase custom delay by one minute']].forEach(function(item){var button=$.NSButton.buttonWithTitleTargetAction(item[1],target,'preferenceAdjust:');button.frame=$.NSMakeRect(item[2],y+46,34,32);button.tag=index*2+item[3];button.font=$.NSFont.systemFontOfSize(18);button.setAccessibilityLabel(item[4]);button.toolTip=item[4];row[item[0]]=button;document.addSubview(button);});
                    }
                } else {
                    row.control = popup(setting.type === 'boolean' ? ['On', 'Off'] : setting.titles, 422, y + 8, 154, target, 'preferenceValue:', index);
                    row.control.selectItemAtIndex(setting.type === 'boolean' ? value ? 0 : 1 : setting.values.indexOf(value));
                }
                row.control.setAccessibilityLabel(setting.id==='screensaver-idle'?'Custom delay in minutes':setting.label + ' value');
                document.addSubview(row.mode); document.addSubview(row.control); editor.rows.push(row); update(editor, index);
                y += setting.id==='screensaver-idle'?96:52;
            });
            document.frame = $.NSMakeRect(0, 0, 584, Math.max(y + 14, 424)); scroll.documentView = document;
        };
        editor.scroll = scroll; content.addSubview(scroll); editor.render(selected[0]);
        [['Cancel', 'cancelPreferences:', 414, '\u001b'], ['Done', 'finishPreferences:', 520, '\r']].forEach(function (item) {
            var button = $.NSButton.buttonWithTitleTargetAction(item[0], target, item[1]);
            button.frame = $.NSMakeRect(item[2], 22, 100, 34); button.keyEquivalent = item[3]; content.addSubview(button);
        });
        return editor;
    }
    return { create: create, update: update, adjust:adjust, draft: draft, select: select };
}())
