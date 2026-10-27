/* Exact, code-owned resource locations. Never infer paths from plan prose. */
(function () {
    var commands = { node: ['node', 'npm', 'npx'], uv: ['uv', 'uvx'], gh: ['gh'], tig: ['tig'] };
    var helpers = { gestures: 'DockMinimizer', closing: 'QuitOnRed', windowskeys: 'WindowsKeys' };
    function parts(root, io) {
        var seen = {};
        return io.read(root + '/catalog/components.txt').split('\n').filter(function (line) { return line && line[0] !== '#'; }).map(function (line) {
            var fields = line.split('|');
            if (fields.length !== 7 || !/^[a-z][a-z0-9-]*$/.test(fields[0]) || seen[fields[0]] || ['shell','tool','preference','profile','guided'].indexOf(fields[1]) < 0) throw new Error('Invalid component catalog.');
            seen[fields[0]] = true; return { id: fields[0], kind: fields[1], title: fields[3] };
        });
    }
    function rows(root, component, io, context) {
        var part = parts(root, io).filter(function (row) { return row.id === component; })[0], result = [], home = context.home;
        if (!part && component !== 'history') throw new Error('Unknown saved-configuration component.');
        function add(title, path, kind, shared, extra) {
            if (!io.pathOK(path)) throw new Error('Invalid saved-resource path.');
            var attrs = io.attributes(path);
            result.push({ id: result.length, title: title, path: path, kind: kind || 'text', exists: !!attrs,
                type: attrs ? attrs.type : 'missing', shared: !!shared, extra: extra || '',
                resolveAllowed: path === home + '/.zshrc' || path === home + '/.zprofile' || ['prompt','aliases','colors','local-bin-path','env','init'].some(function(name){return path === home + '/.config/' + context.storage + '/' + name + '.zsh';}) });
        }
        function shellFiles() {
            ['.zshrc', '.zprofile'].forEach(function (name) { add(name, home + '/' + name, 'text', true, 'Shared startup file; existing personal contents are preserved by setup.'); });
            ['env','init'].forEach(function (name) { add('Shell loader · ' + name, home + '/.config/' + context.storage + '/' + name + '.zsh', 'text', true); });
        }
        if(component==='wallpaper')add('macOS wallpaper store',home+'/Library/Application Support/com.apple.wallpaper/Store/Index.plist','artifact',true);
        if(component==='screensaver'||component==='protection'){add('Screen-saver settings',home+'/Library/Preferences/com.apple.screensaver.plist','artifact',true);var host=home+'/Library/Preferences/ByHost';if(io.safeAncestors(host,home,false))io.list(host).filter(function(name){return /^com\.apple\.screensaver\.[A-Za-z0-9-]+\.plist$/.test(name);}).forEach(function(name){add('This Mac screen-saver preferences',host+'/'+name,'artifact',true);});}
        if (part && part.kind === 'shell') { add('Saved snippet', home + '/.config/' + context.storage + '/' + component + '.zsh'); shellFiles(); }
        if (commands[component]) {
            add('Active managed release', home + '/.local/opt/' + context.storage + '/' + component + '/current', 'artifact', false);
            commands[component].forEach(function (name) { add('Command · ' + name, home + '/.local/bin/' + name, 'artifact', false); });
            add('Tool PATH', home + '/.config/' + context.storage + '/local-bin-path.zsh', 'text', true); shellFiles();
        }
        if (part && part.kind === 'preference') {
            var settings = JSON.parse(io.read(root + '/catalog/preferences.json')).settings.filter(function (row) { return row.component === component; }), domains = {};
            settings.forEach(function (row) { domains[row.domain] = true; });
            Object.keys(domains).forEach(function (domain) {
                add('Saved preference keys · ' + domain, home + '/Library/Preferences/' + (domain === 'NSGlobalDomain' ? '.GlobalPreferences' : domain) + '.plist', 'preference', false,
                    'Current user / any host. Preferences are managed through macOS services; the plist is a storage reference, not an instruction to edit it directly.');
                result[result.length - 1].domain = domain; result[result.length - 1].component = component;
            });
        }
        if (helpers[component]) {
            var name = helpers[component], app = home + '/Applications/' + name + '.app';
            add('Helper application', app, 'artifact'); add('App metadata', app + '/Contents/Info.plist', 'plist');
            add('Reviewed source stamp', app + '/Contents/Resources/source.sha256');
            ['org.macossetup.' + component, 'local.bruce.' + name].forEach(function (label) { add('Login job · ' + label, home + '/Library/LaunchAgents/' + label + '.plist', 'plist'); });
        }
        if (component === 'terminalprofile') (context.storage === 'macos-setup' ? ['Mac Setup Dark','Mac Setup Light'] : ['Mac Tweak Dark','Mac Tweak Light']).forEach(function (name) { add(name, home + '/.config/' + context.storage + '/profiles/' + name + '.terminal', 'plist'); });
        if (component === 'keyboard' || component === 'windowskeys') {
            var byHost = home + '/Library/Preferences/ByHost';
            if (io.safeAncestors(byHost, home, false) && io.attributes(byHost)) io.list(byHost).filter(function(name){return /^\.GlobalPreferences\.[A-Fa-f0-9-]{36}\.plist$/.test(name);}).forEach(function(name){
                add('Saved device modifier mappings', byHost + '/' + name, 'modifiers', false, 'Existing device mappings only; device identifiers are not copied to another Mac.');
            });
        }
        if (component === 'terminalprofile') add('Saved Terminal profile settings', home + '/Library/Preferences/com.apple.Terminal.plist', 'profile-state', false, 'Portable saved appearance and shell-exit fields only. Startup commands, directories and session state are excluded.');
        var directPaths = result.map(function (row) { return row.path; }), runs = context.state + '/runs';
        if (io.safeAncestors(runs, home, false)) io.list(runs).filter(function (name) { return /^\d{8}T\d{6}Z-\d+$/.test(name); }).reverse().slice(0, 100).forEach(function (name) {
            var path = runs + '/' + name, summary = path + '/summary.txt';
            if (!io.safeAncestors(summary, home, false) || !io.attributes(summary)) return;
            try {
                if (io.read(summary, 16384).split('\n')[0].split(/\s+/).indexOf(component) < 0) return;
                add('Run · ' + name, summary, 'text', true); add('Run actions · ' + name, path + '/events.txt', 'text', true);
                var snapshot = path + '/preferences.json';
                if (io.attributes(snapshot)) {
                    var value = io.json(snapshot);
                    if (value.originals && value.originals.some(function (row) { return row.id.split('-')[0] === component; })) add('Preference originals · ' + name, snapshot, 'snapshot', false, component);
                }
                var events = path + '/events.txt';
                if (io.attributes(events)) io.read(events).split('\n').forEach(function (line) {
                    var fields = line.split('|');
                    if (fields[0] === 'backup' && directPaths.indexOf(fields[1]) >= 0 && fields[2].indexOf(path + '/backups/') === 0 && /^\d+$/.test(fields[2].slice((path + '/backups/').length))) add('Original · ' + fields[1], fields[2], 'text');
                    if (fields[0] === 'helper-backup' && helpers[component] && fields[1] === home + '/Applications/' + helpers[component] + '.app' && fields[2] === path + '/backups/' + helpers[component] + '.app') add('Previous helper app', fields[2], 'artifact');
                });
            } catch (error) { add('Unreadable run · ' + name, summary, 'text', true, String(error)); }
        });
        if (component === 'history') {
            var receipts = context.state + '/maintenance';
            if (io.safeAncestors(receipts, home, false)) io.list(receipts).reverse().slice(0,100).forEach(function (name) {
                if (/^[A-Fa-f0-9-]{36}$/.test(name)) add('Maintenance receipt · ' + name, receipts + '/' + name + '/receipt.json', 'text');
            });
        }
        return result;
    }
    function view(root, component, id, io, context, expectedPath) {
        var list = rows(root, component, io, context), resource = list[Number(id)];
        if (!resource || resource.id !== Number(id)) throw new Error('Unknown saved resource.');
        if (expectedPath && resource.path !== expectedPath) throw new Error('Saved resource list changed. Refresh the component.');
        var introduction = resource.title + '\n' + resource.path + '\n' + (resource.shared ? 'Shared resource\n' : '') + (resource.extra ? resource.extra + '\n' : '') + '\n';
        if (resource.kind === 'preference') {
            var inspected = JSON.parse(io.capture('/usr/bin/osascript', ['-l','JavaScript',root + '/preferences/bridge.js',root,'inspect-group',component]));
            var settings = JSON.parse(io.read(root + '/catalog/preferences.json')).settings;
            return introduction + inspected.filter(function (row) { return settings.some(function (setting) { return setting.id === row.id && setting.domain === resource.domain; }); }).map(function (row) {
                var setting = settings.filter(function (setting) { return setting.id === row.id; })[0];
                return setting.label + '\n' + setting.domain + ' · ' + setting.key + '\n' + JSON.stringify(row.state, null, 2);
            }).join('\n\n');
        }
        if (!resource.exists) return introduction + 'Not present. This page does not create it.';
        if (resource.kind === 'artifact') {
            var resolved = io.canonical(resource.path);
            return introduction + 'Installed artifact (' + resource.type + ').' + (resolved !== resource.path ? '\nResolves to: ' + resolved : '') + '\nUse Reveal in Finder to inspect this artifact.';
        }
        if (!io.safeAncestors(resource.path, context.home, false)) {
            var resolved = io.canonical(resource.path);
            if (resource.resolveAllowed && resource.kind === 'text' && resolved.indexOf(context.home + '/') === 0 && io.safeAncestors(resolved, context.home, false)) return introduction + 'Resolved configuration: ' + resolved + '\n\n' + io.read(resolved);
            return introduction + 'Symlink or non-regular parent. Use Reveal in Finder to inspect the original configuration manager location.';
        }
        if (resource.kind === 'modifiers' || resource.kind === 'profile-state') {
            var bytes = $.NSData.dataWithContentsOfFile(resource.path);
            if (!bytes || Number(bytes.length) > 2097152) throw new Error('Saved preference file is unreadable or oversized.');
            var stored = $.NSPropertyListSerialization.propertyListWithDataOptionsFormatError(bytes, 0, Ref(), Ref());
            if (!stored || !stored.isKindOfClass($.NSDictionary)) throw new Error('Cannot inspect saved property-list dictionary.');
            var result = $.NSMutableDictionary.alloc.init;
            if (resource.kind === 'modifiers') {
                ObjC.deepUnwrap(stored.allKeys).filter(function(key){return /^com\.apple\.keyboard\.modifiermapping\.[0-9]+-[0-9]+-[0-9]+$/.test(key);}).forEach(function(key){result.setObjectForKey(stored.objectForKey(key),key);});
            } else {
                var storedKeys=ObjC.deepUnwrap(stored.allKeys);
                ['Default Window Settings','Startup Window Settings'].forEach(function(key){if(storedKeys.indexOf(key)>=0)result.setObjectForKey(stored.objectForKey(key),key);});
                var profiles = storedKeys.indexOf('Window Settings')>=0?stored.objectForKey('Window Settings'):null, portable = $.NSMutableDictionary.alloc.init;
                if(profiles && profiles.isKindOfClass($.NSDictionary))ObjC.deepUnwrap(profiles.allKeys).forEach(function(name){
                    var profile=profiles.objectForKey(name),selected=$.NSMutableDictionary.alloc.init;
                    ObjC.deepUnwrap(profile.allKeys).filter(function(key){return /^(BackgroundColor|BackgroundAlpha|BackgroundAlphaInactive|BackgroundBlur|BackgroundBlurInactive|BackgroundSettingsForInactiveWindows|CursorColor|CursorBlink|CursorType|Font|FontAntialias|FontHeightSpacing|FontWidthSpacing|ProfileCurrentVersion|TextColor|TextBoldColor|SelectionColor|DynamicANSIForegroundColors|ShowActiveProcessArgumentsInTitle|ShowActiveProcessInTitle|ShowCommandKeyInTitle|ShowDimensionsInTitle|ShowShellCommandInTitle|ShowWindowSettingsNameInTitle|ShowWorkingDirectoryInTitle|columnCount|rowCount|shellExitAction|type|name|ANSI(?:Bright)?(?:Black|Red|Green|Yellow|Blue|Magenta|Cyan|White)Color)$/.test(key);}).forEach(function(key){selected.setObjectForKey(profile.objectForKey(key),key);});portable.setObjectForKey(selected,name);
                });result.setObjectForKey(portable,'Window Settings');
            }
            var xml=$.NSPropertyListSerialization.dataWithPropertyListFormatOptionsError(result,$.NSPropertyListXMLFormat_v1_0,0,Ref());
            return introduction + ObjC.unwrap($.NSString.alloc.initWithDataEncoding(xml,$.NSUTF8StringEncoding));
        }
        if (resource.kind === 'snapshot') {
            var record = io.json(resource.path);
            return introduction + JSON.stringify({ version: record.version, originals: record.originals.filter(function (row) { return row.id.split('-')[0] === component; }),
                actions: record.plan.actions.filter(function (row) { return row.component === component; }) }, null, 2);
        }
        if (resource.kind === 'plist') {
            var bytes = $.NSData.dataWithContentsOfFile(resource.path), value = $.NSPropertyListSerialization.propertyListWithDataOptionsFormatError(bytes, 0, Ref(), Ref());
            if (!value) throw new Error('Cannot inspect saved property list.');
            var xml = $.NSPropertyListSerialization.dataWithPropertyListFormatOptionsError(value, $.NSPropertyListXMLFormat_v1_0, 0, Ref());
            return introduction + ObjC.unwrap($.NSString.alloc.initWithDataEncoding(xml, $.NSUTF8StringEncoding));
        }
        return introduction + io.read(resource.path);
    }
    return { parts: parts, rows: rows, view: view, helpers: helpers };
}())
