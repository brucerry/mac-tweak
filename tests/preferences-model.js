/* Pure typed data validation. Never accesses or writes macOS preferences. */
ObjC.import('Foundation');
function run(argv) {
    function read(path) { return ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, Ref())); }
    var model = (0, eval)(read(argv[0] + '/src/preferences/model.js'));
    var source = JSON.parse(read(argv[0] + '/src/catalog/preferences.json'));
    var store=(0,eval)(read(argv[0]+'/src/preferences/store.js'));
    ['com.apple.wallpaper.agent','com.apple.wallpaper.macintosh','com.apple.ScreenSaver.Engine'].forEach(function(domain){if(store.visualMutationAllowed({domain:domain,key:'anything'}))throw new Error('Protected visual domain allowed');});
    if(store.visualMutationAllowed({domain:'com.apple.screensaver',key:'moduleDict',id:'screensaver-idle',scope:'current-user-current-host'})||store.visualMutationAllowed({domain:'com.apple.screensaver',key:'idleTime',id:'screensaver-idle'}))throw new Error('Only bounded per-host idle timing may be changed.');
    if(!store.visualMutationAllowed({domain:'com.apple.screensaver',key:'idleTime',id:'screensaver-idle',scope:'current-user-current-host'}))throw new Error('Supported idle timing must remain available.');
    var settings = model.catalog(source), count = 0;
    function check(value) { if (!value) throw new Error('Preference model assertion ' + count); count++; }
    function reject(action) { var failed = false; try { action(); } catch (_) { failed = true; } check(failed); }
    function invalidCatalog(edit) { var value = JSON.parse(JSON.stringify(source)); edit(value); reject(function () { model.catalog(value); }); }
    function request(values, selected) { return model.desired(settings, selected || model.groups, { version: 1, values: values }); }
    check(settings.length === 102);
    invalidCatalog(function (value) { value.settings.filter(function (row) { return row.id === 'mouse-speed'; })[0].step = 0; });
    check(request([{ id: 'mouse-speed', mode: 'set', value: 0.875 }]).filter(function (row) { return row.id === 'mouse-speed'; })[0].choice.value === 0.875);
    check(settings.filter(function (row) { return row.id === 'dock-recent'; })[0].choice.value === false);
    check(model.desired(settings, ['screenshots']).every(function (row) { return row.choice.mode === 'keep'; }));
    check(request([{ id: 'dock-recent', mode: 'set', value: false }])[13].choice.value === false);
    invalidCatalog(function (v) { v.version = 2; });
    invalidCatalog(function (v) { v.settings[1] = v.settings[0]; });
    invalidCatalog(function (v) { v.settings[0].domain = 'com.apple.not-allowed'; });
    invalidCatalog(function (v) { v.settings[0].key = 'persistent-apps'; });
    invalidCatalog(function (v) { v.settings[0].choice.value = 'unknown'; });
    invalidCatalog(function (v) { v.settings[0].label = 'Bad\nlabel'; });
    invalidCatalog(function (v) { v.settings[8].minimum = 200; });
    [
        [{ id: 'dock-size', mode: 'set', value: 900 }],
        [{ id: 'dock-size', mode: 'set', value: true }],
        [{ id: 'dock-size', mode: 'set', value: 20.5 }],
        [{ id: 'dock-size', mode: 'set', value: Infinity }],
        [{ id: 'finder-view', mode: 'set', value: 'unknown' }],
        [{ id: 'dock-recent', mode: 'set', value: 0 }],
        [{ id: 'screenshots-format', mode: 'set', value: 'png', domain: 'other' }],
        [{ id: 'dock-size', mode: 'default', value: 49 }],
        [{ id: 'dock-size', mode: 'force' }],
        [{ id: 'unknown', mode: 'keep' }],
        [{ id: 'dock-size', mode: 'keep' }, { id: 'dock-size', mode: 'keep' }]
    ].forEach(function (values) { reject(function () { request(values); }); });
    reject(function () { request([{ id: 'dock-size', mode: 'keep' }], ['finder']); });
    check(request([{ id: 'dock-size', mode: 'default' }]).filter(function (v) { return v.id === 'dock-size'; })[0].choice.mode === 'default');
    check(request([{ id: 'dock-size', mode: 'set', value: 49 }]).filter(function (v) { return v.id === 'dock-size'; })[0].choice.value === 49);
    return 'PASS: preference schema, 102 bounded identities, published choices, and ' + count + ' validation checks';
}
