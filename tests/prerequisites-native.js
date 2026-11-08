/* Actual native controls with a fake installer; the desktop guard stays active. */
ObjC.import('Cocoa');
function run(argv) {
    var root = argv[0];
    var source = ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(root + '/src/gui/main.js', $.NSUTF8StringEncoding, Ref()));
    (0, eval)(source);
    interactionSmokeStart = function () {
        function check(value, message) { if (!value) throw new Error(message); }
        try {
            var decision = 1001, requests = 0, disposed = 0, result = null, review = null;
            Prerequisites.nativeAdapter = function () { return {
                request: function () { requests++; return {}; },check: function () { return {}; },
                poll: function () { var value = result;result = null;return value; },dispose: function () { disposed++; }
            }; };
            runAlert = function () { return decision; };
            UI.model.toggle('tig', true);selectionChanged();
            var key = UI.model.reviewKey();
            var job = { key: key, finished: true, ready: false, task: { running: false } };
            UI.job = job;UI.output = 'PREREQUISITE [command-line-tools] tig\nBLOCKED: tig: missing tools';
            offerPrerequisite(job);
            check(!requests && !UI.prerequisite && !UI.apply.enabled && UI.stopPrerequisite.hidden, 'Later keeps controls idle without installing.');
            decision = 1000;offerPrerequisite(job);
            check(requests === 1 && UI.prerequisite && !UI.apply.enabled && !UI.stopPrerequisite.hidden, 'Consent starts progress and exposes Stop waiting.');
            check(!UI.review.enabled && !UI.checkboxes[0].enabled, 'Short installer request disables conflicting actions.');
            result = { code: 0, output: '' };pollPrerequisite();result = { code: 1, output: 'missing' };pollPrerequisite();
            check(UI.prerequisite.session.phase === 'waiting' && UI.review.enabled && ObjC.unwrap(UI.review.title) === 'Check again' && UI.checkboxes[0].enabled, 'Waiting keeps the app responsive and allows rechecking.');
            check(Number(UI.status.frame.origin.x) + Number(UI.status.frame.size.width) < Number(UI.stopPrerequisite.frame.origin.x), 'Footer text must not overlap Stop waiting.');
            check(ObjC.unwrap(UI.stopPrerequisite.identifier).length > 0, 'Stop waiting has native hover tracking.');
            UI.stopPrerequisite.performClick(null);
            check(!UI.prerequisite && UI.stopPrerequisite.hidden && ObjC.unwrap(UI.review.title) === 'Review' && !UI.apply.enabled && UI.model.reviewKey() === key, 'The actual Stop waiting button ends progress and preserves selection.');
            offerPrerequisite(job);startJob = function (kind) { review = kind; };
            result = { code: 0, output: '' };pollPrerequisite();result = { code: 0, output: '' };pollPrerequisite();
            check(review === 'review' && !UI.prerequisite && requests === 2 && disposed === 4, 'Confirmed installation hands off to a fresh review only.');
            UI.job = null;
            console.log('PASS: native prerequisite approval, postponing, progress, responsive controls, hover, footer alignment, actual Stop waiting, and fresh review; fake installer only');
            $.NSApp.terminate(null);
        } catch (error) { console.log('FAIL: ' + String(error));UI.job = null;$.NSApp.terminate(null); }
    };
    return run([root, '--smoke-interaction']);
}
