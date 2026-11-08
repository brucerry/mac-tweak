/* Consent, bounded asynchronous installation watching, and fresh-review handoff. */
(function () {
    var supported = ['tig', 'gestures', 'closing', 'windowskeys'];
    function plan(output, selected) {
        var components = [];
        String(output).split('\n').forEach(function (line) {
            var match = line.match(/^PREREQUISITE \[command-line-tools\] (tig|gestures|closing|windowskeys)$/);
            if (match && selected.indexOf(match[1]) >= 0 && components.indexOf(match[1]) < 0) components.push(match[1]);
        });
        return components.length ? { id: 'command-line-tools', components: components } : null;
    }
    function Session(requirement, key) {
        if (!requirement || requirement.id !== 'command-line-tools' || !requirement.components.length ||
            requirement.components.some(function (id) { return supported.indexOf(id) < 0; })) throw new Error('Unsupported prerequisite.');
        this.components = requirement.components.slice(); this.key = key; this.phase = 'offered';
        this.worker = null; this.message = ''; this.nextCheck = 0;
    }
    Session.prototype.approve = function (accepted, key, now, adapter) {
        if (this.phase !== 'offered') return false;
        if (accepted !== true || key !== this.key) { this.phase = 'cancelled'; return false; }
        this.deadline = now + 60 * 60 * 1000;
        try { this.worker = adapter.request(); this.workerDeadline = now + 15000; this.phase = 'requesting'; }
        catch (error) { this.phase = 'failed'; this.message = String(error); }
        return this.phase === 'requesting';
    };
    Session.prototype.cancel = function (adapter) {
        if (this.worker) adapter.dispose(this.worker);
        this.worker = null; this.phase = 'cancelled';
    };
    Session.prototype.tick = function (key, now, adapter) {
        if (['requesting', 'waiting', 'checking'].indexOf(this.phase) < 0) return;
        if (key !== this.key) { this.cancel(adapter); return; }
        if (now >= this.deadline || this.worker && now >= this.workerDeadline) {
            if (this.worker) adapter.dispose(this.worker);
            this.worker = null; this.phase = 'failed';
            this.message = 'The installation check timed out. Try Review again when Apple’s installer finishes.'; return;
        }
        try {
            if (this.worker) {
                var result = adapter.poll(this.worker);
                if (!result) return;
                adapter.dispose(this.worker); this.worker = null;
                if (this.phase === 'requesting') {
                    this.requestError = result.code ? result.output || 'Apple’s installer could not start.' : '';
                    this.phase = 'waiting';
                } else if (result.code === 0) { this.phase = 'ready'; return; }
                else if (this.requestError || result.code !== 1) {
                    this.phase = 'failed'; this.message = this.requestError || result.output || 'Could not check the installed tools.'; return;
                } else { this.phase = 'waiting'; this.nextCheck = now + 3000; }
            }
            if (this.phase === 'waiting' && now >= this.nextCheck) {
                this.worker = adapter.check(this.components); this.workerDeadline = now + 15000; this.phase = 'checking';
            }
        } catch (error) {
            if (this.worker) adapter.dispose(this.worker);
            this.worker = null; this.phase = 'failed'; this.message = String(error);
        }
    };
    function nativeAdapter(root, transport) {
        var fm = $.NSFileManager.defaultManager;
        function spawn(executable, args) {
            var directory = transport + '/' + ObjC.unwrap($.NSUUID.UUID.UUIDString), attrs = $.NSMutableDictionary.alloc.init;
            attrs.setObjectForKey($(448), $.NSFilePosixPermissions);
            if (!fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(directory, false, attrs, Ref())) throw new Error('Cannot prepare the installation check.');
            var output = directory + '/output.txt', handle = null, task = $.NSTask.alloc.init;
            try {
                attrs.setObjectForKey($(384), $.NSFilePosixPermissions);
                if (!fm.createFileAtPathContentsAttributes(output, $.NSData.data, attrs)) throw new Error('Cannot prepare installer output.');
                handle = $.NSFileHandle.fileHandleForWritingAtPath(output);
                task.launchPath = executable; task.arguments = args; task.standardInput = $.NSFileHandle.fileHandleWithNullDevice;
                task.standardOutput = handle; task.standardError = handle; task.launch;
                return { task: task, directory: directory, output: output, handle: handle };
            } catch (error) { if (handle) handle.closeFile; fm.removeItemAtPathError(directory, Ref()); throw error; }
        }
        return {
            request: function () {
                if (ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('MAC_TWEAK_GUI_TEST')) === '1') throw new Error('Real prerequisite installation is disabled in GUI tests.');
                return spawn('/usr/bin/xcode-select', ['--install']);
            },
            check: function (components) { return spawn('/bin/bash', [root + '/src/prerequisites/check.sh'].concat(components)); },
            poll: function (worker) {
                if (worker.task.running) return null;
                return { code: Number(worker.task.terminationStatus), output: ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(worker.output, $.NSUTF8StringEncoding, Ref())) || '' };
            },
            dispose: function (worker) {
                // Only our short request/probe is stopped; Apple's installer is independent.
                try { if (worker.task.running) worker.task.terminate; } catch (_) {}
                try { worker.handle.closeFile; } catch (_) {}
                fm.removeItemAtPathError(worker.directory, Ref());
            }
        };
    }
    return { plan: plan, Session: Session, nativeAdapter: nativeAdapter };
}())
