/* Shared local I/O. No discovery operation writes files or runs their contents. */
(function () {
    ObjC.import('Foundation'); ObjC.import('AppKit');
    ObjC.bindFunction('getuid', ['unsigned int', []]);
    ObjC.bindFunction('CC_SHA256_Init', ['int', ['void *']]);
    ObjC.bindFunction('CC_SHA256_Update', ['int', ['void *', 'void *', 'unsigned int']]);
    ObjC.bindFunction('CC_SHA256_Final', ['int', ['void *', 'void *']]);
    function env(name) { return ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey(name)) || ''; }
    function canonical(path) { return capture('/bin/zsh', ['-f','-c','print -r -- ${1:A}','--',path]).replace(/\n$/, ''); }
    function pathOK(path) { return typeof path === 'string' && path[0] === '/' && !/[\x00-\x1f]/.test(path) && path.split('/').every(function (part, i) { return part !== '..' && part !== '.' && (part || i === 0); }); }
    function join(parent, name) { return parent.replace(/\/$/, '') + '/' + name; }
    function attributes(path) {
        var error = Ref(), raw = $.NSFileManager.defaultManager.attributesOfItemAtPathError(path, error);
        var value = raw ? ObjC.deepUnwrap(raw) : null;
        if (!value || !value.NSFileType) return null;
        function string(key) { return String(ObjC.unwrap(raw.objectForKey(key).description)); }
        return { type: value.NSFileType, size: Number(value.NSFileSize || 0), inode: string($.NSFileSystemFileNumber),
            mode: Number(value.NSFilePosixPermissions), uid: Number(value.NSFileOwnerAccountID),
            modified: Number(raw.objectForKey($.NSFileModificationDate).timeIntervalSince1970), immutable: !!value.NSFileImmutable };
    }
    function read(path, maximum) {
        var attrs = attributes(path);
        if (!attrs || attrs.type !== 'NSFileTypeRegular' || attrs.size > (maximum || 1048576)) throw new Error('Missing, unsafe or oversized text file: ' + path);
        var error = Ref(), bytes = $.NSData.dataWithContentsOfFileOptionsError(path, 0, error);
        if (!bytes) throw new Error('Cannot read file: ' + path);
        var string = $.NSString.alloc.initWithDataEncoding(bytes, $.NSUTF8StringEncoding);
        var value = string ? ObjC.unwrap(string) : null;
        if (typeof value !== 'string' || value.indexOf('\x00') >= 0) throw new Error('This is a binary file; use Reveal in Finder.');
        return value;
    }
    function json(path) { return JSON.parse(read(path)); }
    function list(path) {
        if (!attributes(path)) return [];
        var error = Ref(), rows = $.NSFileManager.defaultManager.contentsOfDirectoryAtPathError(path, error);
        var value = rows ? ObjC.deepUnwrap(rows) : null;
        if (!Array.isArray(value)) throw new Error('Cannot list directory: ' + path);
        return value.sort();
    }
    function sha(path) {
        var handle = $.NSFileHandle.fileHandleForReadingAtPath(path);
        if (!handle) throw new Error('Cannot fingerprint file: ' + path);
        var context = $.NSMutableData.dataWithLength(256), digest = $.NSMutableData.dataWithLength(32);
        if ($.CC_SHA256_Init(context.mutableBytes) !== 1) throw new Error('Cannot initialize file fingerprint.');
        try { while (true) { var bytes = handle.readDataOfLength(1048576); if (Number(bytes.length) === 0) break;
            if ($.CC_SHA256_Update(context.mutableBytes, bytes.bytes, Number(bytes.length)) !== 1) throw new Error('Cannot fingerprint file.');
        } } finally { handle.closeFile; }
        if ($.CC_SHA256_Final(digest.mutableBytes, context.mutableBytes) !== 1) throw new Error('Cannot finish file fingerprint.');
        return ObjC.unwrap(digest.base64EncodedStringWithOptions(0));
    }
    function shaText(value) {
        var bytes = $(value).dataUsingEncoding($.NSUTF8StringEncoding), context = $.NSMutableData.dataWithLength(256), digest = $.NSMutableData.dataWithLength(32);
        $.CC_SHA256_Init(context.mutableBytes); $.CC_SHA256_Update(context.mutableBytes, bytes.bytes, Number(bytes.length)); $.CC_SHA256_Final(digest.mutableBytes, context.mutableBytes);
        return ObjC.unwrap(digest.base64EncodedStringWithOptions(0));
    }
    function hex(base64) {
        var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', value = 0, bits = 0, result = '';
        base64.replace(/=+$/, '').split('').forEach(function (character) { value = (value << 6) | alphabet.indexOf(character); bits += 6;
            if (bits >= 8) { bits -= 8; var byte = (value >> bits) & 255; result += ('0' + byte.toString(16)).slice(-2); }
        }); return result;
    }
    function tree(path) {
        var entries = [], total = 0;
        function walk(current, relative) {
            if (entries.length >= 100000) throw new Error('Too many files to review safely: ' + path);
            var before = attributes(current); if (!before) throw new Error('Item disappeared: ' + current);
            var entry = { path: relative, state: before };
            if (before.type === 'NSFileTypeRegular') { entry.hash = sha(current); total += before.size; }
            else if (before.type === 'NSFileTypeSymbolicLink') entry.link = ObjC.unwrap($.NSFileManager.defaultManager.destinationOfSymbolicLinkAtPathError(current, Ref()));
            else if (before.type !== 'NSFileTypeDirectory') throw new Error('Unsupported filesystem item: ' + current);
            entries.push(entry);
            if (before.type === 'NSFileTypeDirectory') list(current).forEach(function (name) { walk(join(current, name), relative ? relative + '/' + name : name); });
            if (JSON.stringify(attributes(current)) !== JSON.stringify(before)) throw new Error('Item changed during inspection: ' + current);
        }
        walk(path, ''); return { entries: entries, bytes: total };
    }
    function size(path) {
        var total=0,count=0;
        function walk(current){
            if(++count>100000)throw new Error('Too many files to measure safely.');
            var before=attributes(current);if(!before)throw new Error('Item disappeared during size discovery.');
            if(before.type==='NSFileTypeRegular')total+=before.size;
            else if(before.type==='NSFileTypeDirectory')list(current).forEach(function(name){walk(join(current,name));});
            else if(before.type!=='NSFileTypeSymbolicLink')throw new Error('Unsupported item during size discovery.');
            if(JSON.stringify(attributes(current))!==JSON.stringify(before))throw new Error('Item changed during size discovery.');
        }
        walk(path);return total;
    }
    function safeAncestors(path, root, allowLeafLink) {
        if (!pathOK(path) || path.indexOf(root + '/') !== 0) return false;
        var cursor = path;
        while (cursor !== root) {
            var attrs = attributes(cursor);
            if (attrs && (attrs.type === 'NSFileTypeSymbolicLink' && !(cursor === path && allowLeafLink) || cursor !== path && attrs.type !== 'NSFileTypeDirectory')) return false;
            cursor = cursor.slice(0, cursor.lastIndexOf('/'));
        }
        var base = attributes(root); return !!base && base.type === 'NSFileTypeDirectory';
    }
    function mkdir(path) {
        if (!$.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(path, true, { NSFilePosixPermissions: 448 }, Ref())) throw new Error('Cannot create private directory: ' + path);
    }
    function write(path, value) {
        var bytes = $(JSON.stringify(value) + '\n').dataUsingEncoding($.NSUTF8StringEncoding);
        if (!bytes.writeToFileAtomically(path, true)) throw new Error('Cannot save record: ' + path);
        if (!$.NSFileManager.defaultManager.setAttributesOfItemAtPathError({ NSFilePosixPermissions: 384 }, path, Ref())) throw new Error('Cannot protect record: ' + path);
    }
    function command(executable, args) {
        var task = $.NSTask.alloc.init, output = $.NSPipe.pipe; task.launchPath = executable; task.arguments = args;
        task.standardOutput = output; task.standardError = output; task.launch;
        var bytes = output.fileHandleForReading.readDataToEndOfFile; task.waitUntilExit;
        var value = ObjC.unwrap($.NSString.alloc.initWithDataEncoding(bytes, $.NSUTF8StringEncoding)) || '';
        return {status:Number(task.terminationStatus),text:value};
    }
    function capture(executable,args){var result=command(executable,args);if(result.status!==0)throw new Error(result.text.slice(0,1000));return result.text;}
    function make() {
        var home = env('HOME'), actualHome = ObjC.unwrap($.NSHomeDirectory()), fixture = env('MAC_TWEAK_MAINTENANCE_FIXTURE');
        if (!pathOK(home) || home === '/' || !attributes(home) || canonical(home) !== home) throw new Error('Unsafe destination HOME.');
        if (env('MAC_TWEAK_MAINTENANCE_TEST') === '1') {
            var temp = canonical(ObjC.unwrap($.NSTemporaryDirectory())).replace(/\/$/, '');
            if (!pathOK(fixture) || canonical(fixture) !== fixture || !(fixture.indexOf(temp + '/') === 0 || fixture.indexOf('/private/tmp/') === 0) || home.indexOf(fixture + '/') !== 0) throw new Error('Maintenance fixtures require an isolated temporary root and HOME.');
        } else if (fixture) throw new Error('Maintenance fixture needs explicit test mode.');
        if(env('MAC_TWEAK_NATIVE_TRASH_TEST')==='1'&&!fixture)throw new Error('Native Trash tests require a validated isolated fixture.');
        return { home: home, actualHome: actualHome, fixture: fixture,nativeTrash:!!fixture&&env('MAC_TWEAK_NATIVE_TRASH_TEST')==='1',
            storage: (['/.config/macos-setup','/.local/state/macos-setup','/.local/opt/macos-setup'].some(function(suffix){return !!attributes(home+suffix);}) ? 'macos-setup' : 'mac-tweak'),
            state: home + '/.local/state/' + (['/.config/macos-setup','/.local/state/macos-setup','/.local/opt/macos-setup'].some(function(suffix){return !!attributes(home+suffix);}) ? 'macos-setup' : 'mac-tweak'), applications: fixture ? fixture + '/Applications' : '/Applications',
            temporary: fixture ? fixture + '/temporary' : canonical(ObjC.unwrap($.NSTemporaryDirectory())).replace(/\/$/, ''),
            uid: Number($.getuid()),
            native: home === actualHome && !fixture };
    }
    return { env: env, canonical: canonical, pathOK: pathOK, join: join, attributes: attributes, read: read, json: json,
        list: list, sha: sha, shaText: shaText, hex: hex, tree: tree, size:size, safeAncestors: safeAncestors, mkdir: mkdir, write: write, capture: capture, command:command, make: make };
}())
