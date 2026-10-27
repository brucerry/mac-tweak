/* Preference I/O. Native tests must use a unique private domain or an injected file store. */
(function () {
    'use strict';
    function env(key) { return ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey(key)) || ''; }
    function read(path, maximum) {
        var error = Ref(), data = $.NSData.dataWithContentsOfFileOptionsError(path, 0, error);
        if (!data || Number(data.length) > (maximum || 131072)) throw new Error('Cannot read bounded preference data: ' + path);
        var value = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding);
        if (!value) throw new Error('Preference data must be UTF-8.');
        return ObjC.unwrap(value);
    }
    function write(path, value) {
        var data = $(JSON.stringify(value) + '\n').dataUsingEncoding($.NSUTF8StringEncoding);
        if (!data.writeToFileAtomically(path, true)) throw new Error('Could not preserve preference data: ' + path);
        if (!$.NSFileManager.defaultManager.setAttributesOfItemAtPathError({ NSFilePosixPermissions: 384 }, path, Ref())) throw new Error('Could not protect preference data.');
    }
    function exists(path) {
        var attributes = $.NSFileManager.defaultManager.attributesOfItemAtPathError(path, Ref());
        var value = attributes ? ObjC.deepUnwrap(attributes) : null;
        return value !== null && value !== undefined && typeof value.NSFileType === 'string';
    }
    function encode(value) { return ObjC.unwrap($(JSON.stringify(value)).dataUsingEncoding($.NSUTF8StringEncoding).base64EncodedStringWithOptions(0)); }
    function decode(value) {
        if (typeof value !== 'string' || value.length > 180000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('Invalid encoded preference plan.');
        var data = $.NSData.alloc.initWithBase64EncodedStringOptions(value, 0);
        var text = data && $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding);
        if (!text) throw new Error('Invalid preference plan encoding.');
        return JSON.parse(ObjC.unwrap(text));
    }
    function absent() { return { present: false }; }
    function visualMutationAllowed(setting) {
        var name=String(setting.domain||'').toLowerCase();
        if(name.indexOf('com.apple.wallpaper')===0)return false;
        if(name.indexOf('com.apple.screensaver')===0)return name==='com.apple.screensaver'&&setting.id==='screensaver-idle'&&setting.key==='idleTime'&&setting.scope==='current-user-current-host';
        return true;
    }
    function scalar(value) {
        var unwrapped = ObjC.deepUnwrap(value);
        if (unwrapped === undefined || unwrapped === null) return absent();
        var type = typeof unwrapped;
        if (type === 'number') {
            if (!isFinite(unwrapped) || Math.abs(unwrapped) > 9007199254740991) throw new Error('Unsupported numeric preference.');
            type = $.CFNumberIsFloatType(value) ? 'real' : 'integer';
        } else if (type !== 'boolean' && type !== 'string') throw new Error('Unsupported stored preference type.');
        if (type === 'string' && (unwrapped.length > 256 || /[\x00-\x1f]/.test(unwrapped))) throw new Error('Unsupported stored preference string.');
        return { present: true, type: type, value: unwrapped };
    }
    function nativeValue(application, key, host, effective) {
        var raw = effective ? $.CFPreferencesCopyAppValue($(key), application) :
            $.CFPreferencesCopyValue($(key), application, $.kCFPreferencesCurrentUser, host);
        return scalar(ObjC.castRefToObject(raw));
    }
    function nativeObject(state) {
        if (!state.present) return null;
        if (state.type === 'boolean') return $.NSNumber.numberWithBool(state.value);
        if (state.type === 'real') return $.NSNumber.numberWithDouble(state.value);
        if (state.type === 'integer') return $.NSNumber.numberWithLongLong(state.value);
        if (state.type === 'string') return $(state.value);
        throw new Error('Unsupported native preference type.');
    }
    function pack(state) {
        if (!state.present) return { state: state, plist: '' };
        var dictionary = $.NSMutableDictionary.alloc.init;
        dictionary.setObjectForKey(nativeObject(state), 'value');
        var data = $.NSPropertyListSerialization.dataWithPropertyListFormatOptionsError(dictionary, $.NSPropertyListBinaryFormat_v1_0, 0, Ref());
        if (!data) throw new Error('Could not serialize typed preference original.');
        return { state: state, plist: ObjC.unwrap(data.base64EncodedStringWithOptions(0)) };
    }
    function unpack(record) {
        if (!record || !record.state || typeof record.plist !== 'string' || record.plist.length > 4096) throw new Error('Invalid preference original.');
        if (!record.state.present) {
            if (JSON.stringify(record.state) !== '{"present":false}' || record.plist !== '') throw new Error('Invalid absent preference original.');
            return record.state;
        }
        var data = $.NSData.alloc.initWithBase64EncodedStringOptions(record.plist, 0);
        var dictionary = data && $.NSPropertyListSerialization.propertyListWithDataOptionsFormatError(data, 0, Ref(), Ref());
        if (!dictionary || Number(dictionary.count) !== 1) throw new Error('Invalid typed preference original.');
        var restored = scalar(dictionary.objectForKey('value'));
        if (JSON.stringify(restored) !== JSON.stringify(record.state)) throw new Error('Typed original does not match its snapshot.');
        return restored;
    }
    function make() {
        var fixture = env('MAC_TWEAK_PREFERENCE_STORE'), testing = env('MAC_TWEAK_PREFERENCES_TEST') === '1';
        var privateDomain = env('MAC_TWEAK_PREFERENCES_NATIVE_DOMAIN');
        var actualHome = ObjC.unwrap($.NSHomeDirectoryForUser($.NSUserName()));
        if (testing && !fixture) throw new Error('Preference tests require an injected store. HOME alone does not isolate preferences.');
        if (fixture) {
            var resolved = ObjC.unwrap($(fixture).stringByStandardizingPath.stringByResolvingSymlinksInPath);
            var temporary = ObjC.unwrap($.NSTemporaryDirectory().stringByResolvingSymlinksInPath);
            if (!testing || (resolved.indexOf(temporary + '/') !== 0 && resolved.indexOf('/private/tmp/') !== 0) || env('HOME') === actualHome) throw new Error('Injected preferences require test mode, a temporary store, and a disposable HOME.');
        }
        if (privateDomain && (env('MAC_TWEAK_PREFERENCES_LIVE_TEST') !== '1' || !/^org\.macossetup\.test\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(privateDomain))) throw new Error('Native preference tests require a unique private UUID domain.');
        function load() {
            var value = JSON.parse(read(fixture, 262144));
            if (!value || value.version !== 1 || !value.values || typeof value.values !== 'object' || Array.isArray(value.values)) throw new Error('Invalid injected preference store.');
            return value;
        }
        function domain(setting) { return privateDomain || setting.domain; }
        function hostFor(setting){return setting.scope==='current-user-current-host'?$.kCFPreferencesCurrentHost:$.kCFPreferencesAnyHost;}
        function inspect(setting) {
            if (fixture) {
                var data = load();
                if ((data.errors || []).indexOf(setting.id) >= 0) throw new Error('Cannot inspect preference: ' + setting.id);
                var stored = data.values[setting.id] || absent(), hostScoped=setting.scope==='current-user-current-host', host = hostScoped?absent():(data.host || {})[setting.id] || absent();
                return { stored: stored, host: host, forced: (data.forced || []).indexOf(setting.id) >= 0,
                    effective: (data.effective || {})[setting.id] || (hostScoped?(stored.present?stored:(data.anyHost||{})[setting.id]||absent()):(host.present ? host : stored)) };
            }
            var name = domain(setting), application = name === 'NSGlobalDomain' ? $.kCFPreferencesAnyApplication : $(name);
            return { stored: nativeValue(application, setting.key, hostFor(setting), false),
                host: setting.scope==='current-user-current-host'?absent():nativeValue(application, setting.key, $.kCFPreferencesCurrentHost, false),
                forced: Boolean($.CFPreferencesAppValueIsForced($(setting.key), application)),
                effective: nativeValue(application, setting.key, null, true) };
        }
        function change(setting, target) {
            if(!visualMutationAllowed(setting))throw new Error('Screen-saver visuals and wallpaper must be changed through macOS settings.');
            if (fixture) {
                var data = load();
                if ((data.failWrite || []).indexOf(setting.id) >= 0) throw new Error('Injected preference write failure: ' + setting.id);
                if (target.present) data.values[setting.id] = target;
                else delete data.values[setting.id];
                data.writes = data.writes || []; data.writes.push({ id: setting.id, target: target });
                if ((data.failReadback || []).indexOf(setting.id) >= 0) delete data.values[setting.id];
                write(fixture, data);
                if (data.pauseAfter === setting.id) {
                    write(fixture + '.paused', { id: setting.id });
                    while (!$.NSFileManager.defaultManager.fileExistsAtPath(fixture + '.resume')) $.NSThread.sleepForTimeInterval(0.05);
                }
                if ((data.failSync || []).indexOf(setting.id) >= 0) throw new Error('Preference synchronization failed: ' + setting.id);
                return;
            }
            if (!privateDomain && env('HOME') !== actualHome) throw new Error('Native preference writes require the logged-in user HOME; use an injected store for tests.');
            var name = domain(setting), application = name === 'NSGlobalDomain' ? $.kCFPreferencesAnyApplication : $(name);
            if ($.CFPreferencesAppValueIsForced($(setting.key), application)) throw new Error('Managed policy prevents preference mutation.');
            var object = nativeObject(target);
            $.CFPreferencesSetValue($(setting.key), target.present ? ObjC.castObjectToRef(object) : null, application, $.kCFPreferencesCurrentUser, hostFor(setting));
            if (!$.CFPreferencesSynchronize(application, $.kCFPreferencesCurrentUser, hostFor(setting))) throw new Error('Preference synchronization failed: ' + setting.id);
        }
        return { inspect: inspect, fixture: fixture, load: load, domain: domain, actualHome: actualHome,
            privateDomain: privateDomain, testing: testing, change: change };
    }
    return { make: make, env: env, read: read, write: write, exists: exists, encode: encode, decode: decode, absent: absent, pack: pack, unpack: unpack, visualMutationAllowed:visualMutationAllowed };
}())
