/* Built-in JXA bridge. Preference data and snapshots are parsed, never executed. */
ObjC.import('Foundation');
ObjC.import('CoreFoundation');
var PrefModel, PrefIO, Settings, Store;
function settingFor(id) {
    var value = Settings.filter(function (row) { return row.id === id; })[0];
    if (!value) throw new Error('Unknown preference identity: ' + id);
    return value;
}
function validState(value, setting) {
    PrefModel.keys(value, ['present'], ['type', 'value']);
    if (value.present === false) { if (Object.keys(value).length !== 1) throw new Error('Invalid absent preference.'); return value; }
    if (value.present !== true || ['boolean', 'integer', 'real', 'string'].indexOf(value.type) < 0) throw new Error('Invalid stored type: ' + setting.id);
    var type = value.type === 'integer' || value.type === 'real' ? 'number' : value.type;
    var booleanNumber = setting.type === 'boolean' && type === 'number' && (value.value === 0 || value.value === 1);
    if ((!booleanNumber && type !== setting.type) || !PrefModel.scalar(value.value, type) || (value.type === 'integer' && Math.floor(value.value) !== value.value)) throw new Error('Unsupported stored value: ' + setting.id);
    return value;
}
function inspection(setting) {
    var value = Store.inspect(setting);
    PrefModel.keys(value, ['stored', 'host', 'forced', 'effective']);
    if (typeof value.forced !== 'boolean') throw new Error('Invalid policy state.');
    ['stored', 'host', 'effective'].forEach(function (key) { validState(value[key], setting); });
    return value;
}
function stateFor(choice, setting) {
    return choice.mode === 'default' ? { present: false } : { present: true,
        type: setting.type === 'number' ? 'real' : setting.type, value: choice.value };
}
function equal(a, b, exact) {
    var sameValue = a.value === b.value || !exact && ((typeof a.value === 'boolean' && (b.value === 0 || b.value === 1) && a.value === Boolean(b.value)) || (typeof b.value === 'boolean' && (a.value === 0 || a.value === 1) && b.value === Boolean(a.value)));
    var booleanTypes = !exact && ((a.type === 'boolean' && ['real', 'integer'].indexOf(b.type) >= 0) || (b.type === 'boolean' && ['real', 'integer'].indexOf(a.type) >= 0));
    return a.present === b.present && (!a.present || (sameValue && (exact ? a.type === b.type :
        booleanTypes || a.type === b.type || ['real', 'integer'].indexOf(a.type) >= 0 && ['real', 'integer'].indexOf(b.type) >= 0)));
}
function sameInspection(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function printable(state) { return state.present ? state.type + ' ' + JSON.stringify(state.value) : 'no user override'; }
function allowedHost(setting, version) {
    // Explicit isolated CI simulation only; production host gates remain authoritative.
    if(Store&&Store.fixture&&PrefIO.env('MAC_TWEAK_TEST_GESTURES_OS')==='27'&&setting.component==='gestures')version='27.0.1';
    function parts(value) { return value.split('.').map(Number); }
    function compare(a, b) { var x = parts(a), y = parts(b); for (var i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; }
    if (!/^\d+\.\d+(\.\d+)?$/.test(version) || compare(version, setting.minOS) < 0 || compare(version, setting.maxOS) >= 0) throw new Error('Unsupported macOS for preference ' + setting.id + '; supported >= ' + setting.minOS + ', < ' + setting.maxOS + '.');
}
function plan(selected, request, host) {
    var desired = PrefModel.desired(Settings, selected, request), observations = [], actions = [];
    desired.forEach(function (row) {
        if (row.choice.mode === 'keep') {
            if (/^(gestures|closing|windowskeys)-login$/.test(row.id)) observations.push({ id: row.id, before: inspection(settingFor(row.id)) });
            return;
        }
        var setting = settingFor(row.id); allowedHost(setting, host);
        var before = inspection(setting), target = stateFor(row.choice, setting);
        observations.push({ id: setting.id, before: before });
        if (row.choice.mode === 'set' && (before.forced || before.host.present) && !equal(before.effective, target, false)) throw new Error('Managed policy or host-specific override conflicts with ' + setting.label + '. Resolve it in System Settings or through your administrator.');
        if (equal(before.stored, target, false)) return;
        if (before.forced) throw new Error('Managed policy prevents changing ' + setting.label + '. Resolve it through your administrator.');
        if (before.host.present) throw new Error('Host-specific override conflicts with ' + setting.label + '. Resolve it in System Settings.');
        actions.push({ id: setting.id, component: setting.component, before: before, target: target });
    });
    return { version: 1, selected: selected, desired: desired, observations: observations, actions: actions, recovery: false };
}
function validatePlan(value, historicalSubset) {
    PrefModel.keys(value, ['version', 'selected', 'desired', 'observations', 'actions', 'recovery']);
    if (value.version !== 1 || typeof value.recovery !== 'boolean' || !Array.isArray(value.actions) || !Array.isArray(value.observations) || value.actions.length > Settings.length || value.observations.length > Settings.length) throw new Error('Invalid retained preference plan.');
    if (!value.recovery) {
        var request = { version: 1, values: value.desired.map(function (row) { var result = { id: row.id, mode: row.choice.mode }; if (row.choice.mode === 'set') result.value = row.choice.value; return result; }) };
        var canonical=PrefModel.desired(Settings,value.selected,request);
        if(historicalSubset){var recorded=value.desired.map(function(row){return row.id;});canonical=canonical.filter(function(row){return recorded.indexOf(row.id)>=0;});}
        if (JSON.stringify(canonical) !== JSON.stringify(value.desired)) throw new Error('Invalid desired preference snapshot.');
    } else if (!Array.isArray(value.selected) || value.selected.some(function (id) { return PrefModel.groups.indexOf(id) < 0; })) throw new Error('Invalid recovery groups.');
    var seen = {};
    value.observations.forEach(function (row) {
        PrefModel.keys(row, ['id', 'before']);
        var setting = settingFor(row.id);
        if (seen[row.id] || value.selected.indexOf(setting.component) < 0) throw new Error('Invalid observation identity.');
        seen[row.id] = row;
        PrefModel.keys(row.before, ['stored', 'host', 'forced', 'effective']);
        ['stored', 'host', 'effective'].forEach(function (key) { validState(row.before[key], setting); });
        if (typeof row.before.forced !== 'boolean') throw new Error('Invalid retained policy.');
    });
    var used = {};
    value.actions.forEach(function (row) {
        PrefModel.keys(row, ['id', 'component', 'before', 'target']);
        var setting = settingFor(row.id);
        if (used[row.id] || setting.component !== row.component || !seen[row.id] || !sameInspection(seen[row.id].before, row.before) || row.before.forced || row.before.host.present) throw new Error('Invalid retained preference action.');
        used[row.id] = true; validState(row.target, setting);
        if (!value.recovery) {
            var choice = value.desired.filter(function (item) { return item.id === row.id; })[0].choice;
            if (choice.mode === 'keep' || !equal(row.target, stateFor(choice, setting), true)) throw new Error('Action differs from desired preference.');
        }
    });
    return value;
}
function checkPlan(value) {
    validatePlan(value);
    value.observations.forEach(function (row) {
        if (!sameInspection(inspection(settingFor(row.id)), row.before)) throw new Error('Preference changed after preview: ' + row.id + '; review a fresh plan.');
    });
}
function regularPath(path, directory) {
    var manager = $.NSFileManager.defaultManager, cursor = path, home = PrefIO.env('HOME');
    if (path.indexOf(home + '/') !== 0 || path.indexOf('/../') >= 0 || path.indexOf('/./') >= 0) throw new Error('Preference record outside HOME.');
    while (cursor !== home) {
        var attrs = manager.attributesOfItemAtPathError(cursor, Ref());
        if (!attrs || ObjC.unwrap(attrs.objectForKey($.NSFileType)) !== (cursor === path && !directory ? ObjC.unwrap($.NSFileTypeRegular) : ObjC.unwrap($.NSFileTypeDirectory))) throw new Error('Invalid preference record path: ' + cursor);
        cursor = cursor.slice(0, cursor.lastIndexOf('/'));
    }
}
function runPath(path) {
    var home = PrefIO.env('HOME'), prefix = home + '/.local/state/' + (['/.config/macos-setup','/.local/state/macos-setup','/.local/opt/macos-setup'].some(function(suffix){return PrefIO.exists(home+suffix);}) ? 'macos-setup' : 'mac-tweak') + '/runs/';
    if (path.indexOf(prefix) !== 0 || !/^\d{8}T\d{6}Z-\d+$/.test(path.slice(prefix.length))) throw new Error('Invalid preference run path.');
    regularPath(path, true); return path;
}
function snapshotPlan(value, path) {
    checkPlan(value); runPath(path);
    if (!value.actions.length) throw new Error('Cannot snapshot an empty preference action set.');
    var manager = $.NSFileManager.defaultManager, file = path + '/preferences.json';
    if (PrefIO.exists(file) || PrefIO.exists(path + '/preferences-results')) throw new Error('Preference snapshot already exists.');
    var originals = value.actions.map(function (row) { return { id: row.id, domain: settingFor(row.id).domain,
        key: settingFor(row.id).key, scope: settingFor(row.id).scope||'current-user-any-host', original: PrefIO.pack(row.before.stored) }; });
    if (!manager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(path + '/preferences-results', false, { NSFilePosixPermissions: 448 }, Ref())) throw new Error('Could not create preference result records.');
    PrefIO.write(file, { version: 1, plan: value, originals: originals });
    regularPath(file, false);
    var saved = loadSnapshot(path);
    if (JSON.stringify(saved.plan) !== JSON.stringify(value)) throw new Error('Preference snapshot readback failed.');
}
function loadSnapshot(path, historicalSubset) {
    runPath(path); regularPath(path + '/preferences.json', false);
    var value = JSON.parse(PrefIO.read(path + '/preferences.json'));
    PrefModel.keys(value, ['version', 'plan', 'originals']);
    validatePlan(value.plan,historicalSubset);
    if (value.version !== 1 || !Array.isArray(value.originals) || value.originals.length !== value.plan.actions.length) throw new Error('Invalid preference snapshot count.');
    value.originals.forEach(function (row, i) {
        PrefModel.keys(row, ['id', 'domain', 'key', 'scope', 'original']);
        var setting = settingFor(row.id);
        if (row.id !== value.plan.actions[i].id || row.domain !== setting.domain || row.key !== setting.key || row.scope !== (setting.scope||'current-user-any-host') || !equal(validState(PrefIO.unpack(row.original), setting), value.plan.actions[i].before.stored, true)) throw new Error('Invalid preference recovery identity.');
    });
    return value;
}
function applyPreference(value, index, path) {
    validatePlan(value);
    var snapshot = loadSnapshot(path);
    if (JSON.stringify(snapshot.plan) !== JSON.stringify(value) || !/^\d+$/.test(index) || !value.actions[Number(index)]) throw new Error('Preference action does not match preserved plan.');
    var row = value.actions[Number(index)], setting = settingFor(row.id), file = path + '/preferences-results/' + row.id + '.json';
    regularPath(path + '/preferences-results', true);
    if (PrefIO.exists(file)) throw new Error('Preference action already attempted.');
    if (!sameInspection(inspection(setting), row.before)) throw new Error('Preference changed after preview: ' + row.id + '; review a fresh plan.');
    PrefIO.write(file, { version: 1, id: row.id, status: 'attempted' });
    try {
        Store.change(setting, row.target);
        var after = inspection(setting);
        if (!equal(after.stored, row.target, false) || after.forced || after.host.present) throw new Error('Preference readback failed: ' + row.id);
        PrefIO.write(file, { version: 1, id: row.id, status: 'saved', post: after });
    } catch (error) {
        PrefIO.write(file, { version: 1, id: row.id, status: 'uncertain', error: String(error).slice(0, 500) });
        throw error;
    }
    return 'Saved preference ' + row.id;
}
function recoveryPlan(path, host) {
    var snapshot = loadSnapshot(path), actions = [], observations = [], selected = [];
    snapshot.plan.actions.forEach(function (row, i) {
        var setting = settingFor(row.id), file = path + '/preferences-results/' + row.id + '.json';
        if (!PrefIO.exists(file)) return;
        regularPath(file, false);
        var result = JSON.parse(PrefIO.read(file, 16384));
        if (result.version !== 1 || result.id !== row.id || result.status !== 'saved') throw new Error('Unknown preference outcome for ' + row.id + '; inspect records and resolve it manually.');
        PrefModel.keys(result, ['version', 'id', 'status', 'post']);
        allowedHost(setting, host);
        var current = inspection(setting);
        if (!sameInspection(current, result.post) || !equal(result.post.stored, row.target, false)) throw new Error('Later preference edit conflicts with recovery: ' + row.id + '.');
        if (current.forced || current.host.present) throw new Error('Managed policy or host-specific override prevents recovery: ' + row.id);
        if (selected.indexOf(setting.component) < 0) selected.push(setting.component);
        observations.push({ id: row.id, before: current });
        var target = validState(PrefIO.unpack(snapshot.originals[i].original), setting);
        if (!equal(current.stored, target, true)) actions.push({ id: row.id, component: setting.component, before: current, target: target });
    });
    return validatePlan({ version: 1, selected: selected, desired: [], observations: observations, actions: actions, recovery: true });
}
function nativeSmoke() {
    if (!Store.privateDomain || Store.fixture) throw new Error('Native smoke requires the private test-domain adapter.');
    var ids = ['dock-recent', 'dock-size', 'keyboard-repeat', 'screenshots-format', 'screensaver-idle'];
    ids.forEach(function (id) { if (inspection(settingFor(id)).stored.present) throw new Error('Private test domain is not empty.'); });
    var sentinel='MacTweakVisualSentinel',application=$(Store.privateDomain),hosts=[$.kCFPreferencesAnyHost,$.kCFPreferencesCurrentHost];
    var visual={provider:'com.apple.wallpaper.choice.macintosh',options:{style:'dynamic',color:'darkGray'},files:['preserve'],enabled:true};
    function preserved(){hosts.forEach(function(host){var value=ObjC.castRefToObject($.CFPreferencesCopyValue($(sentinel),application,$.kCFPreferencesCurrentUser,host));if(!value||!value.isEqual($(visual)))throw new Error('Unrelated visual state was changed.');});}
    hosts.forEach(function(host){$.CFPreferencesSetValue($(sentinel),ObjC.castObjectToRef($(visual)),application,$.kCFPreferencesCurrentUser,host);if(!$.CFPreferencesSynchronize(application,$.kCFPreferencesCurrentUser,host))throw new Error('Cannot prepare private visual sentinel.');});
    try {
        [{id:'forbidden-wallpaper',domain:'com.apple.wallpaper.agent',key:'Configuration'}, {id:'screensaver-idle',domain:'com.apple.screensaver',key:'moduleDict',scope:'current-user-current-host'}].forEach(function(setting){var refused=false;try{Store.change(setting,{present:true,type:'string',value:'blocked'});}catch(error){refused=String(error).indexOf('visuals and wallpaper')>=0;}if(!refused)throw new Error('Visual mutation boundary was bypassed.');});
        var values = [
            { present: true, type: 'boolean', value: false },
            { present: true, type: 'real', value: 0 },
            { present: true, type: 'integer', value: 2 },
            { present: true, type: 'string', value: 'png' },
            { present: true, type: 'integer', value: 300 }
        ];
        ids.forEach(function (id, i) {
            var setting = settingFor(id); Store.change(setting, values[i]);
            var stored = inspection(setting).stored;
            if(setting.scope==='current-user-current-host'){var anyHost=JSON.parse(JSON.stringify(setting));delete anyHost.scope;if(Store.inspect(anyHost).stored.present)throw new Error('Host-scoped write leaked into any-host preferences.');}
            if (!equal(stored, values[i], true) || !equal(PrefIO.unpack(PrefIO.pack(stored)), stored, true)) throw new Error('Native preference round trip failed: ' + id + ' (' + JSON.stringify(stored) + ')');
            Store.change(setting, { present: false });
            if (inspection(setting).stored.present) throw new Error('Native preference delete failed.');
            Store.change(setting, PrefIO.unpack(PrefIO.pack(stored)));
            if (!equal(inspection(setting).stored, stored, true)) throw new Error('Native preference restoration failed.');
            preserved();
        });
    } finally { ids.forEach(function (id) { Store.change(settingFor(id), { present: false }); });hosts.forEach(function(host){$.CFPreferencesSetValue($(sentinel),null,application,$.kCFPreferencesCurrentUser,host);$.CFPreferencesSynchronize(application,$.kCFPreferencesCurrentUser,host);}); }
    return 'PASS: private-domain native false/zero/integer/string, typed snapshots, set/delete, synchronization, restoration, protected visual writes and unrelated nested state preservation';
}
function emitPlan(value) {
    var lines = [];
    lines.push('__PREFERENCES_PLAN__|' + value.actions.length + '|' + PrefIO.encode(value));
    value.actions.forEach(function (row) {
        lines.push('__PREFERENCES_ACTION__|' + row.component + '|' + row.id);
        lines.push('PREFERENCE_CHANGE [' + row.component + '] ' + settingFor(row.id).label + ': ' + printable(row.before.stored) + ' -> ' + printable(row.target));
    });
    value.selected.forEach(function (id) {
        lines.push('__PREFERENCES_COMPONENT__|' + id);
        if (!value.actions.some(function (row) { return row.component === id; })) lines.push('SATISFIED [' + id + '] requested preference values match, or Keep current');
        if (value.recovery || value.desired.some(function (row) { return settingFor(row.id).component === id && row.choice.mode !== 'keep'; })) lines.push('REFRESH [' + id + '] Saved values may need a normal relaunch or sign-out to become visible.');
    });    return lines.join('\n');
}

function run(argv) {
    var root = argv[0], operation = argv[1];
    function source(path) { return ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, Ref())); }
    PrefModel = (0, eval)(source(root + '/preferences/model.js'));
    PrefIO = (0, eval)(source(root + '/preferences/store.js'));
    Settings = PrefModel.catalog(JSON.parse(PrefIO.read(root + '/catalog/preferences.json')));
    if (operation === 'validate') return 'PASS: validated ' + Settings.length + ' preference identities';
    if (operation === 'info') {
        if (PrefModel.groups.indexOf(argv[2]) < 0) throw new Error('Unknown preference component.');
        return Settings.filter(function (row) { return row.component === argv[2]; }).map(function (row) {
            return row.label + ': ' + PrefModel.describe(row.choice);
        }).join('\n') + '\nModes: Keep current, Use macOS default, or an explicit value.\nSupported: macOS 13 through 27; saved preferences may need relaunch or sign-out.';
    }
    Store = PrefIO.make();
    if (Store.privateDomain && operation !== 'native-smoke') throw new Error('Private native tests can only run the bounded smoke operation.');
    if (operation === 'inspect-group') {
        if (PrefModel.groups.indexOf(argv[2]) < 0) throw new Error('Unknown preference component.');
        return JSON.stringify(Settings.filter(function (row) { return row.component === argv[2]; }).map(function (row) { return { id: row.id, state: inspection(row) }; }));
    }
    if(operation==='cleanup-check'){
        // Cleanup reads historical known-key subsets; it never writes or reuses
        // their plans for Apply. Catalog growth must not strand old originals.
        var saved=loadSnapshot(argv[2],true);
        saved.plan.actions.forEach(function(row){var outcome=JSON.parse(PrefIO.read(argv[2]+'/preferences-results/'+row.id+'.json'));PrefModel.keys(outcome,['version','id','status','post']);if(outcome.version!==1||outcome.status!=='saved'||outcome.id!==row.id)throw new Error('Incomplete preference result.');PrefModel.keys(outcome.post,['stored','host','forced','effective']);['stored','host','effective'].forEach(function(key){validState(outcome.post[key],settingFor(row.id));});if(typeof outcome.post.forced!=='boolean'||!equal(outcome.post.stored,row.target,false))throw new Error('Invalid saved preference result.');});
        return JSON.stringify(saved.plan.actions.map(function(row){return {id:row.id,state:inspection(settingFor(row.id))};}));
    }
    if (operation === 'inspect') return JSON.stringify(Settings.map(function (row) { return { id: row.id, state: inspection(row) }; }));
    if (operation === 'plan') {
        var selected = argv[2] ? argv[2].split(',') : [];
        var request = argv[3] && argv[3] !== '-' ? JSON.parse(PrefIO.read(argv[3])) : null;
        return emitPlan(plan(selected, request, argv[4]));
    }
    if (operation === 'helper-login') {
        var retained = validatePlan(PrefIO.decode(argv[2]));
        var row = retained.desired.filter(function (row) { return row.id === argv[3] + '-login'; })[0];
        if (!row) throw new Error('Missing selected helper login choice.');
        if (row.choice.mode === 'set') return String(row.choice.value);
        var current = inspection(settingFor(row.id)).effective;
        return String(row.choice.mode === 'keep' && current.present ? current.value : true);
    }
    if (operation === 'check') { checkPlan(PrefIO.decode(argv[2])); return 'PASS: preference observations match'; }
    if (operation === 'snapshot') { snapshotPlan(PrefIO.decode(argv[2]), argv[3]); return 'PASS: typed preference originals preserved'; }
    if (operation === 'apply') return applyPreference(PrefIO.decode(argv[2]), argv[3], argv[4]);
    if (operation === 'recover-plan') return emitPlan(recoveryPlan(argv[2], argv[3]));
    if (operation === 'native-smoke') return nativeSmoke();
    throw new Error('Unknown preference bridge operation.');
}
