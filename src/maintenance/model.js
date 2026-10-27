/* Read-only inventory and exact accepted-item validation. Files are never executed. */
(function () {
    var helperNames = { gestures: 'DockMinimizer', closing: 'QuitOnRed', windowskeys: 'WindowsKeys' };
    function pidStart(io, pid) {
        if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return '';
        try { return io.capture('/bin/ps', ['-p', String(pid), '-o', 'lstart=']).trim(); } catch (_) { return ''; }
    }
    function plist(io, path) {
        if (!io.attributes(path) || !io.safeAncestors(path, path[0] === '/' ? '/' + path.split('/').filter(Boolean)[0] : '', false)) return null;
        var bytes = $.NSData.dataWithContentsOfFile(path);
        if (!bytes || Number(bytes.length) > 2097152) return null;
        var raw = $.NSPropertyListSerialization.propertyListWithDataOptionsFormatError(bytes, 0, Ref(), Ref());
        var value = raw ? ObjC.deepUnwrap(raw) : null; return value && typeof value === 'object' ? value : null;
    }
    function runningApps(io, context) {
        if (context.fixture) {
            var fixture = context.fixture + '/running.json'; return io.attributes(fixture) ? io.json(fixture) : [];
        }
        var applications=$.NSWorkspace.sharedWorkspace.runningApplications,result=[];
        for(var index=0;index<Number(applications.count);index++){
            try{var path=ObjC.unwrap(applications.objectAtIndex(index).bundleURL.path);if(typeof path==='string'&&path)result.push(path);}catch(_){}
        }
        try { result = result.concat(io.capture('/bin/ps',['-axo','comm=']).split('\n').map(function(path){return path.trim();}).filter(function(path){return path[0]==='/';})); } catch (_) { result.unknown=true; }
        return result;
    }
    function appRunning(path, running) { return !!running.unknown || running.some(function (row) { return row === path || row.indexOf(path + '/') === 0; }); }
    function lockState(io,context){
        var path=context.state+'/lock',attrs=io.attributes(path);if(!attrs)return {state:'missing',path:path};
        if(!io.safeAncestors(path,context.home,false)||attrs.type!=='NSFileTypeDirectory'||attrs.uid!==context.uid)return {state:'unknown',path:path};
        try{var pidText=io.read(path+'/pid').trim();if(!/^[1-9][0-9]{0,8}$/.test(pidText))throw new Error('Invalid lock owner.');var result=io.command('/bin/ps',['-p',pidText,'-o','pid=,lstart=']);if(result.status===0&&result.text.trim())return {state:'active',path:path,pid:Number(pidText)};if(result.status!==1||result.text.trim())throw new Error('Cannot establish the previous process state.');return {state:'stale',path:path,pid:Number(pidText),token:io.hex(io.shaText(JSON.stringify(io.tree(path))))};}catch(_){return {state:'unknown',path:path};}
    }
    function inventory(mode, io, context, ignoreLock) {
        if (['cleanup','remove'].indexOf(mode) < 0) throw new Error('Unknown maintenance mode.');
        var rows = [], seen = {}, home = context.home, state = context.state, running = runningApps(io, context), locked = !!io.attributes(state + '/lock') && !ignoreLock;
        function item(path, title, reason, kind, extra) {
            if (!io.pathOK(path) || seen[path]) return null;
            var attrs = io.attributes(path); if (!attrs) return null;
            var root = path.indexOf(home + '/') === 0 ? home : path.indexOf(context.temporary + '/') === 0 ? context.temporary : context.applications;
            var blocked = locked ? 'Setup is locked. Finish the current run or inspect the stale lock first.' : '';
            if (!io.safeAncestors(path, root, false) || attrs.type === 'NSFileTypeSymbolicLink') blocked = 'Symlink or unsafe parent; inspect this path manually.';
            if (attrs.immutable || !$.NSFileManager.defaultManager.isDeletableFileAtPath(path)) blocked = 'This item is protected or not removable by this user.';
            if (attrs.uid !== context.uid && path.indexOf(home + '/') === 0) blocked = 'This item belongs to another user.';
            var row = { id: io.hex(io.shaText(path)), path: path, title: title, reason: reason, kind: kind,
                state: attrs, blocked: blocked, requires: [], app: '', references: [], selected: false };
            Object.keys(extra || {}).forEach(function (key) { row[key] = extra[key]; });
            rows.push(row); seen[path] = row; return row;
        }
        var runs = state + '/runs', names = io.safeAncestors(runs, home, false) ? io.list(runs).filter(function (name) { return /^\d{8}T\d{6}Z-\d+$/.test(name); }) : [];
        if (mode === 'cleanup') {
            var hosts=home+'/Library/Caches/io.github.brucerry.MacTweak/hosts';
            if(io.safeAncestors(hosts,home,false))io.list(hosts).filter(function(name){return /^[a-f0-9]{64}$/.test(name);}).forEach(function(name){var path=hosts+'/'+name;try{var marker=io.json(path+'/host.json'),app=path+'/Mac Tweak.app';if(marker.version!==1||marker.app!==app||!io.pathOK(marker.root)||plist(io,app+'/Contents/Info.plist').CFBundleIdentifier!=='io.github.brucerry.MacTweak')return;var row=item(path,'Cached Mac Tweak launcher','App-generated source launcher cache. The project and saved settings stay in place.','temporary');if(row&&appRunning(app,running))row.blocked='This Mac Tweak window is using the launcher. Close it before cleaning this cache.';}catch(_){}});
            names.forEach(function (name) {
                var path = runs + '/' + name, row = item(path + '/stage', 'Run staging · ' + name, 'Temporary downloads/build files. Recovery originals and run records stay in place.', 'temporary');
                if (row && pidStart(io, name.split('-')[1])) row.blocked = 'The run process is still active.';
            });
            if (io.attributes(context.temporary) && io.attributes(context.temporary).type === 'NSFileTypeDirectory') io.list(context.temporary).filter(function (name) { return /^(?:mac-tweak|macos-setup)-gui-[A-Fa-f0-9-]{36}$/.test(name); }).forEach(function (name) {
                var path = context.temporary + '/' + name, row = item(path, 'Abandoned setup session', 'Private temporary chooser output and transport files.', 'temporary');
                if (!row || row.blocked) return;
                try {
                    var marker = io.json(path + '/session.json');
                    if (marker.version !== 1 || marker.uid !== context.uid || !Number.isInteger(marker.pid) || marker.pid <= 0 || typeof marker.start !== 'string' || !marker.start) throw new Error('Invalid session marker');
                    var start = pidStart(io, marker.pid);
                    if (start && start === marker.start) row.blocked = 'This chooser session is still active.';
                } catch (_) { row.blocked = 'Session ownership/activity cannot be verified; leave this directory in place.'; }
            });
        } else {
            names.slice(-2000).forEach(function(name){
                var run=runs+'/'+name,eventPath=run+'/events.txt',events=[];
                if(!io.safeAncestors(eventPath,home,false)||!io.attributes(eventPath))return;
                try{events=io.read(eventPath).split('\n').filter(Boolean).map(function(line){return line.split('|');});}catch(_){return;}
                function original(path,title,reason,successor){
                    var row=item(path,title,reason+' Only the saved original moves to Trash; current settings stay.', 'backup');if(!row)return null;
                    row.run=run;row.observations=[{path:eventPath,hash:io.sha(eventPath)}];
                    if(successor){
                        if(!io.pathOK(successor)||!io.safeAncestors(successor,home,false)||!io.attributes(successor))row.blocked='The current successor is missing or unsafe; preserve this original.';
                        else{row.successor=successor;try{row.successorTree=io.tree(successor);}catch(_){row.blocked='Cannot inspect the current successor safely.';}}
                    }
                    return row;
                }
                events.forEach(function(event){
                    var target=event[1],path=event[2];
                    if(event[0]==='backup'){
                        var prefix=run+'/backups/';
                        if(typeof path!=='string'||path.indexOf(prefix)!==0||!/^\d+$/.test(path.slice(prefix.length)))return;
                        var config=home+'/.config/'+context.storage+'/';
                        var allowed=target===home+'/.zshrc'||target===home+'/.zprofile'||target.indexOf(config)===0&&/^(?:[a-z-]+\.zsh|profiles\/Mac (?:Tweak|Setup) (?:Dark|Light)\.terminal)$/.test(target.slice(config.length))||/^org\.macossetup\.(gestures|closing|windowskeys)\.plist$/.test(target.slice((home+'/Library/LaunchAgents/').length))&&target.indexOf(home+'/Library/LaunchAgents/')===0||/^local\.bruce\.(DockMinimizer|QuitOnRed|WindowsKeys)\.plist$/.test(target.slice((home+'/Library/LaunchAgents/').length))&&target.indexOf(home+'/Library/LaunchAgents/')===0;
                        if(!allowed)return;
                        var row=original(path,'Old '+target.split('/').pop()+' · '+name,'Previous configuration for '+target+'.',target);
                        if(row&&!events.some(function(e){return e[0]==='changed'&&e[1]===target;}))row.blocked='No successful replacement is recorded for this original.';
                    }else if(event[0]==='helper-backup'){
                        var helper=Object.keys(helperNames).map(function(id){return helperNames[id];}).filter(function(n){return path===run+'/backups/'+n+'.app'&&target===home+'/Applications/'+n+'.app';})[0];
                        if(!helper)return;var row=original(path,'Old '+helper+' · '+name,'Previous app-generated helper copy.',target);
                        if(row){var metadata=plist(io,target+'/Contents/Info.plist');if(!metadata||metadata.CFBundleIdentifier!=='local.bruce.'+helper||!events.some(function(e){return e[0]==='helper-installed'&&e[1]===target;}))row.blocked='The replacement helper cannot be confirmed.';row.app=path;if(appRunning(path,running))row.blocked='This old copy is still running. Quit the old copy before removing it; the current helper can keep running.';}
                    }
                });
                var snapshot=run+'/preferences.json';
                if(io.attributes(snapshot)){
                    var row=original(snapshot,'Old preference originals · '+name,'Recorded values from before this run. Key-level recovery for this run will become unavailable.',null);
                    if(row&&!row.blocked){try{row.preferenceState=io.capture('/usr/bin/osascript',['-l','JavaScript',context.source+'/preferences/bridge.js',context.source,'cleanup-check',run]).trim();}catch(_){row.blocked='Preference originals or successful outcomes could not be validated; preserve this record.';}}
                }
            });
        }
        return rows.sort(function (a,b) { return a.title.localeCompare(b.title) || a.path.localeCompare(b.path); });
    }
    function selected(mode, ids, io, context, ignoreLock) {
        if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200 || ids.some(function (id,i) { return typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id) || ids.indexOf(id) !== i; })) throw new Error('Select a valid, nonempty item list.');
        var rows = inventory(mode, io, context, ignoreLock), items = ids.map(function (id) { var row = rows.filter(function (row) { return row.id === id; })[0]; if (!row || row.blocked) throw new Error(row ? row.path + ': ' + row.blocked : 'An item is no longer available; refresh the list.'); return row; });
        items.forEach(function (row) { if (row.requires.some(function (id) { return ids.indexOf(id) < 0; })) throw new Error('Also select the matching login file before removing ' + row.title + '.'); });
        items.forEach(function (a) { if (items.some(function (b) { return a !== b && a.path.indexOf(b.path + '/') === 0; })) throw new Error('Overlapping removal paths are not allowed.'); });
        return items.sort(function (a,b) { return (a.kind === 'application' ? 1 : 0) - (b.kind === 'application' ? 1 : 0) || a.path.localeCompare(b.path); });
    }
    function freeze(items, io) { return items.map(function (row) { var value = JSON.parse(JSON.stringify(row)); value.fingerprint = io.tree(row.path); if (JSON.stringify(value.fingerprint.entries[0].state) !== JSON.stringify(value.state)) throw new Error('Item changed during preview: ' + row.path); value.bytes = value.fingerprint.bytes; return value; }); }
    function unchanged(row, io, context) {
        (row.observations||[]).forEach(function(value){if(!io.attributes(value.path)||io.sha(value.path)!==value.hash)throw new Error('Recovery record changed after review.');});
        if(row.successor&&JSON.stringify(io.tree(row.successor))!==JSON.stringify(row.successorTree))throw new Error('Current configuration changed after review.');
        if(row.preferenceState&&io.capture('/usr/bin/osascript',['-l','JavaScript',context.source+'/preferences/bridge.js',context.source,'cleanup-check',row.run]).trim()!==row.preferenceState)throw new Error('Current preferences changed after review.'); if (JSON.stringify(io.tree(row.path)) !== JSON.stringify(row.fingerprint)) throw new Error('Item changed after review: ' + row.path); }
    return { inventory: inventory, selected: selected, freeze: freeze, unchanged: unchanged, running: runningApps, appRunning: appRunning, pidStart: pidStart, lockState:lockState };
}())
