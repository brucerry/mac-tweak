/* Installation lifecycle and controller wiring; never starts Apple's installer. */
ObjC.import('Cocoa');
function run(argv) {
    var root = argv[0], count = 0;
    function text(path) { return ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, Ref())); }
    var P = (0, eval)(text(root + '/src/gui/prerequisites.js'));
    function check(value, message) { count++; if (!value) throw new Error(message); }
    var output = 'PREREQUISITE [command-line-tools] tig\nPREREQUISITE [command-line-tools] closing\nPREREQUISITE [command-line-tools] tig';
    var requirement = P.plan(output, ['tig', 'closing']);
    check(requirement.components.join(',') === 'tig,closing', 'Coalesce shared prerequisites.');
    check(P.plan(output, ['tig']).components.join(',') === 'tig', 'Only selected components can request installation.');
    check(!P.plan('PREREQUISITE [unknown] tig\nPREREQUISITE [command-line-tools] node\nBLOCKED: arbitrary text', ['tig', 'node']), 'Never turn arbitrary output into a command.');
    function fixture() {
        return { calls: [], result: null, request: function () { this.calls.push('request'); return {}; },
            check: function (components) { this.calls.push('check:' + components.join(',')); return {}; },
            poll: function () { var result = this.result; this.result = null; return result; },
            dispose: function () { this.calls.push('dispose'); } };
    }
    var a = fixture(), s = new P.Session(requirement, 'selection');
    check(!s.approve(false, 'selection', 0, a) && !a.calls.length, 'Later must have no installation side effects.');
    s = new P.Session(requirement, 'selection');
    check(!s.approve(true, 'changed', 0, a) && !a.calls.length, 'Stale consent must not start installation.');
    s = new P.Session(requirement, 'selection');
    check(s.approve(true, 'selection', 0, a) && a.calls.join(',') === 'request', 'Only explicit matching consent starts installation.');
    check(!s.approve(true, 'selection', 0, a) && a.calls.length === 1, 'An approval cannot be replayed.');
    s.tick('selection', 1, a);check(s.phase === 'requesting', 'An uncompleted request must stay busy.');
    a.result = { code: 0, output: 'install requested' };s.tick('selection', 2, a);
    check(s.phase === 'checking' && a.calls.indexOf('check:tig,closing') >= 0, 'Request success is followed by an independent readiness check.');
    a.result = { code: 1, output: 'missing' };s.tick('selection', 3, a);
    check(s.phase === 'waiting', 'Opening the installer must never count as successful installation.');
    var calls = a.calls.length;s.tick('selection', 100, a);check(a.calls.length === calls, 'Poll with a bounded interval.');
    s.tick('selection', 3004, a);a.result = { code: 0, output: '' };s.tick('selection', 3005, a);
    check(s.phase === 'ready' && !s.worker, 'Only working tools permit fresh review.');
    a = fixture();s = new P.Session(requirement, 'selection');s.approve(true, 'selection', 0, a);
    s.tick('changed', 1, a);check(s.phase === 'cancelled' && a.calls.join(',') === 'request,dispose', 'Changing selection stops the watcher without approving tweaks.');
    a = fixture();s = new P.Session(requirement, 'selection');s.approve(true, 'selection', 0, a);
    a.result = { code: 1, output: 'installer unavailable' };s.tick('selection', 1, a);
    a.result = { code: 1, output: 'still missing' };s.tick('selection', 2, a);
    check(s.phase === 'failed' && s.message === 'installer unavailable', 'A failed request must be actionable, never silently wait forever.');
    a = fixture();s = new P.Session(requirement, 'selection');s.approve(true, 'selection', 0, a);
    a.result = { code: 1, output: 'already installed' };s.tick('selection', 1, a);
    a.result = { code: 0, output: '' };s.tick('selection', 2, a);
    check(s.phase === 'ready', 'An installation completed concurrently must pass the actual check.');
    a = fixture();s = new P.Session(requirement, 'selection');s.approve(true, 'selection', 0, a);
    s.tick('selection', 15000, a);check(s.phase === 'failed' && !s.worker && a.calls.indexOf('dispose') >= 0, 'A stuck request is bounded.');
    a = fixture();s = new P.Session(requirement, 'selection');s.approve(true, 'selection', 0, a);
    a.result = { code: 0, output: '' };s.tick('selection', 1, a);s.tick('selection', 15001, a);
    check(s.phase === 'failed', 'A stuck probe is bounded.');
    a = fixture();s = new P.Session(requirement, 'selection');s.approve(true, 'selection', 0, a);
    s.tick('selection', 3600000, a);check(s.phase === 'failed', 'The installation watch has a final deadline.');
    a = fixture();a.request = function () { throw new Error('launch failed'); };
    s = new P.Session(requirement, 'selection');check(!s.approve(true, 'selection', 0, a) && s.phase === 'failed', 'Launch exceptions remain failures.');
    a = fixture();s = new P.Session(requirement, 'selection');s.approve(true, 'selection', 0, a);
    a.poll = function () { throw new Error('probe failed'); };s.tick('selection', 1, a);
    check(s.phase === 'failed' && !s.worker, 'Probe exceptions clean up the worker.');

    var fm = $.NSFileManager.defaultManager, transport = ObjC.unwrap($.NSTemporaryDirectory()) + 'mac-tweak-prerequisite-test-' + ObjC.unwrap($.NSUUID.UUID.UUIDString);
    var attrs = $.NSMutableDictionary.alloc.init;attrs.setObjectForKey($(448), $.NSFilePosixPermissions);
    check(fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(transport, false, attrs, Ref()), 'Create private worker transport.');
    var native = P.nativeAdapter(root, transport), worker = null;
    try {
        var blocked = false;try { native.request(); } catch (error) { blocked = String(error).indexOf('disabled in GUI tests') >= 0; }
        check(blocked, 'All GUI tests must prohibit the real installer, even when accidentally approved.');
        worker = native.check(['--install']);
        var deadline = Date.now() + 5000, result = null;
        while (!result && Date.now() < deadline) { result = native.poll(worker);$.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.02)); }
        check(result && result.code === 2, 'The real asynchronous worker rejects invalid check arguments without invoking tools.');
        var directory = worker.directory;native.dispose(worker);worker = null;
        check(!fm.fileExistsAtPath(directory), 'Completed native worker transport is removed.');
    } finally { if (worker) native.dispose(worker);fm.removeItemAtPathError(transport, Ref()); }

    // Actual dialogs/controller, with only presentation, workers and rendering replaced.
    (0, eval)(text(root + '/src/gui/main.js'));
    run([root, '--self-test']);
    var currentKey = 'selection', selection = ['tig', 'closing'], decision = 1001, reviews = [], statuses = [];
    controls = function () {};renderOutput = function () {};status = function (message) { statuses.push(message); };
    startJob = function (kind) { reviews.push(kind); };
    runAlert = function (alert) {
        check(ObjC.unwrap(alert.messageText) === 'Install required tools?', 'Present the actual installation consent.');
        check(Number(alert.buttons.count) === 2 && ObjC.unwrap(alert.buttons.objectAtIndex(0).title) === 'Install', 'Install and Later must both be available.');
        check(ObjC.unwrap(alert.informativeText).indexOf('Apple') >= 0, 'Identify the installer and system approvals.');
        return decision;
    };
    a = fixture();Prerequisites.nativeAdapter = function () { return a; };
    function ui() {
        var job = { key: currentKey, finished: true, ready: false };
        UI = { root: root, transport: '', job: job, output: output,
            model: { ids: function () { return selection; }, reviewKey: function () { return currentKey; } } };
        return job;
    }
    var job = ui();maybeRecommend(job, { level: 'warning' });
    check(!a.calls.length && !reviews.length && job.offerHandled && !UI.prerequisite, 'Later cannot enter ordinary repair or start an installer.');
    decision = 1000;job = ui();maybeRecommend(job, { level: 'warning' });
    check(UI.prerequisite && a.calls.join(',') === 'request', 'Blocked Review routes through installation approval.');
    a.result = { code: 0, output: '' };pollPrerequisite();a.result = { code: 0, output: '' };pollPrerequisite();
    check(reviews.join(',') === 'review' && !UI.prerequisite, 'Installation resumes a fresh review, never applies an old plan.');
    reviews = [];a = fixture();job = ui();offerPrerequisite(job);stopPrerequisite();
    check(!UI.prerequisite && !reviews.length && a.calls.join(',') === 'request,dispose', 'Stop waiting releases progress and retains the selection.');
    job = ui();runAlert = function () { currentKey = 'changed'; return 1000; };a = fixture();offerPrerequisite(job);
    check(!a.calls.length && !UI.prerequisite, 'Selection changed during consent must invalidate the offer.');
    check(ObjC.unwrap(Dialogs.recommendation(['Install Node.js & npm 24.22.1.'], true).messageText).indexOf('Install') === 0, 'Tool approvals say that missing software will be installed.');
    return 'PASS: ' + count + ' prerequisite consent, cancellation, success/failure, deadlines, stale selection, actual dialogs and controller handoff checks; no installer or visual service started';
}
