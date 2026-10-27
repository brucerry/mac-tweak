/* Separate read-only discovery and retained, explicitly approved Trash sessions. */
ObjC.import('Foundation'); ObjC.import('AppKit');
function run(argv) {
    var root = argv[0], operation = argv[1];
    function source(path) { return ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, Ref())); }
    var io = (0,eval)(source(root + '/maintenance/io.js')), resources = (0,eval)(source(root + '/maintenance/resources.js'));
    var model = (0,eval)(source(root + '/maintenance/model.js')), nativeFiles=(0,eval)(source(root+'/maintenance/native-files.js')),context = io.make();context.source=root;
    if(operation==='lock-status')return JSON.stringify(model.lockState(io,context));
    if(operation==='release-lock'||operation==='recover-session'){
        if(!context.fixture&&!context.native)throw new Error('Lock recovery requires the logged-in HOME.');
        var stale=model.lockState(io,context);
        if(operation==='recover-session'){
            if(!/^[A-Fa-f0-9-]{36}$/.test(argv[2]||'')||!/^\d+$/.test(argv[3]||''))throw new Error('Invalid maintenance session.');
            var receiptFile=context.state+'/maintenance/'+argv[2]+'/receipt.json';
            if(!io.safeAncestors(receiptFile,context.home,false)||!io.attributes(receiptFile))return JSON.stringify({state:'not-owned'});
            var owned=io.json(receiptFile);
            if(owned.version!==1||owned.id!==argv[2]||!owned.owner||owned.owner.pid!==Number(argv[3])||stale.state!=='stale'||stale.pid!==owned.owner.pid)return JSON.stringify({state:'not-owned'});
            argv[2]=stale.token;
        }
        if(stale.state!=='stale'||!argv[2]||argv[2]!==stale.token)throw new Error('The lock or its owner changed. Inspect it again.');
        var destination=context.state+'/maintenance/abandoned-lock-'+ObjC.unwrap($.NSUUID.UUID.UUIDString);if(!io.safeAncestors(destination,context.home,false))throw new Error('Unsafe lock recovery path.');
        io.mkdir(context.state+'/maintenance');var fresh=model.lockState(io,context);if(fresh.state!=='stale'||fresh.token!==stale.token)throw new Error('The lock changed before recovery.');
        if(!$.NSFileManager.defaultManager.moveItemAtPathToPathError(stale.path,destination,Ref()))throw new Error('Cannot preserve the abandoned lock.');return JSON.stringify({state:'released',preserved:destination});
    }
    if (operation === 'resources') return JSON.stringify(resources.rows(root, argv[2], io, context));
    if (operation === 'view') return resources.view(root, argv[2], argv[3], io, context, argv[4]);
    if (operation === 'inventory') return JSON.stringify(model.inventory(argv[2], io, context, false).map(function(row){
        if(!row.blocked){try{row.bytes=io.size(row.path);}catch(_){row.bytes=null;row.sizeError='Size unavailable; review to check again.';}}
        return row;
    }));
    if (operation !== 'session') throw new Error('Unknown maintenance operation.');
    var mode = argv[2], requestPath = argv[3];
    if (!io.pathOK(requestPath) || requestPath.indexOf(context.temporary + '/') !== 0 || !io.safeAncestors(requestPath, context.temporary, false)) throw new Error('Review input must be a private temporary file.');
    var request = io.json(requestPath);
    if (!request || Object.keys(request).sort().join(',') !== 'ids,version' || request.version !== 1) throw new Error('Invalid selected maintenance input.');
    var items = model.freeze(model.selected(mode, request.ids, io, context, false), io);
    var implementationPaths=['io.js','model.js','resources.js','bridge.js','native-files.js'].map(function(name){return root+'/maintenance/'+name;});
    var token = ObjC.unwrap($.NSUUID.UUID.UUIDString), initialInputHash = io.sha(requestPath), implementation = implementationPaths.map(io.sha);
    function emit(value) { $.NSFileHandle.fileHandleWithStandardOutput.writeData($(JSON.stringify(value) + '\n').dataUsingEncoding($.NSUTF8StringEncoding)); }
    emit({ type:'ready', version:1, token:token, mode:mode, items:items.map(function (row) { return { id:row.id, path:row.path, title:row.title, reason:row.reason, bytes:row.bytes }; }) });
    var input = '', handle = $.NSFileHandle.fileHandleWithStandardInput;
    while (input.indexOf('\n') < 0 && input.length < 256) { var bytes = handle.availableData; if (!Number(bytes.length)) break; input += ObjC.unwrap($.NSString.alloc.initWithDataEncoding(bytes, $.NSUTF8StringEncoding)) || ''; }
    if (!input || input.trim() === 'cancel') { emit({ type:'result', status:'cancelled', items:[], message:'No items moved.' }); return ''; }
    if (input.trim() !== 'trash:' + token) throw new Error('Maintenance acceptance does not match the displayed review.');
    if (!context.fixture && !context.native) throw new Error('Native removal requires the logged-in HOME. Use an isolated fixture for tests.');
    if (io.sha(requestPath) !== initialInputHash || implementationPaths.some(function (path,i) { return io.sha(path) !== implementation[i]; })) throw new Error('Review inputs changed. Refresh and review again.');
    if (!io.safeAncestors(context.state + '/lock', context.home, false) || !io.safeAncestors(context.state + '/maintenance', context.home, false)) throw new Error('Unsafe setup state location.');
    var lock = context.state + '/lock', lockHeld = false, receiptPath = '', receipt = { version:1, id:token, mode:mode, owner:{pid:Number($.NSProcessInfo.processInfo.processIdentifier),start:model.pidStart(io,Number($.NSProcessInfo.processInfo.processIdentifier))},status:'pending', items:items.map(function (row) { return { id:row.id, path:row.path, title:row.title, bytes:row.bytes, status:'unattempted', trash:'' }; }) };
    function save() { if (!io.safeAncestors(receiptPath, context.home, false)) throw new Error('Receipt path changed.'); io.write(receiptPath, receipt); }
    try {
        io.mkdir(context.state);
        if (!$.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(lock, false, { NSFilePosixPermissions:448 }, Ref())) throw new Error('Another setup or maintenance operation holds the lock.');
        lockHeld = true; var lockIdentity = io.attributes(lock).inode;
        if (!$(String($.NSProcessInfo.processInfo.processIdentifier) + '\n').writeToFileAtomicallyEncodingError(lock + '/pid', true, $.NSUTF8StringEncoding, Ref())) throw new Error('Cannot record maintenance lock.');
        var current = model.selected(mode, items.map(function (row) { return row.id; }), io, context, true);
        items.forEach(function (row) { if (!current.some(function (fresh) { return fresh.id === row.id && fresh.path === row.path && JSON.stringify(fresh.state) === JSON.stringify(row.state) && JSON.stringify(fresh.requires) === JSON.stringify(row.requires); })) throw new Error('Item eligibility changed after review: ' + row.path); model.unchanged(row,io,context); });
        var receiptDir = context.state + '/maintenance/' + token;
        io.mkdir(receiptDir); receiptPath = receiptDir + '/receipt.json'; save();
        emit({ type:'receipt', path:receiptPath });
        var failed = false, done = {};
        items.forEach(function (row,index) {
            if (failed) return;
            try {
                var running = model.running(io, context);
                if (row.app && model.appRunning(row.app,running)) throw new Error('Application started after review. Quit it and review again.');
                var allowedRoot = row.path.indexOf(context.home + '/') === 0 ? context.home : row.path.indexOf(context.temporary + '/') === 0 ? context.temporary : context.applications;
                if (!io.safeAncestors(row.path, allowedRoot, false) || !$.NSFileManager.defaultManager.isDeletableFileAtPath(row.path)) throw new Error('Item path or permissions changed.');
                model.unchanged(row,io,context);
                if (row.kind === 'application' && row.references.some(function (path) { return !!io.attributes(path); })) throw new Error('A matching login file remains or reappeared. Review again before removing this helper.');
                receipt.items[index].status = 'attempting'; save();
                var destination;
                if (context.fixture&&!context.nativeTrash) {
                    var trash = context.home + '/.Trash';
                    if (!io.safeAncestors(trash, context.home, false)) throw new Error('Unsafe fixture Trash.');
                    io.mkdir(trash); destination = trash + '/' + token + '-' + index;
                    var failPath = context.fixture + '/fail-trash.json';
                    if (io.attributes(failPath) && io.json(failPath).indexOf(row.id) >= 0) throw new Error('Injected Trash failure.');
                    if (!$.NSFileManager.defaultManager.moveItemAtPathToPathError(row.path,destination,Ref())) throw new Error('Could not move item to fixture Trash.');
                } else {
                    destination = nativeFiles.trash(row.path);
                }
                var pausePath = context.fixture ? context.fixture + '/pause-after-move.json' : '';
                if (pausePath && io.attributes(pausePath) && io.json(pausePath).indexOf(row.id) >= 0) { emit({type:'paused',path:row.path,trash:destination}); while (io.attributes(pausePath)) $.NSThread.sleepForTimeInterval(0.01); }
                receipt.items[index].status = 'completed'; receipt.items[index].trash = destination; done[row.id] = true;
                emit({ type:'moved', item:receipt.items[index] }); save();
            } catch (error) {
                failed = true;
                if (receipt.items[index].status !== 'completed') receipt.items[index].status = error.uncertain?'unknown':'failed';
                receipt.items[index].error = String(error);
                try { save(); } catch (_) {}
                emit({ type:'failed', item:receipt.items[index] });
            }
        });
        receipt.status = failed ? 'partial-failure' : 'completed'; save();
        emit({ type:'result', status:receipt.status, items:receipt.items, receipt:receiptPath, message:failed ? 'Some items were not moved. Review the listed results; completed items are in Trash.' : mode==='cleanup'?'Accepted temporary files moved to Trash. Saved settings and recovery originals stay in place.':'Accepted old copies moved to Trash. Current settings stay in place.' });
    } catch (error) {
        emit({ type:'result', status:'failed', items:receipt.items, receipt:receiptPath, message:String(error) });
    } finally {
        if (lockHeld) {
            try { if (io.attributes(lock).inode === lockIdentity && io.read(lock + '/pid').trim() === String($.NSProcessInfo.processInfo.processIdentifier)) { $.NSFileManager.defaultManager.removeItemAtPathError(lock + '/pid',Ref()); io.capture('/bin/rmdir',[lock]); } } catch (_) {}
        }
    }
    return '';
}
