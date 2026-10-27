/* Pure chooser state. This file is repository code, never catalog data. */
(function () {
    function parseCatalog(text) {
        var seen = {};
        return text.split('\n').filter(function (line) { return line && line[0] !== '#'; }).map(function (line) {
            var fields = line.split('|');
            if (fields.length !== 7 || !/^[a-z][a-z0-9-]*$/.test(fields[0]) || ['tool', 'shell', 'preference', 'profile', 'guided'].indexOf(fields[1]) < 0 || seen[fields[0]]) {
                throw new Error('The component catalog is invalid.');
            }
            seen[fields[0]] = true;
            return { id: fields[0], kind: fields[1], purpose: fields[3], changes: fields[4] };
        }).filter(function (part) { return part.id !== 'local-bin-path'; });
    }
    function Selection(parts, presets, order) {
        this.parts = parts;
        this.presets = presets;
        this.order = order || Object.keys(presets);
        this.chosen = {};
        this.preferenceValues = [];
        this.activeTab = 'custom';
        var ids = parts.map(function (part) { return part.id; });
        this.order.forEach(function (name) {
            if (name === 'custom' || !/^[a-z][a-z0-9-]*$/.test(name) || !presets[name].length ||
                presets[name].some(function (id) { return ids.indexOf(id) < 0; })) throw new Error('Invalid preset: ' + name);
        });
    }
    Selection.prototype.ids = function () {
        var chosen = this.chosen;
        return this.parts.filter(function (part) { return chosen[part.id]; }).map(function (part) { return part.id; });
    };
    Selection.prototype.key = function () { return this.ids().join(','); };
    Selection.prototype.preferenceRequest = function () {
        var selected = this.ids();
        return { version: 1, values: this.preferenceValues.filter(function (row) {
            return selected.indexOf(row.id.split('-')[0]) >= 0;
        }) };
    };
    Selection.prototype.setPreferenceValues = function (values) {
        var next = JSON.parse(JSON.stringify(values)).sort(function (a, b) { return a.id.localeCompare(b.id); });
        if (JSON.stringify(next) === JSON.stringify(this.preferenceValues)) return false;
        this.preferenceValues = next; return true;
    };
    Selection.prototype.reviewKey = function () {
        return this.parts.some(function (part) { return part.kind === 'preference' && this.chosen[part.id]; }, this) ?
            this.key() + '|' + JSON.stringify(this.preferenceRequest()) : this.key();
    };
    Selection.prototype.allowed = function (id) {
        return this.activeTab === 'custom' || this.presets[this.activeTab].indexOf(id) >= 0;
    };
    Selection.prototype.toggle = function (id, value) {
        if (!this.parts.some(function (part) { return part.id === id; })) throw new Error('Unknown component: ' + id);
        if (!this.allowed(id) || (this.activeTab === 'full' && !value)) this.activeTab = 'custom';
        this.chosen[id] = value;
        return true;
    };
    Selection.prototype.preset = function (name) {
        if (!this.presets[name]) throw new Error('Unknown preset: ' + name);
        this.activeTab = name;
        this.chosen = {};
        var self = this;
        this.presets[name].forEach(function (id) { self.toggle(id, true); });
    };
    Selection.prototype.enterTab = function (name) {
        if (name === this.activeTab) return false;
        if (name === 'custom') this.activeTab = name;
        else this.preset(name);
        return true;
    };
    Selection.prototype.matchesReview = function (review) {
        return !!(review && review.ready && review.token && this.key() && review.key === this.reviewKey());
    };
    function verificationChecks(output) {
        return output.split('\n').map(function (line) {
            var match = line.match(/^(PASS|PENDING|FAIL) \[([a-z][a-z0-9-]*)\] (.*)$/);
            return match ? { state: match[1], id: match[2], message: match[3] } : null;
        }).filter(Boolean);
    }
    function recommendations(output, names) {
        names=names||{};var lines=[],seen={};
        function add(text){if(!seen[text]){lines.push(text);seen[text]=true;}}
        function title(id){return names[id]||{'shell-integration':'Shell loading','local-bin-path':'Shell PATH'}[id]||id;}
        function value(text){return text.replace(/\b(?:boolean|integer|real|string)\s+/g,'').replace(/no user override/g,'macOS default').replace(/\btrue\b/g,'On').replace(/\bfalse\b/g,'Off').replace(/^"(.*)"$/,'$1');}
        output.split('\n').forEach(function(line){var match;
            if((match=line.match(/^INSTALL \[([a-z-]+)\] ([0-9.]+)/)))add('Install '+title(match[1])+' '+match[2]+'.');
            else if((match=line.match(/^PREFERENCE_CHANGE \[([a-z-]+)\] (.*?): (.*?) -> (.*)$/)))add(title(match[1])+' preferences — '+match[2]+': '+value(match[3])+' → '+value(match[4])+'.');
            else if((match=line.match(/^HELPER_CHANGE \[([a-z-]+)\] Build ([A-Za-z]+) /)))add('Update '+title(match[1])+' helper ('+match[2]+'); save its old copy.');
            else if((match=line.match(/^CHANGE \[([a-z-]+)\] (.*)$/)))add('Update '+title(match[1])+' — '+match[2]+'.');
            else if((match=line.match(/^RECOMMEND \[([a-z-]+)\] Preserve and replace (.*)$/)))add('Save the existing '+title(match[1])+' command before replacing '+match[2]+'.');
            else if((match=line.match(/^RECOMMEND \[([a-z-]+)\] Restore (?:command link|links to)(.*)$/)))add('Restore '+title(match[1])+' command links'+match[2]+'.');
        });
        return lines;
    }
    function result(kind, success, output, changes, formatBlocker, names) {
        var guided=output.split('\n').filter(function(line){return /^GUIDED \[/.test(line);}).map(function(line){return line.match(/^GUIDED \[([^\]]+)/)[1];}).filter(function(id,index,all){return all.indexOf(id)===index;});
        var manual=guided.length?'\n\nFinish in Preferences → macOS settings: '+guided.map(function(id){return (names||{})[id]||id;}).join(', ')+'.':'';
        if(success&&guided.length&&(kind==='verify'||kind==='review'&&!changes))return {level:'warning',label:'Check settings',manual:true,summary:(kind==='verify'?'Saved timing/setup checked.':'No scripted changes requested.')+manual+'\nExternal visual, password and power choices need checking in macOS.',footer:'Use Preferences to configure and check native macOS choices.'};
        if (success && kind === 'review') return { level: 'success', label: changes ? 'Ready' : 'Up to date',
            summary: changes ? 'Ready to apply'+manual : 'Everything selected is up to date.', footer: changes ? 'Review complete. Ready to apply.' : 'Already up to date.' };
        var preferences = /^REFRESH \[/m.test(output);
        var helpers = /^(?:HELPER_CHANGE|SATISFIED|DONE) \[(?:gestures|closing|windowskeys)\]/m.test(output);
        var profiles = /^REFRESH \[terminalprofile\]/m.test(output);
        var nextSteps = (helpers ? '\n\nOpen installed helpers in ~/Applications; choose startup in Preferences → Login. Approve Accessibility for window actions. Runtime access is not checked.' : '') +
            (profiles ? '\n\nOpen a Terminal profile through Utilities; set Default in Terminal if desired.' : '')+manual;
        if (success && kind === 'apply') return { level: 'success', label: preferences ? 'Saved' : 'Applied', summary: preferences ?
            'Setup saved.' + nextSteps + '\n\nReopen affected processes normally if needed. Originals are in Details.' :
            'Setup applied successfully.' + nextSteps + '\n\nOpen a new terminal to use shell changes. Backups are in Details.', footer: preferences ? 'Preferences saved. Verification checks stored values.' : 'Applied. Use Verify to check the result.' };
        if (success) return { level: 'success', label: 'Passed', summary: preferences ?
            'Saved preferences verified.' + nextSteps + '\n\nActive processes may need a normal relaunch or sign-out.' :
            'Verification passed.' + nextSteps, footer: preferences ? 'Saved values verified. Active process refresh is not checked.' : 'Verification passed.' };
        var blockers = output.split('\n').filter(function (line) { return line.indexOf('BLOCKED:') === 0; });
        var checks = verificationChecks(output);
        var failures=output.split('\n').filter(function(line){return /^(?:FAIL(?:ED)? \[|Target changed|Preference changed|Run failed)|execution error:/.test(line);}).slice(0,4).map(function(line){return line.replace(/^(FAIL|FAILED) \[([^\]]+)\] /,function(_,status,id){return ((names||{})[id]||id)+': ';});}).join('\n\n');
        if (checks.some(function (check) { return check.state === 'FAIL'; })) return { level: 'error', label: 'Failed',
            summary: (kind === 'verify' ? 'Verification failed' : 'Inspection failed') + '\n\n'+failures+'\n\nDetails has the complete activity and recovery paths.', footer: 'A check failed. See Details.', details: true };
        if (kind === 'verify' && !checks.some(function (check) { return check.state === 'FAIL'; }) &&
            /Verification (?:failed|incomplete): selected setup has pending changes\./.test(output)) {
            names = names || {};
            function title(id) { return names[id] || { 'local-bin-path': 'Shell PATH', 'shell-integration': 'Shell loading' }[id] || id; }
            var working = checks.filter(function (check) { return check.state === 'PASS'; }).map(function (check) { return title(check.id); });
            var pending = checks.filter(function (check) { return check.state === 'PENDING'; }).map(function (check) { return title(check.id); });
            var summary = 'Not applied yet';
            if (working.length) summary += '\n\nWorking: ' + working.join(', ');
            summary += pending.length ? '\n\nNeeds setup: ' + pending.join(', ') : '\n\nThe selected settings still need setup.';
            return { level: 'warning', label: 'Not applied', summary: summary + '\n\nReview the changes, then Apply.', footer: 'Setup is pending. Review before applying.' };
        }
        var versionRequirements = blockers.length && blockers.every(function (line) { return /external installation .* does not meet/.test(line); });
        if (kind !== 'apply' && blockers.length) return { level: 'warning', label: kind === 'verify' && versionRequirements ? 'Updates' : 'Blocked',
            summary: (kind === 'verify' ? 'Setup needs attention' : 'Needs attention') + '\n\n' + blockers.map(formatBlocker).join('\n\n'),
            footer: 'Resolve the listed requirements, then review again.' };
        return { level: 'error', label: 'Failed', summary: (kind === 'verify' ? 'Verification failed' : 'Needs attention') + '\n\n'+(failures||'The operation could not finish.')+'\n\nDetails has the complete activity and recovery paths.',
            footer: kind === 'verify' ? 'A verification check failed. See Details.' : 'The run failed. See Details before retrying.', details: true };
    }
    return { Selection: Selection, parseCatalog: parseCatalog, result: result, verificationChecks: verificationChecks, recommendations: recommendations };
}())
