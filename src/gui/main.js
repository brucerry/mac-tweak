/* Native macOS chooser. JXA/AppKit ship with macOS; no extra runtime is needed. */
ObjC.import('Cocoa');

var UI = null;
var State = null;
var Dialogs = null;
var PreferenceModel = null;
var PreferenceEditor = null;
var FilesBrowser = null;
var MaintenanceSheet = null;
var MaintenanceIO = null;
var Project = null;
var Icons=null, Hovers=null, Activity=null, ActivityLog=null, NativeFiles=null, Presentation=null, SettingsNavigation=null;
var TITLES = {
    gestures: 'Dock & gestures', closing: 'App close behavior', windowskeys: 'Windows keyboard', terminalprofile: 'Terminal profiles',
    node: 'Node.js & npm', uv: 'uv', gh: 'GitHub CLI', tig: 'tig',
    prompt: 'Colored prompt', aliases: 'Shell shortcuts', colors: 'File colors',
    finder: 'Finder', dock: 'Dock', keyboard: 'Keyboard', screenshots: 'Screenshots', wallpaper:'Wallpaper', screensaver:'Screen saver', protection:'Screen protection', displays:'Display', power:'Power',
    appearance: "Appearance", accessibility: "Accessibility", mouse: "Mouse", trackpad: "Trackpad", windows: "Windows", desktop: "Desktop", sound: "Sound", spotlight: "Spotlight", terminal: "Terminal preferences"
};
var DESCRIPTIONS = {
    gestures: 'Dock · Alt+Tab · Apps', closing: 'Red button · last tab', windowskeys: 'Ctrl · Win · Alt', terminalprofile: 'Colors · font · shell exit',
    node: 'JavaScript & packages', uv: 'Python environments',
    gh: 'Repos & pull requests', tig: 'Git history',
    prompt: 'User, host & folder', aliases: 'ls -G  ·  ll',
    colors: 'Color-coded file types', finder: 'Windows & display', dock: 'Size & behavior',
    keyboard: 'Repeat & typing', screenshots: 'Format & appearance', wallpaper:'Still · dynamic · aerial', screensaver:'Idle time · visuals', protection:'Password · display sleep', displays:'Brightness · resolution · layout', power:'Battery · energy',
    appearance: "Colors & scrolling", accessibility: "Motion & contrast", mouse: "Pointer & buttons", trackpad: "Clicks & gestures", windows: "Spaces & window controls", desktop: "Widgets & Stage Manager", sound: "Effects & alerts", spotlight: "Search & menu icon", terminal: "Terminal app options"
};
var SYMBOLS = { gestures: 'hand.tap', closing: 'xmark.circle', windowskeys: 'keyboard', terminalprofile: 'terminal', node: 'curlybraces', uv: 'shippingbox', gh: 'chevron.left.forwardslash.chevron.right',
    tig: 'point.3.connected.trianglepath.dotted', prompt: 'terminal', aliases: 'command', colors: 'paintpalette', finder: 'folder', dock: 'square.grid.2x2',
    keyboard: 'keyboard', screenshots: 'camera', wallpaper:'desktopcomputer', screensaver:'moon', protection:'checkmark.shield', displays:'view-columns', power:'bolt',
    appearance: "circle.lefthalf.filled", accessibility: "accessibility", mouse: "computermouse", trackpad: "rectangle.and.hand.point.up.left", windows: "macwindow", desktop: "desktopcomputer", sound: "speaker.wave.2", spotlight: "magnifyingglass", terminal: "terminal" };

function color(hex, alpha) {
    return $.NSColor.colorWithSRGBRedGreenBlueAlpha(parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255, alpha === undefined ? 1 : alpha);
}
var THEMES = {};
function theme(dark) {
    if(THEMES[String(dark)])return THEMES[String(dark)];
    return THEMES[String(dark)] = { dark: dark, background: color(dark ? '141824' : 'F3F5FB'), surface: color(dark ? '1E2433' : 'FFFFFF'),
        inset: color(dark ? '181E2B' : 'F7F8FC'), border: color(dark ? '343D52' : 'E0E5F0'),
        solidSurface:color(dark?'1E2433':'FFFFFF'),glassSurface:color(dark?'1E2433':'FFFFFF',dark?0.64:0.68),
        solidInset:color(dark?'181E2B':'F7F8FC'),glassInset:color(dark?'181E2B':'F7F8FC',0.56),
        text: color(dark ? 'F0F2FA' : '232943'), muted: color(dark ? 'AAB6CC' : '58647B'),
        primary: color('6952D6'), accent: color(dark ? 'B4A3FF' : '6952D6'), teal: color(dark ? '68DECE' : '107565'),
        coral: color(dark ? 'FFB69C' : 'A8462F'), orange: color(dark ? 'FFD078' : '975B00'), red: color(dark ? 'FF9EAC' : 'BB354D'),
        blue: color(dark ? '92C5FF' : '205FA4'), rose: color(dark ? 'EDA8D3' : '963E7B'),
        green: color(dark ? '8CD8A8' : '226F43'), olive:color(dark?'C7E691':'486200') };
}
function panel(x, y, width, height, fill, border, radius) {
    // NSBox keeps drawing in AppKit; passing CF CGColor references through JXA
    // to Core Animation can terminate the osascript host on newer macOS.
    var view = $.NSBox.alloc.initWithFrame($.NSMakeRect(x, y, width, height));
    view.boxType = $.NSBoxCustom;
    view.titlePosition = $.NSNoTitle;
    view.contentViewMargins = $.NSMakeSize(0, 0);
    view.cornerRadius = radius === undefined ? 14 : radius;
    view.fillColor = fill;
    view.borderWidth = 0;
    return view;
}
function icon(name, x, y, size, tint) {
    var view = $.NSImageView.alloc.initWithFrame($.NSMakeRect(x, y, size, size));
    view.image = Icons.image(name);
    view.contentTintColor = tint;
    return view;
}
function selectionMark(x,y,size){
    var box=panel(x,y,size,size,$.NSColor.quaternaryLabelColor,null,5),check=icon('check',3,3,size-6,$.NSColor.whiteColor);
    check.hidden=true;box.addSubview(check);return {box:box,check:check};
}
function paintSelection(mark,selected,tint){
    mark.box.fillColor=selected?tint:$.NSColor.quaternaryLabelColor;
    mark.check.hidden=!selected;mark.check.contentTintColor=UI.theme.dark?UI.theme.background:$.NSColor.whiteColor;
    mark.box.setAccessibilityLabel(selected?'Selected':'Not selected');
}
function paint(callback) { UI.painters.push(callback); callback(UI.theme); }
function themedPanel(x, y, width, height, fill, border, radius) {
    var view = panel(x, y, width, height, UI.theme[fill], border ? UI.theme[border] : null, radius);
    paint(function (palette) { view.fillColor = palette[fill]; });
    return view;
}
function repositoryHover(hovered) {
    UI.repositoryHovered = hovered;
    UI.repositoryPlate.fillColor = hovered ? UI.theme.text.colorWithAlphaComponent(0.10) : $.NSColor.clearColor;
    UI.repository.contentTintColor=hovered?UI.theme.accent:UI.theme.text;
    if (hovered) $.NSCursor.pointingHandCursor.set; else $.NSCursor.arrowCursor.set;
}
function updateBulb() {
    var lit = checked(UI.themeToggle);
    UI.themeBulb.image = Icons.image(lit ? 'lightbulb.fill' : 'lightbulb');
    UI.themeBulb.contentTintColor = lit ? UI.theme.orange : UI.theme.muted;
    UI.themeBulb.setAccessibilityLabel(lit ? 'Theme bulb on' : 'Theme bulb off');
    UI.themeToggle.setAccessibilityLabel(lit ? 'Dark appearance, bulb on' : 'Light appearance, bulb off');
}
function nativeWindowChrome(window){
    window.titlebarAppearsTransparent=false;window.titleVisibility=$.NSWindowTitleVisible;
    window.backgroundColor=$.NSColor.windowBackgroundColor;window.opaque=true;
}
function updateTransparency(reduced){
    // Accessibility owns this decision. The optional value is used only by own-view tests.
    if(reduced===undefined)reduced=!!$.NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceTransparency;
    var changed=UI.reducedTransparency!==reduced;
    UI.reducedTransparency=reduced;UI.backdrop.hidden=reduced;UI.window.opaque=reduced;
    UI.theme.surface=reduced?UI.theme.solidSurface:UI.theme.glassSurface;UI.theme.inset=reduced?UI.theme.solidInset:UI.theme.glassInset;
    // The base fill also backs the native title bar. Clear would leave its
    // title and traffic lights floating while the effect covers content only.
    UI.window.backgroundColor=UI.theme.background;
    UI.window.titlebarAppearsTransparent=false;UI.window.titleVisibility=$.NSWindowTitleVisible;
    if(changed&&UI.apply){UI.painters.forEach(function(paint){paint(UI.theme);});controls(true);renderOutput(true);}
}
function applyTheme(dark) {
    if(UI.theme.dark===dark)return;
    $.NSApp.appearance = $.NSAppearance.appearanceNamed(dark ? $.NSAppearanceNameDarkAqua : $.NSAppearanceNameAqua);
    UI.window.appearance = $.NSApp.appearance;
    if (UI.preferenceSheet) UI.preferenceSheet.panel.appearance = $.NSApp.appearance;
    if (UI.savedSheet) UI.savedSheet.panel.appearance = UI.window.appearance;
    if (UI.maintenanceSheet) UI.maintenanceSheet.panel.appearance = UI.window.appearance;
    UI.theme = theme(dark);Hovers.configure(UI.controller,UI.theme);
    UI.themeToggle.state = dark ? 1 : 0;
    updateTransparency();
    UI.painters.forEach(function (callback) { callback(UI.theme); });
    repositoryHover(!!UI.repositoryHovered); updateBulb();
    UI.text.textColor = UI.theme.text;
    UI.text.backgroundColor = UI.theme.inset;
    status(UI.statusText, UI.statusLevel);
    controls(true);
    renderOutput(true);
}

function readText(path) {
    var value = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, Ref());
    return value ? ObjC.unwrap(value) : '';
}
function data(text) { return $(text).dataUsingEncoding($.NSUTF8StringEncoding); }
// JXA can expose AppKit's 64-bit integer properties as strings.
function checked(button) { return Number(button.state) === 1; }
function makeModel(root) {
    var parts = State.parseCatalog(readText(root + '/src/catalog/components.txt'));
    var files = ObjC.deepUnwrap($.NSFileManager.defaultManager.contentsOfDirectoryAtPathError(root + '/src/presets', Ref()));
    var sections = JSON.parse(readText(root + '/src/catalog/sections.json'));
    if (sections.version !== 1 || !Array.isArray(sections.sections)) throw new Error('Invalid section manifest.');
    var priority = sections.sections.map(function (section) { return section.id; }).concat(['full']);
    var order = files.filter(function (name) { return /^[a-z][a-z0-9-]*\.txt$/.test(name); }).map(function (name) { return name.slice(0, -4); });
    order.sort(function (a, b) {
        var first = priority.indexOf(a), second = priority.indexOf(b);
        if (first < 0) first = 100; if (second < 0) second = 100;
        return first - second || a.localeCompare(b);
    });
    var presets = {};
    order.forEach(function (name) { presets[name] = readText(root + '/src/presets/' + name + '.txt').trim().split('\n').filter(Boolean); });
    var sectionIds = {}, sectionAccents = {};
    sections.sections.forEach(function (section) {
        if (!section || !presets[section.id] || sectionIds[section.id] || ['shell', 'tool', 'preference', 'profile'].indexOf(section.kind) < 0 || ['coral', 'teal', 'accent', 'blue', 'rose', 'olive'].indexOf(section.accent) < 0 || typeof section.title !== 'string') throw new Error('Invalid section metadata.');
        if (sectionAccents[section.accent]) throw new Error('Section accents must be unique.');
        sectionIds[section.id] = true; sectionAccents[section.accent] = true;
    });
    if (parts.some(function (part) { return sections.sections.filter(function (section) { return presets[section.id].indexOf(part.id) >= 0; }).length !== 1; })) throw new Error('Each card must belong to one ordered section.');
    var model = new State.Selection(parts, presets, order);
    model.sections = sections.sections;
    model.settings = PreferenceModel.catalog(JSON.parse(readText(root + '/src/catalog/preferences.json')));
    return model;
}
function selfTest(root) {
    var model = makeModel(root);
    function check(value, message) { if (!value) throw new Error(message); }
    var saverAction={url:'x-apple.systempreferences:com.apple.ScreenSaver-Settings.extension',fallback:'x-apple.systempreferences:com.apple.Wallpaper-Settings.extension?ScreenSaver'};
    check(nativeSettingsURL(saverAction,'com.apple.Wallpaper-Settings.extension')===saverAction.fallback,'Modern screen-saver navigation must retain its subpage anchor.');
    check(nativeSettingsURL(saverAction,'com.apple.ScreenSaver-Settings.extension com.apple.Wallpaper-Settings.extension')===saverAction.url,'Older macOS must retain its standalone screen-saver pane.');
    check(checked({ state: '1' }) && checked({ state: 1 }) && !checked({ state: '0' }), 'Native checkbox state must be normalized.');
    check(model.ids().length === 0, 'Nothing should be selected initially.');
    model.preset('full');
    check(model.ids().length === model.parts.length, 'Full must contain all public choices.');
    var reviewed = { key: model.reviewKey(), ready: true, token: 'session' };
    check(model.matchesReview(reviewed), 'Current review should match.');
    model.toggle('tig', false);
    check(model.ids().length === model.parts.length - 1 && !model.matchesReview(reviewed), 'Editing a preset must invalidate review.');
    model.preset('terminal');
    check(model.ids().length === 3 && model.ids().indexOf('node') < 0, 'Terminal preset must be independent.');
    model.preset('development');
    check(model.ids().length === 4 && model.ids().indexOf('prompt') < 0, 'Development preset must be independent.');
    check(model.ids().indexOf('local-bin-path') < 0, 'Shared dependencies are handled by the backend.');
    check(!model.allowed('prompt'), 'Development must scope terminal choices out.');
    check(model.enterTab('custom') && model.ids().length === 4, 'Entering Custom must preserve the previous preset.');
    model.toggle('aliases', true);
    var customReview = { key: model.key(), ready: true, token: 'custom-review' };
    check(!model.enterTab('custom') && model.chosen.aliases && model.matchesReview(customReview), 'Re-clicking Custom must preserve choices and approval.');
    model.enterTab('terminal');
    check(model.toggle('node', true) && model.chosen.node && model.activeTab === 'custom', 'A gray-card click must enter Custom and add to the existing selection.');
    model.enterTab('terminal');
    model.toggle('prompt', false);
    check(model.activeTab === 'terminal' && !model.enterTab('terminal') && !model.chosen.prompt, 'Editing and re-clicking a specific tab must preserve its scoped choices.');
    model.preset('terminal');
    var scopedReview = { key: model.reviewKey(), ready: true, token: 'scoped' };
    model.enterTab('custom');
    check(model.matchesReview(scopedReview), 'Entering Custom without edits must preserve matching approval.');
    model.preset('full'); model.toggle('node', false);
    check(model.activeTab === 'custom' && !model.chosen.node && model.ids().length === model.parts.length - 1, 'Deselecting Full must enter Custom and retain the rest.');
    var pending = State.result('verify', false, 'Verification failed: selected setup has pending changes.', 0, friendlyBlocker);
    check(pending.level === 'warning' && pending.label === 'Not applied' && !pending.details, 'Unapplied settings must be a specific verification warning.');
    var working = State.result('verify', false, 'PASS [uv] executable visible\nPENDING [local-bin-path] unapplied\nVerification incomplete: selected setup has pending changes.', 0, friendlyBlocker, TITLES);
    check(working.summary.indexOf('Working: uv') >= 0 && working.summary.indexOf('Shell PATH') >= 0, 'Working tools must be distinguished from pending shell integration.');
    check(State.result('verify', false, 'FAIL [uv] executable missing\nVerification incomplete: selected setup has pending changes.', 0, friendlyBlocker).level === 'error',
        'Pending setup must not hide a failed health check.');
    check(State.result('verify', false, 'BLOCKED: shell-integration: resolve target ~/.zshrc', 0, friendlyBlocker).label === 'Blocked',
        'Configuration conflicts must not be mislabeled as version updates.');
    check(State.result('verify', false, 'FAIL [node] executable not visible', 0, friendlyBlocker).level === 'error', 'Actual failed checks must remain red failures.');
    check(State.result('apply', false, 'FAILED [node]', 0, friendlyBlocker).level === 'error' &&
        State.result('review', true, '', 3, friendlyBlocker).level === 'success', 'Apply failures and successful reviews need distinct result states.');
    var recommended = State.recommendations('INSTALL [node] 24.22.1 for arm64\nRECOMMEND [node] Preserve and replace /home/.local/bin/node\nCHANGE [aliases] /home/aliases', TITLES).join('\n');
    check(recommended.indexOf('Node.js & npm 24.22.1') >= 0 && recommended.indexOf('Save the existing Node.js & npm command') >= 0 && recommended.indexOf('Shell shortcuts') >= 0,
        'Fix recommendations must disclose selected versions and preservation.');
    var manualResult=State.result('verify',true,'GUIDED [wallpaper] native settings',0,friendlyBlocker,TITLES);check(manualResult.manual&&manualResult.level==='warning','Guided settings must never be falsely verified.');
    var helperResult = State.result('verify', true, 'SATISFIED [windowskeys] helper source and owned executable match\nREFRESH [windowskeys] saved values', 0, friendlyBlocker);
    check(helperResult.summary.indexOf('Open installed helpers in ~/Applications') >= 0 && helperResult.summary.indexOf('Runtime access is not checked') >= 0, 'Saved helper results must retain activation and permission guidance.');
    var issue = friendlyBlocker('BLOCKED: node: external installation /example/node (24.22.0) does not meet >=24.22.1, <25.0.0; update through its manager or remove it, then retry');
    check(issue.indexOf('Installed: 24.22.0') >= 0 && issue.indexOf('>=24.22.1, <25.0.0') >= 0 && issue.indexOf('/example') < 0,
        'Concise blockers must retain installed and required versions.');
    function luminance(value) {
        return [Number(value.redComponent), Number(value.greenComponent), Number(value.blueComponent)].map(function (part) {
            return part <= 0.04045 ? part / 12.92 : Math.pow((part + 0.055) / 1.055, 2.4);
        }).reduce(function (sum, part, index) { return sum + part * [0.2126, 0.7152, 0.0722][index]; }, 0);
    }
    function contrast(first, second) {
        first = luminance(first); second = luminance(second);
        return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    }
    [false, true].forEach(function (dark) {
        var colors = theme(dark);
        check(contrast(color('FFFFFF'), colors.primary) >= 4.5, 'Primary buttons and selected presets need readable white text.');
        [colors.text, colors.muted, colors.accent, colors.teal, colors.coral, colors.blue, colors.rose, colors.olive, colors.green, colors.orange, colors.red].forEach(function (foreground) {
            [colors.surface, colors.background].forEach(function (background) {
                check(contrast(foreground, background) >= 4.5,
                    'Theme text must remain readable in ' + (dark ? 'dark' : 'light') + ' appearance.');
            });
        });
        [colors.accent, colors.teal, colors.coral, colors.blue, colors.rose, colors.olive, colors.green].forEach(function (accent) {
            var tinted = {}, opacity = dark ? 0.14 : 0.08;
            ['redComponent', 'greenComponent', 'blueComponent'].forEach(function (channel) {
                tinted[channel] = Number(accent[channel]) * opacity + Number(colors.background[channel]) * (1 - opacity);
            });
            check(contrast(accent, tinted) >= 4.5 && contrast(colors.muted, tinted) >= 4.5,
                'Selected cards must keep readable names and captions.');
        });
    });
    return 'PASS: native GUI catalog, grouped selections, editable presets, and review invalidation';
}

function label(text, x, y, width, height, size, bold, secondary) {
    var field = $.NSTextField.labelWithString(text);
    field.frame = $.NSMakeRect(x, y, width, height);
    field.font = bold ? $.NSFont.boldSystemFontOfSize(size) : $.NSFont.systemFontOfSize(size);
    paint(function (palette) { field.textColor = secondary ? palette.muted : palette.text; });
    field.lineBreakMode = $.NSLineBreakByWordWrapping;
    field.maximumNumberOfLines = 0;
    return field;
}
function centeredLabel(text, x, centerY, width, size, bold, secondary) {
    var field = label(text, x, 0, width, 24, size, bold, secondary);
    field.maximumNumberOfLines = 1;
    field.lineBreakMode = $.NSLineBreakByTruncatingTail;
    field.cell.usesSingleLineMode = true;
    var height = Math.ceil(Number(field.cell.cellSize.height));
    field.frame = $.NSMakeRect(x, centerY - height / 2, width, height);
    return field;
}
function withAppletModalEvents(action){
    UI.modalDepth=(UI.modalDepth||0)+1;
    // Native hosts dispatch script events in the default mode. Enable the
    // bridge only for our own modal UI, never the host's termination machinery.
    if(UI.hosted&&!UI.handlingQuit&&!UI.appletModalPump){
        UI.appletModalPump=$.NSTimer.timerWithTimeIntervalTargetSelectorUserInfoRepeats(0.1,UI.controller,'pumpAppletEvents:',null,true);
        $.NSRunLoop.currentRunLoop.addTimerForMode(UI.appletModalPump,$.NSModalPanelRunLoopMode);
    }
    try{return action();}finally{
        UI.modalDepth--;
        if(!UI.modalDepth&&UI.appletModalPump){UI.appletModalPump.invalidate;UI.appletModalPump=null;}
    }
}
function runPanelModal(panel){return withAppletModalEvents(function(){return Number($.NSApp.runModalForWindow(panel));});}
function runAlert(alert){alert.layout;Hovers.sync(alert.window.contentView);try{return withAppletModalEvents(function(){return Number(alert.runModal);});}finally{Hovers.clear(alert.window.contentView);}}
function actionButton(title, action, x, y, width) {
    var button = $.NSButton.alloc.initWithFrame($.NSMakeRect(x, y, width, 32));
    button.title = title;
    button.bezelStyle = 1; // rounded
    button.target = UI.controller;
    button.action = action;
    return button;
}
var RESULT_STYLES = { idle: ['circle', 'muted'], busy: ['clock', 'accent'], success: ['checkmark.circle.fill', 'green'],
    warning: ['exclamationmark.triangle.fill', 'orange'], error: ['xmark.octagon.fill', 'red'] };
function status(text, level) {
    if (typeof level === 'boolean') level = level ? 'error' : 'idle';
    level = level || 'idle';
    if (UI.statusText !== text) UI.status.stringValue = text;
    UI.status.toolTip = text;
    UI.statusText = text; UI.statusLevel = level;
    UI.status.textColor = UI.theme[RESULT_STYLES[level][1]];
    if(UI.statusSymbol!==RESULT_STYLES[level][0]){UI.statusIcon.image = Icons.image(RESULT_STYLES[level][0]);UI.statusSymbol=RESULT_STYLES[level][0];}
    UI.statusIcon.contentTintColor = UI.theme[RESULT_STYLES[level][1]];
    UI.statusIcon.setAccessibilityLabel(level + ': ' + text);
}
function renderResults(appearanceOnly) {
    ['review', 'verify', 'apply'].forEach(function (kind) {
        var row = UI.resultRows[kind], result = UI.results[kind], style = RESULT_STYLES[result.level];
        if(row.symbol!==style[0]){row.icon.image = Icons.image(style[0]);row.symbol=style[0];}
        row.icon.contentTintColor = UI.theme[style[1]];
        if(!appearanceOnly){row.icon.setAccessibilityLabel(kind + ': ' + result.label);row.value.stringValue = result.label;}
        row.value.textColor = UI.theme[style[1]];
    });
}
function resetResults() {
    UI.results = { review: { level: 'idle', label: 'Not checked' }, verify: { level: 'idle', label: 'Not checked' }, apply: { level: 'idle', label: 'Not run' } };
}
function summary() {
    var ids = UI.model.ids();
    if (!ids.length) return 'Select items, then Review.';
    return ids.map(function (id) { return TITLES[id] || id; }).join('\n') + '\n\nReview to see what will change.';
}
function friendlyBlocker(line) {
    var text = line.replace(/^BLOCKED: /, '');
    if (text.indexOf('system-preferences:') === 0) return text.replace(/^system-preferences:\s*/, '').replace(/^.*execution error: (?:Error:\s*)+/, '').replace(/ \(-[0-9]+\)$/, '');
    var external = text.match(/^(node|uv|gh|tig): external installation .* \(([^)]+)\) does not meet (>=.*?);/);
    if (external) return TITLES[external[1]] + '\nInstalled: ' + external[2] + '  ·  Needs ' + external[3] + '\nUpdate it, then review again.';
    var home = ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('HOME'));
    return text.split(home + '/').join('~/').replace(/^shell-integration:/, 'Shell setup:');
}
function renderOutput(force) {
    var detailed = checked(UI.details) && UI.output, mode = detailed ? 'details' : 'summary';
    var rows=detailed?ActivityLog.rows(UI.output,TITLES,UI.model.settings,ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('HOME'))):null;
    var text = detailed ? ActivityLog.string(rows) : UI.summary;
    if (!force && UI.renderedText === text && UI.renderedMode === mode) return;
    var clip = UI.outputScroll.contentView, bounds = clip.bounds;
    var origin = $.NSMakePoint(Number(bounds.origin.x), Number(bounds.origin.y));
    var followsEnd = Number(bounds.origin.y) + Number(bounds.size.height) >= Number(UI.text.bounds.size.height) - 24;
    var append = UI.renderedMode === mode && UI.renderedText && text.indexOf(UI.renderedText) === 0;
    var streaming=detailed&&UI.renderedMode===mode&&UI.renderedOutput&&UI.output.indexOf(UI.renderedOutput)===0;
    if(detailed){var styled=ActivityLog.attributed(rows,UI.theme,append&&!force?UI.renderedText.length:0);if(append&&!force)UI.text.textStorage.appendAttributedString(styled);else UI.text.textStorage.setAttributedString(styled);}
    else{UI.text.string=text;var attrs=$.NSMutableDictionary.alloc.init;attrs.setObjectForKey($.NSFont.systemFontOfSize(14),$.NSFontAttributeName);attrs.setObjectForKey(UI.theme.text,$.NSForegroundColorAttributeName);attrs.setObjectForKey($.NSParagraphStyle.defaultParagraphStyle,$.NSParagraphStyleAttributeName);UI.text.textStorage.setAttributesRange(attrs,$.NSMakeRange(0,text.length));}
    UI.text.layoutManager.ensureLayoutForTextContainer(UI.text.textContainer);
    if ((append||streaming) && followsEnd && !force) UI.text.scrollRangeToVisible($.NSMakeRange(text.length, 0));
    else clip.scrollToPoint(append || streaming || force ? origin : $.NSMakePoint(0, 0));
    UI.outputScroll.reflectScrolledClipView(clip);
    UI.renderedText = text; UI.renderedMode = mode;
    UI.renderedOutput=UI.output;
    UI.renderWrites++;
}
function controls(appearanceOnly) {
    var applying = UI.job && UI.job.kind === 'apply' && UI.job.task.running;
    var waiting = UI.job && ['review', 'repair-review'].indexOf(UI.job.kind) >= 0 && UI.job.task.running && !UI.job.ready;
    var checking = UI.job && UI.job.kind === 'verify' && UI.job.task.running;
    var busy = applying || waiting || checking, selected = UI.model.ids().length;
    UI.checkboxes.forEach(function (button, index) {
        var allowed = UI.model.allowed(UI.model.parts[index].id), accent = UI.theme[UI.accentKeys[index]];
        if(!appearanceOnly)button.enabled = !busy;
        button.contentTintColor = allowed ? accent : UI.theme.muted;
        if(!appearanceOnly){button.state = UI.model.chosen[UI.model.parts[index].id] ? 1 : 0;UI.indicators[index].state = button.state;}
        paintSelection(UI.indicators[index].mark,checked(button),allowed?accent:UI.theme.muted);
        UI.indicators[index].title.textColor = allowed ? accent : UI.theme.muted;
        if(!appearanceOnly)UI.cards[index].alphaValue = applying || checking ? 0.65 : 1;
        UI.cards[index].fillColor = !allowed ? UI.theme.inset : UI.model.chosen[UI.model.parts[index].id] ? accent.colorWithAlphaComponent(UI.theme.dark ? 0.14 : 0.08) : UI.theme.surface;
        UI.cardIcons[index].contentTintColor = allowed ? accent : UI.theme.muted;
        UI.cardTiles[index].fillColor = (allowed ? accent : UI.theme.muted).colorWithAlphaComponent(0.12);
    });
    UI.navRows.forEach(function (row) {
        var active = row.tab.id === UI.model.activeTab;
        var section = UI.model.sections.filter(function (section) { return section.id === row.tab.id; })[0];
        var navAccent = UI.theme[section ? section.accent : 'accent'];
        if(!appearanceOnly)row.button.enabled = !busy;
        row.button.contentTintColor = active ? navAccent : UI.theme.text;
        row.label.textColor=active?navAccent:UI.theme.text;row.marker.hidden=!active;row.marker.contentTintColor=navAccent;
        if(!appearanceOnly){row.button.setAccessibilityLabel(row.tab.title + (active ? ', selected' : ''));row.button.state = active ? 1 : 0;}
        row.view.fillColor = active ? navAccent.colorWithAlphaComponent(0.12) : UI.theme.surface;
    });
    if(!appearanceOnly){
        UI.utilities.enabled = !busy;UI.savedFiles.enabled = !busy;
        UI.review.enabled = selected > 0 && !busy;UI.verify.enabled = selected > 0 && !busy;
        UI.preferencesButton.enabled = !busy && UI.model.parts.some(function (part) { return (part.kind === 'preference'||part.kind==='guided') && UI.model.chosen[part.id]; });
        UI.apply.enabled = !busy && UI.model.matchesReview(UI.job) && UI.job.task.running && UI.job.changes > 0;
        UI.apply.title = 'Apply';
    }
    UI.applyPlate.fillColor = UI.apply.enabled ? UI.theme.primary : UI.theme.inset;
    UI.apply.contentTintColor = UI.apply.enabled ? $.NSColor.whiteColor : UI.theme.muted.colorWithAlphaComponent(0.5);
    UI.reviewPlate.fillColor = UI.review.enabled && !UI.apply.enabled ? UI.theme.accent.colorWithAlphaComponent(0.10) : UI.theme.surface;
    UI.review.contentTintColor = UI.review.enabled ? UI.theme.accent : UI.theme.muted.colorWithAlphaComponent(0.5);
    if(!appearanceOnly){UI.apply.keyEquivalent = UI.apply.enabled ? '\r' : '';UI.review.keyEquivalent = !UI.apply.enabled && UI.review.enabled ? '\r' : '';UI.selectionTitle.stringValue = selected ? selected + ' selected' : 'Nothing selected';if (busy) UI.spinner.startAnimation(null); else UI.spinner.stopAnimation(null);}
    renderResults(appearanceOnly);
}
function cancelReview() {
    if (!UI.job || (UI.job.kind === 'apply' && UI.job.task.running)) return;
    try { UI.job.input.closeFile; } catch (_) {}
    UI.retired.push(UI.job);
    UI.job = null;
}
function selectionChanged() {
    cancelReview();
    resetResults();
    UI.summary = summary();
    UI.output = '';
    status('Ready to review.', false);
    controls();
    renderOutput();
}
function choosePreset(index) {
    var tab = UI.tabs[Number(index)];
    var prior = UI.model.reviewKey();
    if (!tab || !UI.model.enterTab(tab.id)) return;
    UI.checkboxes.forEach(function (button, i) { button.state = UI.model.chosen[UI.model.parts[i].id] ? 1 : 0; });
    if (UI.model.reviewKey() !== prior) selectionChanged(); else controls();
    var clip = UI.componentScroll.contentView;
    var target = UI.sectionOffsets[tab.id];
    if (target === undefined) target = 0;
    clip.scrollToPoint($.NSMakePoint(0, Math.min(target, Math.max(0, Number(UI.componentDocument.frame.size.height) - Number(clip.bounds.size.height)))));
    UI.componentScroll.reflectScrolledClipView(clip);
}
function startJob(kind) {
    cancelReview();
    var key = UI.model.reviewKey();
    if (!UI.model.key()) return;
    var directory = UI.transport + '/' + ObjC.unwrap($.NSUUID.UUID.UUIDString);
    var fileManager = $.NSFileManager.defaultManager;
    var attrs = $.NSMutableDictionary.alloc.init;
    attrs.setObjectForKey($(448), $.NSFilePosixPermissions); // 0700
    if (!fileManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(directory, false, attrs, Ref())) {
        throw new Error('Could not create a private session directory.');
    }
    var output = directory + '/output.txt';
    attrs.setObjectForKey($(384), $.NSFilePosixPermissions); // 0600
    if (!fileManager.createFileAtPathContentsAttributes(output, $.NSData.data, attrs)) throw new Error('Could not create session output.');
    var handle = $.NSFileHandle.fileHandleForWritingAtPath(output);
    var input = $.NSPipe.pipe;
    var task = $.NSTask.alloc.init;
    task.launchPath = '/bin/bash';
    var jobArguments = [UI.root + '/src/cli.sh', kind === 'review' ? 'review-session' : kind === 'repair-review' ? 'repair-session' : 'verify', '--with', UI.model.key()];
    if (UI.model.parts.some(function (part) { return part.kind === 'preference' && UI.model.chosen[part.id]; })) {
        var choices = directory + '/preferences.json';
        if (!fileManager.createFileAtPathContentsAttributes(choices, data(JSON.stringify(UI.model.preferenceRequest())), attrs)) throw new Error('Could not preserve preference choices for review.');
        jobArguments.push('--preferences-file', choices);
    }
    task.arguments = jobArguments;
    task.standardInput = input;
    task.standardOutput = handle;
    task.standardError = handle;
    UI.job = { task: task, input: input.fileHandleForWriting, handle: handle, directory: directory, output: output,
        kind: kind, key: key, token: '', ready: false, changes: 0, finished: false, repair: kind === 'repair-review' };
    task.launch;
    if (kind === 'verify') UI.job.input.closeFile;
    if (kind === 'review') resetResults();
    UI.results[kind === 'repair-review' ? 'review' : kind] = { level: 'busy', label: 'Checking' };
    UI.output = '';
    UI.summary = kind === 'repair-review' ? 'Preparing recommended fixes…' : kind === 'review' ? 'Checking this Mac…' : 'Checking your setup…';
    status(kind === 'repair-review' ? 'Checking available fixes…' : kind === 'review' ? 'Reviewing…' : 'Verifying…', 'busy');
    controls();
    renderOutput();
}
function selectedPreferenceGroups() {
    return UI.model.parts.filter(function (part) { return part.kind === 'preference' && UI.model.chosen[part.id]; }).map(function (part) { return part.id; });
}
function commitPreferences(values) {
    var selected = selectedPreferenceGroups();
    var desired = PreferenceModel.desired(UI.model.settings, selected, { version: 1, values: values });
    var next = UI.model.preferenceValues.filter(function (row) { return selected.indexOf(row.id.split('-')[0]) < 0; });
    desired.forEach(function (row) {
        var setting = UI.model.settings.filter(function (item) { return item.id === row.id; })[0];
        if (JSON.stringify(row.choice) === JSON.stringify(setting.choice)) return;
        var value = { id: row.id, mode: row.choice.mode };
        if (row.choice.mode === 'set') value.value = row.choice.value;
        next.push(value);
    });
    if (UI.model.setPreferenceValues(next)) selectionChanged();
}
var UTILITIES = [
    { title: 'Saved configuration…', kind: 'saved' },
    { title: 'Clean up temporary files…', kind: 'cleanup' },
    { title: 'Remove old saved configs…', kind: 'remove' },
    { title: 'Open Dark Terminal profile', file: 'Mac Tweak Dark.terminal' },
    { title: 'Open Light Terminal profile', file: 'Mac Tweak Light.terminal' },
    { title: 'Login & background apps', url: 'x-apple.systempreferences:com.apple.LoginItems-Settings.extension', note: 'Choose which apps may open at login or run in the background. macOS controls these approvals.' },
    { title: 'Accessibility permissions', url: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility', note: 'Enable only the helper you selected, then start it again. Rebuilding may require removing its old entry and adding the rebuilt app.' },
    { title: 'Spotlight results & privacy', url: 'x-apple.systempreferences:com.apple.Spotlight-Settings.extension', note: 'Choose search categories, app actions and search privacy here. Search index contents are specific to this Mac.' },
    { title: 'Keyboard shortcuts & modifiers', url: 'x-apple.systempreferences:com.apple.Keyboard-Settings.extension', note: 'Windows keyboard swaps Ctrl and Command on destination keyboards. Alt stays Option; Dock & gestures adds Alt+Tab and the Windows-key launcher.' },
    { title: 'All System Settings', url: 'x-apple.systempreferences:', note: 'Hardware, accounts, networking, privacy, power and other OS-managed choices remain available in System Settings.' }
];
function nativeSettingsURL(action,available){
    var url=action.url;
    if(action.fallback){
        try{var directory='/System/Applications/System Settings.app/Contents/Resources',files=ObjC.deepUnwrap($.NSFileManager.defaultManager.contentsOfDirectoryAtPathError(directory,Ref())).filter(function(name){return /^Sidebar.*\.plist$/.test(name);}),ids='';
            if(typeof available==='string')ids=available;else files.forEach(function(name){var bytes=$.NSData.dataWithContentsOfFile(directory+'/'+name),value=$.NSPropertyListSerialization.propertyListWithDataOptionsFormatError(bytes,0,Ref(),Ref());ids+=JSON.stringify(ObjC.deepUnwrap(value));});
            if(ids.indexOf(action.fallback.split(':')[1].split('?')[0])>=0&&ids.indexOf(action.url.split(':')[1].split('?')[0])<0)url=action.fallback;
        }catch(_){}
    }
    if(!/^x-apple\.systempreferences:/.test(url))throw new Error('Unsupported System Settings link.');return url;
}
function nativeSettingsAdapter(){
    return {now:function(){return Number($.NSProcessInfo.processInfo.systemUptime)*1000;},
        open:function(url){return !!$.NSWorkspace.sharedWorkspace.openURL($.NSURL.URLWithString(url));},
        inspect:function(){
            var apps=$.NSRunningApplication.runningApplicationsWithBundleIdentifier('com.apple.systempreferences'),pid=0,ready=false;
            for(var i=0;i<Number(apps.count);i++){var app=apps.objectAtIndex(i);if(!app.terminated){pid=Number(app.processIdentifier);ready=!!app.finishedLaunching;break;}}
            var windows=ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(1|16,0)))||[];
            ready=ready&&windows.some(function(row){var b=row.kCGWindowBounds;return Number(row.kCGWindowOwnerPID)===pid&&Number(row.kCGWindowLayer)===0&&Number(row.kCGWindowAlpha)>0.01&&b&&Number(b.Width)>200&&Number(b.Height)>200;});
            return {pid:pid,ready:ready,safe:Presentation.safe()};
        }};
}
function cancelSettingsNavigation(){
    if(!UI)return;if(UI.settingsTimer){UI.settingsTimer.invalidate;UI.settingsTimer=null;}
    if(UI.settingsRouter)UI.settingsRouter.cancel();
    if(UI.settingsActivity){Activity.end();UI.settingsActivity=null;}
}
function pollSettingsNavigation(){
    if(!UI.settingsRouter||!UI.settingsRouter.pending())return;
    try{if(UI.settingsRouter.poll())cancelSettingsNavigation();}catch(error){cancelSettingsNavigation();throw error;}
}
function openNativeSettings(url){
    if(UI.settingsRouter&&UI.settingsRouter.pending())return;
    if(!UI.settingsRouter)UI.settingsRouter=SettingsNavigation.create(nativeSettingsAdapter());
    if(!UI.settingsRouter.open(url))return;
    UI.settingsActivity=Activity.begin('Loading current screen-saver settings…',UI.preferenceSheet?UI.preferenceSheet.panel:UI.window,0);
    if(UI.cleaned||!UI.settingsRouter.pending()){cancelSettingsNavigation();return;}
    UI.settingsTimer=$.NSTimer.timerWithTimeIntervalTargetSelectorUserInfoRepeats(0.1,UI.controller,'settingsNavigationPoll:',null,true);
    [$.NSDefaultRunLoopMode,$.NSModalPanelRunLoopMode].forEach(function(mode){$.NSRunLoop.currentRunLoop.addTimerForMode(UI.settingsTimer,mode);});
}
function runUtility(index) {
    var row = UTILITIES[index], home = ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('HOME'));
    if (!row || UI.job && UI.job.kind === 'apply' && UI.job.task.running) return;
    if (row.kind === 'saved') { showSavedFiles(); return; }
    if (row.kind === 'cleanup' || row.kind === 'remove') { showMaintenance(row.kind); return; }
    if (row.url) {
        var information = $.NSAlert.alloc.init; information.messageText = row.title; information.informativeText = row.note;
        information.addButtonWithTitle('Open settings'); information.addButtonWithTitle('Cancel');
        if (runAlert(information) === 1000) $.NSWorkspace.sharedWorkspace.openURL($.NSURL.URLWithString(row.url));
    } else if (row.file) {
        var profile = Project.layout(home).config + '/profiles/' + (Project.storage(home)==='macos-setup'?row.file.replace('Mac Tweak','Mac Setup'):row.file);
        if (!$.NSFileManager.defaultManager.fileExistsAtPath(profile)) { status('Select Terminal profiles, then Review and Apply first.', 'warning'); return; }
        $.NSWorkspace.sharedWorkspace.openURL($.NSURL.fileURLWithPath(profile));
    }
}
function infoLabel(text,x,y,width,height,size,weight,secondary){
    // Sheet labels use native dynamic colors and do not retain global painters.
    var field=$.NSTextField.labelWithString(text);field.frame=$.NSMakeRect(x,y,width,height);
    field.font=$.NSFont.systemFontOfSizeWeight(size,weight||$.NSFontWeightRegular);
    field.textColor=secondary?$.NSColor.secondaryLabelColor:$.NSColor.labelColor;field.cell.wraps=true;field.selectable=true;return field;
}
function infoPanel(title,text){
    var editor={panel:$.NSPanel.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(0,0,600,360),1,$.NSBackingStoreBuffered,false)};
    editor.panel.title=title;nativeWindowChrome(editor.panel);editor.panel.releasedWhenClosed=false;var content=editor.panel.contentView;
    content.addSubview(infoLabel(title,28,304,544,30,21,$.NSFontWeightSemibold));
    content.addSubview(infoLabel(text,28,80,544,204,14));
    var close=actionButton('Close','closeInfo:',466,22,106);close.keyEquivalent='\u001b';content.addSubview(close);Hovers.sync(content);return editor;
}
function showInfo(title,text){var editor=infoPanel(title,text,false);UI.window.beginSheetCompletionHandler(editor.panel,function(){});var response=runPanelModal(editor.panel);UI.window.endSheetReturnCode(editor.panel,response);Hovers.clear(editor.panel.contentView);editor.panel.orderOut(null);}
function aboutPanel(){
    var metadata=JSON.parse(readText(UI.root+'/src/app/metadata.json')),editor={metadataRows:[]};
    editor.path=infoLabel(Project.layout(ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('HOME'))).config,144,96,392,24,12);
    editor.path.font=$.NSFont.monospacedSystemFontOfSizeWeight(12,$.NSFontWeightRegular);editor.path.cell.lineBreakMode=$.NSLineBreakByCharWrapping;
    var pathHeight=Math.max(24,Math.ceil(Number(editor.path.cell.cellSizeForBounds($.NSMakeRect(0,0,392,1000)).height)/16)*16),extra=pathHeight-24;
    editor.panel=$.NSPanel.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(0,0,560,324+extra),1,$.NSBackingStoreBuffered,false);
    var content=editor.panel.contentView;editor.panel.title='About '+metadata.name;nativeWindowChrome(editor.panel);editor.panel.releasedWhenClosed=false;
    var image=$.NSImageView.alloc.initWithFrame($.NSMakeRect(24,236+extra,64,64));image.image=$.NSImage.alloc.initWithContentsOfFile(UI.root+'/src/gui/assets/MacTweak.icns');content.addSubview(image);
    editor.heading=infoLabel(metadata.name,104,268+extra,432,32,27,$.NSFontWeightSemibold);content.addSubview(editor.heading);
    content.addSubview(infoLabel('Version '+metadata.version,104,240+extra,432,22,13,$.NSFontWeightRegular,true));
    function row(title,value,y){var name=infoLabel(title,24,y+extra,108,24,13,$.NSFontWeightMedium,true),field=infoLabel(value,144,y+extra,392,24,13);content.addSubview(name);content.addSubview(field);editor.metadataRows.push(name);return field;}
    row('System','macOS '+metadata.minimumMacOS+' or later · Apple Silicon & Intel',192);
    row('License',metadata.license+' · Heroicons by Tailwind Labs (MIT)',160);
    editor.repositoryLabel=row('Repository','brucerry/mac-tweak ↗',128);editor.repositoryLabel.textColor=$.NSColor.linkColor;
    var repository=actionButton('','openRepository:',144,126+extra,392);repository.frame=$.NSMakeRect(144,126+extra,392,28);repository.transparent=true;repository.bordered=false;repository.setAccessibilityLabel('Open GitHub repository');repository.toolTip=metadata.repository;content.addSubview(repository);
    var pathTitle=infoLabel('Saved settings',24,96+extra,108,24,13,$.NSFontWeightMedium,true);content.addSubview(pathTitle);editor.metadataRows.push(pathTitle);
    editor.path.frame=$.NSMakeRect(144,96,392,pathHeight);content.addSubview(editor.path);
    content.addSubview(infoLabel(metadata.copyright,24,62,512,18,11,$.NSFontWeightRegular,true));
    var close=actionButton('Close','closeInfo:',430,16,106);close.keyEquivalent='\u001b';content.addSubview(close);editor.panel.appearance=UI.window.appearance;Hovers.sync(content);return editor;
}
function showAbout(){var editor=aboutPanel();UI.window.beginSheetCompletionHandler(editor.panel,function(){});var response=runPanelModal(editor.panel);UI.window.endSheetReturnCode(editor.panel,response);Hovers.clear(editor.panel.contentView);editor.panel.orderOut(null);}
function maintenanceBackend(operation,args) {
    return Activity.capture('/usr/bin/osascript',['-l','JavaScript',UI.root+'/src/maintenance/bridge.js',UI.root+'/src',operation].concat(args||[]),'Loading saved items…',UI.savedSheet?UI.savedSheet.panel:UI.maintenanceSheet?UI.maintenanceSheet.panel:UI.window);
}
function savedParts() {
    return UI.model.parts.concat([{id:'local-bin-path',title:'Shared shell PATH'},{id:'history',title:'Maintenance history'}]);
}
function makeSavedSheet() {
    var parts=savedParts(),selected=UI.model.ids()[0]||parts[0].id;
    return FilesBrowser.create(UI.root,parts,TITLES,selected,UI.controller,maintenanceBackend);
}
function showSavedFiles() {
    if(UI.savedSheet||UI.maintenanceSheet)return;
    var editor=makeSavedSheet();UI.savedSheet=editor;editor.panel.appearance=UI.window.appearance;Hovers.sync(editor.panel.contentView);
    UI.window.beginSheetCompletionHandler(editor.panel,function(){});
    var response=runPanelModal(editor.panel);UI.window.endSheetReturnCode(editor.panel,response);Hovers.clear(editor.panel.contentView);editor.panel.orderOut(null);UI.savedSheet=null;
}
function makeMaintenanceSheet(mode) { return MaintenanceSheet.create(mode,UI.controller,maintenanceBackend,UI.transport,UI.root); }
function showMaintenance(mode) {
    if(UI.savedSheet||UI.maintenanceSheet)return;
    var lock=JSON.parse(maintenanceBackend('lock-status',[]));
    if(lock.state==='stale'){
        var notice=$.NSAlert.alloc.init;notice.messageText='Release an abandoned app lock?';notice.informativeText='The earlier process has exited. Preserve its lock and make cleanup available again. No saved configuration is removed.\n\n'+lock.path;notice.addButtonWithTitle('Release lock');notice.addButtonWithTitle('Later');
        if(runAlert(notice)!==1000)return;maintenanceBackend('release-lock',[lock.token]);
    }
    var editor=makeMaintenanceSheet(mode);UI.maintenanceSheet=editor;editor.panel.appearance=UI.window.appearance;Hovers.sync(editor.panel.contentView);
    if(UI.hostedMaintenance)uxPrepareMaintenance(editor,mode);
    UI.window.beginSheetCompletionHandler(editor.panel,function(){});
    var timer=$.NSTimer.timerWithTimeIntervalTargetSelectorUserInfoRepeats(0.15,UI.controller,'maintenancePoll:',null,true);
    $.NSRunLoop.currentRunLoop.addTimerForMode(timer,$.NSModalPanelRunLoopMode);
    if(UI.uxCancelMode){var probe=$.NSTimer.timerWithTimeIntervalTargetSelectorUserInfoRepeats(0.15,UI.controller,'uxCancelMaintenance:',null,false);$.NSRunLoop.currentRunLoop.addTimerForMode(probe,$.NSModalPanelRunLoopMode);}
    var response=runPanelModal(editor.panel);timer.invalidate;MaintenanceSheet.cancel(editor);
    UI.window.endSheetReturnCode(editor.panel,response);Hovers.clear(editor.panel.contentView);editor.panel.orderOut(null);UI.maintenanceSheet=null;
    if(editor.changed&&!UI.cleaned)selectionChanged();
}
function makePreferenceSheet() {
    var selected = selectedPreferenceGroups(), initial={}, guided=UI.model.parts.filter(function(part){return part.kind==='guided'&&UI.model.chosen[part.id];}).map(function(part){return part.id;});
    if(selected.indexOf('screensaver')>=0){try{JSON.parse(Activity.capture('/usr/bin/osascript',['-l','JavaScript',UI.root+'/src/preferences/bridge.js',UI.root+'/src','inspect-group','screensaver'],'Reading screen-saver timing…',UI.window)).forEach(function(row){if(row.state.effective.present)initial[row.id]=row.state.effective.value;});}catch(_){}}
    return PreferenceEditor.create(UI.model.settings, UI.model.parts.filter(function(part){return (part.kind==='preference'||part.kind==='guided')&&UI.model.chosen[part.id];}).map(function(part){return part.id;}),
        selected.length?PreferenceModel.desired(UI.model.settings, selected, UI.model.preferenceRequest()):[], UI.controller,UI.pages,initial);
}
function showPreferences() {
    if (!UI.preferencesButton.enabled || UI.preferenceSheet) return;
    var editor = makePreferenceSheet(); UI.preferenceSheet = editor;
    editor.panel.appearance = UI.window.appearance;Hovers.sync(editor.panel.contentView);
    // JXA needs a callable completion block even when there is no callback work.
    UI.window.beginSheetCompletionHandler(editor.panel, function () {});
    if (UI.smoke === 'preference-editor') {
        var timer = $.NSTimer.timerWithTimeIntervalTargetSelectorUserInfoRepeats(0.15, UI.controller, 'testPreferenceModal:', null, false);
        $.NSRunLoop.currentRunLoop.addTimerForMode(timer, $.NSModalPanelRunLoopMode);
    }
    var response = runPanelModal(editor.panel);
    cancelSettingsNavigation();UI.window.endSheetReturnCode(editor.panel, response); Hovers.clear(editor.panel.contentView);editor.panel.orderOut(null);
    UI.preferenceSheet = null;
    if (response === 1000) commitPreferences(editor.committed);
}
function applyJob(acceptedFixes) {
    if (UI.job && UI.job.changes === 0 && UI.model.matchesReview(UI.job)) { noChanges(UI.job); return; }
    if (!UI.model.matchesReview(UI.job) || !UI.job.task.running) return;
    if (UI.job.requiresConfirmation && acceptedFixes !== true) { presentFixes(UI.job, true); return; }
    UI.job.autoVerify = acceptedFixes === true;
    UI.job.input.writeData(data((UI.job.repair ? 'repair:' : 'apply:') + UI.job.token + '\n'));
    UI.job.input.closeFile;
    UI.job.kind = 'apply';
    UI.job.ready = false;
    UI.results.apply = { level: 'busy', label: 'Applying' };
    UI.results.verify = { level: 'idle', label: 'Not checked' };
    status('Applying… Keep this window open.', 'busy');
    UI.summary = 'Setting things up…';
    controls();
    renderOutput();
}
function manualRecommendations(output) {
    var blockers = output.split('\n').filter(function (line) { return line.indexOf('BLOCKED:') === 0; }).map(friendlyBlocker);
    if (output.indexOf('tig needs Apple Command Line Tools') >= 0) blockers.push('Install Apple Command Line Tools with xcode-select --install and finish Apple’s installer.');
    if (output.indexOf('Symlink conflict:') >= 0) blockers.push('Resolve the named symlink through your existing configuration manager; its destination will be preserved.');
    return blockers.length ? blockers : ['Inspect Details for the requirement that prevented this selection.'];
}
function presentFixes(job, canApply) {
    if (UI.job !== job || UI.model.reviewKey() !== job.key) return;
    job.offerHandled = true;
    if (canApply) job.requiresConfirmation = true;
    var actions = canApply ? State.recommendations(UI.output, TITLES) : manualRecommendations(UI.output);
    var home=ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('HOME'));actions=actions.map(function(action){return action.split(home+'/').join('~/');});
    var alert = Dialogs.recommendation(actions, canApply);
    var decision;
    if (UI.smoke && UI.smoke.indexOf('repair-') === 0) decision = repairSmokeDecision(job, canApply);
    else {
        var response = runAlert(alert);
        decision = canApply ? response === 1000 ? 'apply' : response === 1002 ? 'later' : 'cancel' : 'later';
    }
    if (UI.job !== job || UI.model.reviewKey() !== job.key) return;
    if (decision === 'apply' && canApply) { applyJob(true); return; }
    if (decision === 'later') {
        UI.summary=(canApply?'Ready to apply':'Needs attention')+'\n\n'+actions.map(function(action){return '• '+action;}).join('\n\n');
        status(canApply?'Review saved. Apply when ready.':'Resolve the listed requirements, then review again.',canApply?'success':'warning');controls();renderOutput();return;
    }
    if (canApply) {
        job.cancelled = true; job.ready = false;
        try { job.input.closeFile; } catch (_) {}
        UI.results.review = { level: 'idle', label: 'Cancelled' };
        UI.summary = 'No fixes applied.\n\nReview again when you are ready.';
        status('Fixes cancelled. No changes applied.', 'idle');
        controls(); renderOutput();
    }
}
function noChanges(job) {
    if (job.noChangesHandled) return;
    job.noChangesHandled = true;
    var alert = Dialogs.noChanges();if(UI.model.ids().some(function(id){return UI.pages[id];})){alert.messageText='Configure display choices in Preferences';alert.informativeText='No scripted changes are requested. Open Preferences for display, power and screen protection controls; macOS handles visual selections and protected settings.';}
    if (UI.smoke) { UI.noChangesPrompt = ObjC.unwrap(alert.messageText); return; }
    runAlert(alert);
}
function maybeRecommend(job, result) {
    if(result&&result.manual){job.offerHandled=true;return;}
    if (job.offerHandled || UI.job !== job || UI.model.reviewKey() !== job.key) return;
    if (job.ready && job.changes === 0) { noChanges(job); job.offerHandled = true; if (job.repair) startJob('verify'); return; }
    if (UI.smoke && UI.smoke.indexOf('repair-') !== 0) return;
    if (job.repair && job.ready && job.changes === 0) { job.offerHandled = true; startJob('verify'); return; }
    if (job.ready && job.changes > 0) { presentFixes(job, true); return; }
    if (job.finished && result && (result.level === 'warning' || /^BLOCKED:/m.test(UI.output))) {
        job.offerHandled = true;
        if (job.repair) presentFixes(job, false);
        else startJob('repair-review');
    }
}
function clearJob(job) {
    try { job.input.closeFile; } catch (_) {}
    try { job.handle.closeFile; } catch (_) {}
    $.NSFileManager.defaultManager.removeItemAtPathError(job.directory, Ref());
}
function poll() {
    if(UI.cleaned)return;
    if(UI.waitingForDesktop&&Presentation.safe()){UI.waitingForDesktop=false;restoreMacTweakWindow();}
    if(UI.applet&&!UI.nativeEventsRegistered){
        // Preserve the applet delegate; replace only its post-launch quit event.
        $.NSAppleEventManager.sharedAppleEventManager.setEventHandlerAndSelectorForEventClassAndEventID(UI.controller,'handleNativeQuit:reply:',0x61657674,0x71756974);
        UI.nativeEventsRegistered=true;
    }
    if(UI.smoke&&UI.smoke.indexOf('ux-')===0){uxTick();return;}
    UI.retired = UI.retired.filter(function (job) {
        if (job.task.running) return true;
        clearJob(job); return false;
    });
    var job = UI.job;
    if (!job) return;
    var output = readText(job.output);
    var result = null;
    var match = output.match(/^__MAC_TWEAK_(REVIEW|REPAIR)_READY__\|([^|\n]+)\|(\d+)\|(\d+)$/m);
    if (['review', 'repair-review'].indexOf(job.kind) >= 0 && match && !job.ready && !job.cancelled) {
        job.ready = true; job.token = match[2]; job.changes = Number(match[3]) + Number(match[4]);
        var reviewed = State.result('review', true, output, job.changes, friendlyBlocker, TITLES);
        UI.results.review = reviewed;
        UI.summary = reviewed.summary + (job.changes ? '\n\n' + State.recommendations(output,TITLES).map(function(action){return '• '+action;}).join('\n\n') : '');
        status(reviewed.footer, reviewed.level); controls();
    }
    UI.output = output.replace(/^__MAC_TWEAK_[^\n]*\n?/gm, '');
    if (!job.task.running && !job.finished) {
        job.finished = true;
        if (!job.cancelled) {
            var kind = job.kind === 'repair-review' ? 'review' : job.kind;
            result = State.result(kind, job.task.terminationStatus === 0, output, job.changes, friendlyBlocker, TITLES);
            UI.results[kind] = result; UI.summary = result.summary;
            status(result.footer, result.level);
        }
        controls();
    }
    renderOutput();
    if (job.finished && job.kind === 'apply' && job.task.terminationStatus === 0 && job.autoVerify && !job.followedUp) {
        job.followedUp = true; startJob('verify'); return;
    }
    maybeRecommend(job, result);
    if (UI.job === job) smokeTick(job);
}
function busyClosing() {
    if (UI.maintenanceSheet && UI.maintenanceSheet.phase === 'applying' || UI.job && UI.job.kind === 'apply' && UI.job.task.running) {
        if(UI.smoke&&UI.smoke.indexOf('ux-host-busy-')===0&&MaintenanceIO.make().fixture){UI.hostBusyGuard=true;return true;}
        var alert = $.NSAlert.alloc.init;
        alert.messageText = 'Setup is still running';
        alert.informativeText = 'Keep this window open until the current run finishes. Its progress and results will appear here.';
        alert.addButtonWithTitle('Keep open');
        runAlert(alert);
        return true;
    }
    return false;
}
function cleanup() {
    if(UI.cleaned)return;UI.cleaned=true;
    cancelSettingsNavigation();
    if (UI.timer) UI.timer.invalidate;
    if(UI.hostTimer)UI.hostTimer.invalidate;
    if(UI.nativeRevealTimer)UI.nativeRevealTimer.invalidate;
    if(UI.appletModalPump)UI.appletModalPump.invalidate;
    if (UI.maintenanceSheet) MaintenanceSheet.cancel(UI.maintenanceSheet);
    if (UI.job && UI.job.kind !== 'apply') {
        try { UI.job.input.closeFile; } catch (_) {}
    }
    UI.retired.forEach(function (job) { try { job.input.closeFile; } catch (_) {} });
    $.NSFileManager.defaultManager.removeItemAtPathError(UI.transport, Ref());
    if(UI.smoke&&UI.smoke.indexOf('ux-host-')===0&&UI.hostContext&&UI.hostContext.fixture)MaintenanceIO.write(UI.hostContext.fixture+'/closed-'+Number($.NSProcessInfo.processInfo.processIdentifier)+'.json',{version:1,mode:UI.smoke,transport:UI.transport});
}
function requestMacTweakQuit(){
    if(busyClosing())return false;
    try{if(Number($.NSApp.modalWindow.windowNumber)>0)$.NSApp.stopModalWithCode(1001);}catch(_){}
    cleanup();
    if(UI.hosted){
        // A stop inside a modal callback stops that modal loop. Wait for the
        // modal stack to unwind before stopping the host's main loop instead.
        if(!UI.quitTimer){UI.quitTimer=$.NSTimer.timerWithTimeIntervalTargetSelectorUserInfoRepeats(0.05,UI.controller,'finishQuit:',null,true);$.NSRunLoop.currentRunLoop.addTimerForMode(UI.quitTimer,$.NSDefaultRunLoopMode);$.NSRunLoop.currentRunLoop.addTimerForMode(UI.quitTimer,$.NSModalPanelRunLoopMode);}
        wakeMacTweakLoop();
    }else $.NSApp.terminate(null);
    return true;
}
function wakeMacTweakLoop(){var wake=$.NSEvent.otherEventWithTypeLocationModifierFlagsTimestampWindowNumberContextSubtypeData1Data2($.NSEventTypeApplicationDefined,$.NSMakePoint(0,0),0,0,0,$(),0,0,0);$.NSApp.postEventAtStart(wake,true);}
function finishMacTweakQuit(){
    try{if(Number($.NSApp.modalWindow.windowNumber)>0){$.NSApp.stopModalWithCode(1001);wakeMacTweakLoop();return;}}catch(_){}
    UI.quitTimer.invalidate;$.NSApp.stop(null);wakeMacTweakLoop();
}
function guarded(action) {
    try { action(); } catch (error) {
        if (UI.smoke) {
            console.log('FAIL: native GUI smoke: ' + String(error));
            requestMacTweakQuit();
            return;
        }
        status(String(error), true);
        UI.summary = 'Could not complete this action.\n\n' + String(error);
        renderOutput();
    }
}

ObjC.registerSubclass({
    name: 'MacTweakFlippedView', superclass: 'NSView',
    methods: { isFlipped: { types: ['bool', []], implementation: function () { return true; } } }
});
ObjC.registerSubclass({
    // NSSearchField uses the text-field delegate. Older JXA hosts cannot
    // resolve the base NSControlTextEditingDelegate protocol directly.
    name: 'MacTweakController', superclass: 'NSObject', protocols: ['NSApplicationDelegate', 'NSWindowDelegate', 'NSTextFieldDelegate'],
    methods: {
        'togglePart:': { types: ['void', ['id']], implementation: function (sender) { guarded(function () {
            if (!sender.enabled) return;
            var part = UI.model.parts[Number(sender.tag)];
            if (!UI.model.toggle(part.id, checked(sender))) { sender.state = UI.model.chosen[part.id] ? 1 : 0; return; }
            selectionChanged();
        }); } },
        'choosePreset:': { types: ['void', ['id']], implementation: function (sender) { guarded(function () { choosePreset(sender.tag); }); } },
        'mouseEntered:': {types:['void',['id']],implementation:function(event){guarded(function(){Hovers.event(event,true);});}},
        'mouseExited:': {types:['void',['id']],implementation:function(event){guarded(function(){Hovers.event(event,false);});}},
        'cursorUpdate:': {types:['void',['id']],implementation:function(event){guarded(function(){Hovers.cursor(event);});}},
        'changeTheme:': { types: ['void', ['id']], implementation: function (sender) { guarded(function () { applyTheme(checked(sender)); }); } },
        'utilityAction:': { types: ['void', ['id']], implementation: function (sender) { guarded(function () { runUtility(Number(sender.tag)); }); } },
        'accessibilityChanged:': {types:['void',['id']],implementation:function(){guarded(function(){updateTransparency();});}},
        'showAbout:': {types:['void',['id']],implementation:function(){guarded(showAbout);}},
        'closeInfo:': {types:['void',['id']],implementation:function(){$.NSApp.stopModalWithCode(1000);}},
        'openRepository:': { types: ['void', ['id']], implementation: function () { guarded(function () { $.NSWorkspace.sharedWorkspace.openURL($.NSURL.URLWithString('https://github.com/brucerry/mac-tweak')); }); } },
        'review:': { types: ['void', ['id']], implementation: function () { guarded(function () { startJob('review'); }); } },
        'apply:': { types: ['void', ['id']], implementation: function () { guarded(applyJob); } },
        'verify:': { types: ['void', ['id']], implementation: function () { guarded(function () { startJob('verify'); }); } },
        'details:': { types: ['void', ['id']], implementation: function () { guarded(renderOutput); } },
        'uxCancelMaintenance:': {types:['void',['id']],implementation:function(){guarded(uxCancelMaintenance);}},
        'savedFiles:': {types:['void',['id']],implementation:function(){guarded(showSavedFiles);}},
        'savedGroup:': {types:['void',['id']],implementation:function(sender){guarded(function(){UI.savedSheet.refresh(UI.savedSheet.parts[Number(sender.indexOfSelectedItem)].id);});}},
        'refreshSaved:': {types:['void',['id']],implementation:function(){guarded(function(){UI.savedSheet.refresh(UI.savedSheet.component);});}},
        'savedResource:': {types:['void',['id']],implementation:function(sender){guarded(function(){FilesBrowser.choose(UI.savedSheet,Number(sender.tag));});}},
        'revealSaved:': {types:['void',['id']],implementation:function(){guarded(function(){FilesBrowser.reveal(UI.savedSheet,UI.savedRevealAdapter);});}},
        'closeSaved:': {types:['void',['id']],implementation:function(){$.NSApp.stopModalWithCode(1000);}},
        'maintenanceFilter:': {types:['void',['id']],implementation:function(){guarded(function(){MaintenanceSheet.filter(UI.maintenanceSheet);});}},
        'controlTextDidChange:': {types:['void',['id']],implementation:function(){guarded(function(){if(UI.maintenanceSheet)MaintenanceSheet.filter(UI.maintenanceSheet);});}},
        'maintenanceToggle:': {types:['void',['id']],implementation:function(sender){guarded(function(){MaintenanceSheet.toggle(UI.maintenanceSheet,Number(sender.tag),checked(sender));});}},
        'maintenanceBulk:': {types:['void',['id']],implementation:function(){guarded(function(){MaintenanceSheet.bulk(UI.maintenanceSheet);});}},
        'maintenancePrimary:': {types:['void',['id']],implementation:function(){guarded(function(){MaintenanceSheet.primary(UI.maintenanceSheet);});}},
        'maintenanceRefresh:': {types:['void',['id']],implementation:function(){guarded(function(){MaintenanceSheet.refresh(UI.maintenanceSheet);});}},
        'maintenancePoll:': {types:['void',['id']],implementation:function(){guarded(function(){if(UI.maintenanceSheet){if(UI.hostedMaintenance)uxTick();else MaintenanceSheet.poll(UI.maintenanceSheet);}});}},
        'testHostedMaintenance:': {types:['void',['id']],implementation:function(){guarded(function(){showMaintenance('cleanup');});}},
        'maintenanceClose:': {types:['void',['id']],implementation:function(){if(UI.maintenanceSheet.phase!=='applying'){MaintenanceSheet.cancel(UI.maintenanceSheet);$.NSApp.stopModalWithCode(1000);}}},
        'preferences:': { types: ['void', ['id']], implementation: function () { guarded(showPreferences); } },
        'openSettingsPage:': {types:['void',['id']],implementation:function(sender){guarded(function(){var action=UI.preferenceSheet.guidedActions[Number(sender.tag)];if(!action||!/^x-apple\.systempreferences:/.test(action.url))return;var url=nativeSettingsURL(action);if(UI.smoke){UI.openedSettingsURL=url;return;}openNativeSettings(url);});}},
        'settingsNavigationPoll:': {types:['void',['id']],implementation:function(){guarded(pollSettingsNavigation);}},
        'preferenceGroup:': { types: ['void', ['id']], implementation: function (sender) { guarded(function () { PreferenceEditor.select(UI.preferenceSheet, UI.preferenceSheet.selected[Number(sender.indexOfSelectedItem)]);Hovers.sync(UI.preferenceSheet.panel.contentView); }); } },
        'preferenceMode:': { types: ['void', ['id']], implementation: function (sender) { guarded(function () { PreferenceEditor.update(UI.preferenceSheet, Number(sender.tag)); }); } },
        'preferenceAdjust:': {types:['void',['id']],implementation:function(sender){guarded(function(){var tag=Number(sender.tag);PreferenceEditor.adjust(UI.preferenceSheet,Math.floor(tag/2),tag%2?1:-1);});}},
        'preferenceValue:': { types: ['void', ['id']], implementation: function (sender) { guarded(function () { PreferenceEditor.update(UI.preferenceSheet, Number(sender.tag)); }); } },
        'finishPreferences:': { types: ['void', ['id']], implementation: function () { guarded(function () {
            var values = PreferenceEditor.draft(UI.preferenceSheet);
            PreferenceModel.desired(UI.model.settings, selectedPreferenceGroups(), { version: 1, values: values });
            UI.preferenceSheet.committed = values; $.NSApp.stopModalWithCode(1000);
        }); } },
        'cancelPreferences:': { types: ['void', ['id']], implementation: function () { $.NSApp.stopModalWithCode(1001); } },
        'testPreferenceModal:': { types: ['void', ['id']], implementation: function () { guarded(preferenceModalTest); } },
        'poll:': { types: ['void', ['id']], implementation: function () { guarded(poll); } },
        'hostLifecycle:': {types:['void',['id']],implementation:function(){guarded(hostLifecycle);}},
        'testNativeReveal:': {types:['void',['id']],implementation:function(){guarded(nativeRevealStart);}},
        'checkNativeReveal:': {types:['void',['id']],implementation:function(){guarded(nativeRevealTick);}},
        'pumpAppletEvents:': {types:['void',['id']],implementation:function(){
            if(UI.cleaned||!UI.modalDepth||UI.handlingQuit||UI.pumpingAppletEvents)return;
            UI.pumpingAppletEvents=true;
            try{$.NSRunLoop.currentRunLoop.runModeBeforeDate($.NSDefaultRunLoopMode,$.NSDate.date);}finally{UI.pumpingAppletEvents=false;}
        }},
        'quitApplication:': {types:['void',['id']],implementation:function(){requestMacTweakQuit();}},
        'handleNativeQuit:reply:': {types:['void',['id','id']],implementation:function(event,reply){
            UI.handlingQuit=true;
            try{if(!requestMacTweakQuit())reply.setParamDescriptorForKeyword($.NSAppleEventDescriptor.descriptorWithInt32(-128),0x6572726e);}finally{UI.handlingQuit=false;}
        }},
        'finishQuit:': {types:['void',['id']],implementation:function(){finishMacTweakQuit();}},
        'hostModalReady:': {types:['void',['id']],implementation:function(){guarded(function(){var context=UI.hostContext,pid=UI.hostPID,path=context.fixture+'/lifecycle-'+pid+'.json',report=MaintenanceIO.json(path);report.modal=true;MaintenanceIO.write(path,report);});}},
        'windowShouldClose:': { types: ['bool', ['id']], implementation: function () { return !busyClosing(); } },
        'windowWillClose:': { types: ['void', ['id']], implementation: function () { requestMacTweakQuit(); } },
        'applicationShouldHandleReopen:hasVisibleWindows:': {types:['bool',['id','bool']],implementation:function(){restoreMacTweakWindow();return false;}},
        'applicationShouldTerminate:': { types: ['unsigned long', ['id']], implementation: function () {
            if (busyClosing()) return 0;
            cleanup();
            return 1;
        } }
    }
});

function buildWindow(root, smoke, hosted, applet) {
    UI = { root: root, model: makeModel(root), checkboxes: [], indicators: [], cards: [], accentKeys: [], cardTiles: [], cardIcons: [],
        painters: [], navRows: [], resultRows: {}, retired: [], job: null, output: '', summary: '', statusText: '', statusLevel: 'idle',hosted:!!hosted,applet:!!applet,
        pages:JSON.parse(readText(root+'/src/catalog/settings-pages.json')), renderedText: null, renderedMode: '', renderWrites: 0, smoke: smoke, smokePhase: 0 };
    resetResults();
    UI.tabs = [{ id: 'custom', title: 'Custom' }].concat(UI.model.order.map(function (id) {
        return { id: id, title: id.split('-').map(function (word) { return word[0].toUpperCase() + word.slice(1); }).join(' ') };
    }));
    UI.controller = $.MacTweakController.alloc.init;
    $.NSProcessInfo.processInfo.processName='Mac Tweak';
    var app = $.NSApplication.sharedApplication;
    UI.hostDelegate=app.delegate; // The applet's event receiver must stay alive.
    app.setActivationPolicy(0);if(!applet)app.delegate = UI.controller;
    var environment = $.NSProcessInfo.processInfo.environment;
    if (ObjC.unwrap(environment.objectForKey('MAC_TWEAK_GUI_TEST')) === '1') {
        var appearance = ObjC.unwrap(environment.objectForKey('MAC_TWEAK_GUI_APPEARANCE'));
        if (appearance === 'light' || appearance === 'dark') app.appearance = $.NSAppearance.appearanceNamed(appearance === 'dark' ? $.NSAppearanceNameDarkAqua : $.NSAppearanceNameAqua);
    }
    UI.theme = theme(ObjC.unwrap(app.effectiveAppearance.name).indexOf('Dark') >= 0);
    var centerAlignment = Number($.NSButton.alloc.init.alignment), rightAlignment = centerAlignment === 1 ? 2 : 1;
    var attrs = $.NSMutableDictionary.alloc.init;
    attrs.setObjectForKey($(448), $.NSFilePosixPermissions);
    UI.transport = MaintenanceIO.make().temporary + '/mac-tweak-gui-' + ObjC.unwrap($.NSUUID.UUID.UUIDString);
    if (!$.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(UI.transport, false, attrs, Ref())) throw new Error('Could not create a private GUI session.');
    Activity.init(UI.transport);
    MaintenanceIO.write(UI.transport+'/session.json',{version:1,pid:Number($.NSProcessInfo.processInfo.processIdentifier),uid:MaintenanceIO.make().uid,start:MaintenanceIO.capture('/bin/ps',['-p',String($.NSProcessInfo.processInfo.processIdentifier),'-o','lstart=']).trim()});
    UI.window = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer($.NSMakeRect(0, 0, 1200, 680), 1 | 2 | 4, $.NSBackingStoreBuffered, false);
    $.NSApp.applicationIconImage=$.NSImage.alloc.initWithContentsOfFile(root+'/src/gui/assets/MacTweak.icns');
    UI.window.title = 'Mac Tweak';nativeWindowChrome(UI.window); UI.window.releasedWhenClosed = false; UI.window.restorable = false; UI.window.delegate = UI.controller;
    UI.window.backgroundColor = UI.theme.background;
    var content = UI.window.contentView;
    UI.backdrop=$.NSVisualEffectView.alloc.initWithFrame(content.bounds);UI.backdrop.autoresizingMask=2|16;UI.backdrop.material=$.NSVisualEffectMaterialSidebar;UI.backdrop.blendingMode=$.NSVisualEffectBlendingModeBehindWindow;UI.backdrop.state=$.NSVisualEffectStateFollowsWindowActiveState;content.addSubview(UI.backdrop);updateTransparency();
    $.NSWorkspace.sharedWorkspace.notificationCenter.addObserverSelectorNameObject(UI.controller,'accessibilityChanged:',$.NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification,$());
    UI.repositoryPlate = panel(20, 644, 36, 30, $.NSColor.clearColor, null, 9); content.addSubview(UI.repositoryPlate);
    var repository = actionButton('', 'openRepository:', 20, 642, 38); UI.repository = repository;
    repository.frame = $.NSMakeRect(20, 644, 36, 30); repository.bordered = false;
    repository.image = $.NSImage.alloc.initWithContentsOfFile(root + '/src/gui/assets/github.png');
    repository.image.size = $.NSMakeSize(22, 22); repository.image.template = true;
    repository.setAccessibilityLabel('Open GitHub repository'); repository.toolTip = 'GitHub · brucerry/mac-tweak';
    paint(function (palette) { repository.contentTintColor = palette.text; });
    content.addSubview(repository);
    Hovers.configure(UI.controller,UI.theme);Hovers.track(repository,repositoryHover);
    var info=actionButton('','showAbout:',66,644,36);info.frame=$.NSMakeRect(66,644,36,30);info.bordered=false;info.image=Icons.image('information-circle');info.image.size=$.NSMakeSize(23,23);info.setAccessibilityLabel('About Mac Tweak');info.toolTip='About Mac Tweak';content.addSubview(info);paint(function(palette){info.contentTintColor=palette.text;});
    UI.utilities = $.NSPopUpButton.alloc.initWithFramePullsDown($.NSMakeRect(876, 644, 120, 26), true);
    UI.utilities.addItemWithTitle('Utilities…'); UI.utilities.setAccessibilityLabel('Utilities');
    UTILITIES.forEach(function (row, index) {
        UI.utilities.addItemWithTitle(row.title);
        var item = UI.utilities.menu.itemAtIndex(index + 1);item.image=Icons.menuImage(row.kind==='saved'?'document-text':row.kind==='cleanup'?'trash':row.kind==='remove'?'archive-box':row.file?'terminal':'cog-6-tooth');item.image.size=$.NSMakeSize(18,18);
        // macOS 27 hides menu images in Automatic mode, including valid bitmaps.
        if(item.respondsToSelector('setPreferredImageVisibility:'))item.preferredImageVisibility=1;
        item.target = UI.controller; item.action = 'utilityAction:'; item.tag = index;
    });
    content.addSubview(UI.utilities);
    UI.themeBulb = icon('lightbulb', 1094, 648, 22, UI.theme.muted); content.addSubview(UI.themeBulb);
    UI.themeToggle = $.NSSwitch.alloc.initWithFrame($.NSMakeRect(1128, 646, 52, 28));
    UI.themeToggle.state = UI.theme.dark ? 1 : 0;
    UI.themeToggle.target = UI.controller; UI.themeToggle.action = 'changeTheme:';
    UI.themeToggle.setAccessibilityLabel('Appearance switch');
    UI.themeToggle.setAccessibilityHelp('Change this window between light and dark.');
    content.addSubview(UI.themeToggle); updateBulb();

    content.addSubview(themedPanel(20, 52, 164, 586, 'surface', 'border', 14));
    content.addSubview(label('Customizations', 32, 603, 140, 22, 13, true, false));
    UI.navScroll = $.NSScrollView.alloc.initWithFrame($.NSMakeRect(28, 70, 148, 522));
    UI.navScroll.hasVerticalScroller = true; UI.navScroll.autohidesScrollers = true;

    UI.navScroll.drawsBackground = false; UI.navScroll.contentView.drawsBackground = false;
    UI.navDocument = $.MacTweakFlippedView.alloc.initWithFrame($.NSMakeRect(0, 0, 132, Math.max(UI.tabs.length * 42, 522)));UI.navDocument.wantsLayer=true;
    UI.tabs.forEach(function (tab, index) {
        var view = panel(0, index * 42, 132, 38, UI.theme.surface, null, 9);
        var name=centeredLabel(tab.title,24,19,100,13,false,false),marker=icon('check',8,13,12,UI.theme.accent);view.addSubview(name);view.addSubview(marker);
        var button = actionButton('', 'choosePreset:', 0, 0, 132);
        button.frame = $.NSMakeRect(0, 0, 132, 38); button.bordered = false;button.transparent=true;
        button.alignment = 0; button.font = $.NSFont.systemFontOfSize(13); button.tag = index;
        button.setAccessibilityLabel(tab.title); button.toolTip = tab.title;
        button.cell.lineBreakMode = $.NSLineBreakByTruncatingTail;
        view.addSubview(button); UI.navDocument.addSubview(view);
        UI.navRows.push({ tab: tab, view: view, button: button,label:name,marker:marker });Hovers.track(button,null,function(){var group=UI.model.sections.filter(function(row){return row.id===tab.id;})[0];return group?UI.theme[group.accent]:UI.theme.accent;});
    });
    UI.navScroll.documentView = UI.navDocument; content.addSubview(UI.navScroll);

    UI.componentScroll = $.NSScrollView.alloc.initWithFrame($.NSMakeRect(204, 102, 568, 536));
    UI.componentScroll.hasVerticalScroller = true; UI.componentScroll.autohidesScrollers = true;

    UI.componentScroll.drawsBackground = false; UI.componentScroll.contentView.drawsBackground = false;
    UI.componentDocument = $.MacTweakFlippedView.alloc.initWithFrame($.NSMakeRect(0, 0, 552, 720));UI.componentDocument.wantsLayer=true;
    UI.componentScroll.documentView = UI.componentDocument; content.addSubview(UI.componentScroll);
    UI.sectionOffsets = {};
    var groupY = 8;
    UI.model.sections.forEach(function (group) {
        group.y = groupY; group.start = groupY + 36; group.tint = group.accent;
        UI.sectionOffsets[group.id] = group.y;
        var groupTitle = label(group.title, 4, group.y, 548, 22, 14, true, false);
        paint(function (palette) { groupTitle.textColor = palette[group.tint]; });
        UI.componentDocument.addSubview(groupTitle);
        var position = 0;
        UI.model.parts.forEach(function (part, index) {
            if (UI.model.presets[group.id].indexOf(part.id) < 0) return;
            var tool = group.kind !== 'shell', x = tool ? (position % 2) * 284 : 0;
            var y = group.start + (tool ? Math.floor(position / 2) * 96 : position * 70);
            var width = tool ? 268 : 552, height = tool ? 84 : 60;
            var key = group.accent;
            var tint = UI.theme[key], card = panel(x, y, width, height, UI.theme.surface, UI.theme.border, 14);
            UI.cards[index] = card; UI.accentKeys[index] = key;
            var tile = panel(12, (height - 32) / 2, 32, 32, tint.colorWithAlphaComponent(0.12), null, 10);
            var image = icon(SYMBOLS[part.id], 7, 7, 18, tint);
            tile.addSubview(image); card.addSubview(tile); UI.cardTiles[index] = tile; UI.cardIcons[index] = image;
            var mark = selectionMark(54,(height-20)/2,20);
            var title = centeredLabel(TITLES[part.id] || part.id, 82, tool ? 54 : 30, tool ? 174 : 230, 14, false, false);
            card.addSubview(mark.box); card.addSubview(title);
            UI.indicators[index] = { mark: mark, title: title, state: 0 };
            var caption = centeredLabel(DESCRIPTIONS[part.id], tool ? 82 : 314, 30, tool ? 174 : 222, 11, false, true);
            if (!tool) caption.alignment = rightAlignment;
            card.addSubview(caption);
            // One transparent native switch owns the full hit area and keyboard
            // behavior; the indicator underneath is noninteractive artwork.
            var hit = $.NSButton.alloc.initWithFrame($.NSMakeRect(0, 0, width, height));
            hit.setButtonType(3); hit.title = ''; hit.transparent = true;
            hit.setAccessibilityLabel(TITLES[part.id] || part.id); hit.setAccessibilityHelp(part.changes); hit.toolTip = part.changes;
            hit.tag = index; hit.target = UI.controller; hit.action = 'togglePart:';
            card.addSubview(hit); UI.checkboxes[index] = hit;
            UI.componentDocument.addSubview(card);Hovers.track(hit,null,function(){return UI.theme[key];}); position++;
        });
        groupY += 36 + (group.kind === 'shell' ? position * 70 : Math.ceil(position / 2) * 96) + 18;
    });
    UI.componentDocument.frame = $.NSMakeRect(0, 0, 552, Math.max(480, groupY));
    content.addSubview(label('Unchecking keeps existing setup.', 208, 78, 390, 20, 11, false, true));
    UI.savedFiles = actionButton('Saved files…','savedFiles:',632,68,140); UI.savedFiles.frame=$.NSMakeRect(632,68,140,28);content.addSubview(UI.savedFiles);
    content.addSubview(themedPanel(780, 52, 400, 586, 'surface', 'border', 14));
    UI.selectionTitle = label('', 800, 574, 360, 34, 23, true, false); content.addSubview(UI.selectionTitle);
    ['review', 'verify', 'apply'].forEach(function (kind, index) {
        var view = themedPanel(800 + index * 124, 506, 112, 50, 'inset', null, 9);
        var image = icon('circle', 10, 9, 16, UI.theme.muted);
        var title = centeredLabel(kind[0].toUpperCase() + kind.slice(1), 10, 36, 92, 10, true, true);
        var value = centeredLabel('', 32, 17, 76, 10, false, true);
        view.addSubview(image); view.addSubview(title); view.addSubview(value); content.addSubview(view);
        UI.resultRows[kind] = { icon: image, value: value };
    });
    UI.outputScroll = $.NSScrollView.alloc.initWithFrame($.NSMakeRect(800, 190, 360, 296));
    UI.outputScroll.hasVerticalScroller = true; UI.outputScroll.autohidesScrollers = true;
    UI.outputScroll.drawsBackground = false; UI.outputScroll.borderType = $.NSNoBorder;
    UI.text = $.NSTextView.alloc.initWithFrame($.NSMakeRect(0, 0, 344, 240));
    UI.text.editable = false; UI.text.richText = true; UI.text.textColor = UI.theme.text; UI.text.backgroundColor = UI.theme.inset;
    UI.text.textContainerInset = $.NSMakeSize(12, 12); UI.text.minSize = $.NSMakeSize(0, 240); UI.text.maxSize = $.NSMakeSize(1000000, 1000000);
    UI.text.textContainer.containerSize = $.NSMakeSize(320, 1000000); UI.text.textContainer.widthTracksTextView = true;
    UI.text.verticallyResizable = true; UI.text.horizontallyResizable = false; UI.text.autoresizingMask = 2;
    UI.outputScroll.documentView = UI.text; content.addSubview(UI.outputScroll);
    UI.details = actionButton('Details', 'details:', 800, 146, 98); UI.details.setButtonType(3); content.addSubview(UI.details);
    UI.preferencesButton = actionButton('Preferences…', 'preferences:', 904, 146, 148); content.addSubview(UI.preferencesButton);
    UI.verify = actionButton('Verify', 'verify:', 1070, 146, 90); content.addSubview(UI.verify);
    UI.review = actionButton('Review', 'review:', 800, 97, 172); UI.apply = actionButton('Apply', 'apply:', 988, 97, 172);
    UI.reviewPlate = panel(800, 97, 172, 38, UI.theme.surface, UI.theme.border, 11);
    UI.applyPlate = panel(988, 97, 172, 38, UI.theme.inset, null, 11);
    content.addSubview(UI.reviewPlate); content.addSubview(UI.applyPlate);
    [UI.review, UI.apply].forEach(function (button) {
        button.bordered = false; button.controlSize = $.NSControlSizeLarge;
        button.frame = $.NSMakeRect(button.frame.origin.x, 97, 172, 38); button.font = $.NSFont.boldSystemFontOfSize(14); content.addSubview(button);
    });
    var shield = icon('checkmark.shield', 802, 72, 15, UI.theme.teal);
    paint(function (palette) { shield.contentTintColor = palette.teal; }); content.addSubview(shield);
    content.addSubview(centeredLabel('Existing files are backed up.', 824, 79.5, 330, 11, false, true));
    UI.statusIcon = icon('circle', 20, 15, 18, UI.theme.muted); content.addSubview(UI.statusIcon);
    UI.status = centeredLabel('', 46, 24, 1090, 12, false, true); content.addSubview(UI.status);
    UI.spinner = $.NSProgressIndicator.alloc.initWithFrame($.NSMakeRect(20, 6, 1160, 4));
    UI.spinner.style = $.NSProgressIndicatorStyleBar;UI.spinner.indeterminate=true; UI.spinner.displayedWhenStopped = false; content.addSubview(UI.spinner);
    var menu = $.NSMenu.alloc.init, item = $.NSMenuItem.alloc.init, applicationMenu = $.NSMenu.alloc.init;
    var quitItem=applicationMenu.addItemWithTitleActionKeyEquivalent('Quit Mac Tweak','quitApplication:','q');quitItem.target=UI.controller;item.submenu = applicationMenu; menu.addItem(item); app.mainMenu = menu;
    UI.summary = summary(); status('Choose a customization or select individual items.', 'idle'); controls(); renderOutput();
    UI.timer = $.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(0.2, UI.controller, 'poll:', null, true);
    UI.window.center;
    if(Presentation.safe()){UI.window.makeKeyAndOrderFront(null);if(!smoke)app.activateIgnoringOtherApps(false);}else{UI.waitingForDesktop=true;UI.window.orderOut(null);}
    Hovers.sync(content);
    if(smoke&&smoke.indexOf('ux-')===0){uxStart();}
    else if (smoke) {
        if (smoke === 'preference-layout' || smoke === 'preference-editor') preferenceLayoutStart();
        else if (smoke.indexOf('repair-preferences-') === 0) {
            var preference = smoke === 'repair-preferences-keep' ? 'screenshots' : 'dock';
            UI.model.toggle(preference, true);
            if (preference === 'dock') UI.model.setPreferenceValues([{ id: 'dock-size', mode: 'set', value: 64 }]);
            selectionChanged(); UI.componentScroll.contentView.scrollToPoint($.NSMakePoint(0, 240)); startJob('verify');
        }
        else if (smoke === 'interaction') interactionSmokeStart();
        else {
            if (smoke === 'cancel') choosePreset(1);
            else {
                var id = ['verify-versions', 'repair-versions'].indexOf(smoke) >= 0 ? 'node' : smoke === 'verify-reused' ? 'uv' : 'aliases';
                UI.model.toggle(id, true); UI.checkboxes[UI.model.parts.map(function (part) { return part.id; }).indexOf(id)].state = 1; selectionChanged();
            }
            var fromVerify = smoke.indexOf('verify-') === 0 || ['repair-pending', 'repair-cancel', 'repair-details', 'repair-stale', 'repair-selection'].indexOf(smoke) >= 0;
            startJob(fromVerify ? 'verify' : 'review');
        }
    }
    if(!hosted)app.run;
    return hosted?'MAC_TWEAK_UI_READY':undefined;
}
function smokeTick(job) {
    if (!UI.smoke) return;
    if (UI.smoke === 'preference-editor') { preferenceEditorTick(job); return; }
    if (UI.smoke === 'preference-layout') {
        if (UI.smokePhase > 0) return;
        if (job.finished && !job.ready) throw new Error('Preference layout review failed: ' + UI.output);
        if (job.ready) {
            UI.smokePhase = 1;
            var position = Number(UI.componentScroll.contentView.bounds.origin.y), writes = UI.renderWrites;
            poll(); poll();
            if (Number(UI.componentScroll.contentView.bounds.origin.y) !== position || UI.renderWrites !== writes) throw new Error('Preference component scrolling must remain stable during idle polling.');
            console.log('PASS: native preference cards, ordered sections, System scope, whole-card activation, Custom behavior, and stable scrolling');
            $.NSApp.terminate(null);
        }
        return;
    }
    if (UI.smoke.indexOf('repair-') === 0) { repairSmokeTick(job); return; }
    if (UI.smoke === 'interaction') { interactionSmokeTick(job); return; }
    if (['blocked', 'stale', 'apply-failure', 'verify-pending', 'verify-versions', 'verify-reused', 'verify-health'].indexOf(UI.smoke) >= 0) {
        failureSmokeTick(job);
        return;
    }
    if (job.finished && job.task.terminationStatus !== 0) throw new Error('GUI smoke backend failed: ' + UI.output);
    if (UI.smoke === 'cancel' && job.ready) {
        if (!UI.apply.enabled) throw new Error('Apply should be enabled for the current review.');
        UI.details.state = 1;
        renderOutput();
        if (ObjC.unwrap(UI.text.string).indexOf('Selection:') < 0) throw new Error('Detailed output must use native checkbox state.');
        UI.details.state = 0;
        if (UI.smokePhase === 0) {
            var promptIndex = UI.model.parts.map(function (part) { return part.id; }).indexOf('prompt');
            var promptButton = UI.checkboxes[promptIndex];
            promptButton.state = 0;
            UI.controller.togglePart(promptButton);
            if (UI.apply.enabled) throw new Error('Changing choices must invalidate Apply.');
            promptButton.state = 1;
            UI.controller.togglePart(promptButton);
            if (!UI.model.chosen.prompt) throw new Error('Checking a native checkbox must select its component.');
            promptButton.state = 0;
            UI.controller.togglePart(promptButton);
            if (UI.model.activeTab !== 'terminal') throw new Error('Editing a scoped preset must keep its tab.');
            UI.smokePhase = 1;
            startJob('review');
        } else {
            console.log('PASS: native GUI review, selection invalidation, and cancellation');
            $.NSApp.terminate(null);
        }
    } else if (UI.smoke === 'apply') {
        if (UI.smokePhase === 0 && job.ready) {
            if (UI.results.review.level !== 'success') throw new Error('Successful review must show a green result.');
            UI.smokePhase = 1; applyJob();
        }
        else if (UI.smokePhase === 1 && job.finished && job.kind === 'apply') {
            if (UI.results.apply.level !== 'success') throw new Error('Successful application must show a green result.');
            UI.smokePhase = 2; startJob('verify');
        }
        else if (UI.smokePhase === 2 && job.finished && job.kind === 'verify') {
            if (UI.results.verify.level !== 'success') throw new Error('Successful verification must show a green result.');
            console.log('PASS: native GUI reviewed application and verification');
            $.NSApp.terminate(null);
        }
    }
}
function preferenceLayoutStart() {
    if (UI.cards.length !== UI.model.parts.length || UI.cards.some(function (card) { return !card; })) throw new Error('All selectable cards must be rendered.');
    choosePreset(UI.tabs.map(function (tab) { return tab.id; }).indexOf('system'));
    if (UI.model.ids().length !== UI.model.presets.system.length || !UI.checkboxes[0].enabled || !UI.checkboxes[0].contentTintColor.isEqual(UI.theme.muted)) throw new Error('System must mute unrelated choices while keeping them clickable.');
    var origin = Number(UI.componentScroll.contentView.bounds.origin.y);
    UI.model.parts.forEach(function (part, index) {
        if (UI.model.presets.system.indexOf(part.id) < 0) return;
        var card = UI.cards[index], top = Number(card.frame.origin.y);
        if (top < UI.sectionOffsets.system || top + Number(card.frame.size.height) > Number(UI.componentDocument.frame.size.height)) throw new Error('System cards must be reachable in their section.');
        var button = UI.checkboxes[index]; button.performClick(UI.controller);
        if (UI.model.chosen[part.id]) throw new Error('Whole-card activation must toggle the selected preference once.');
        button.performClick(UI.controller);
    });
    var dark = UI.theme.dark; applyTheme(!dark);
    if (Number(UI.componentScroll.contentView.bounds.origin.y) !== origin || UI.model.ids().length !== UI.model.presets.system.length) throw new Error('Theme switching must preserve preference choices and scrolling.');
    applyTheme(dark);
    choosePreset(0);
    if (UI.model.ids().length !== UI.model.presets.system.length) throw new Error('Entering Custom must retain preference selection.');
    UI.model.toggle('dock', true); selectionChanged();
    UI.componentScroll.contentView.scrollToPoint($.NSMakePoint(0, origin));
    choosePreset(0);
    if (!UI.model.chosen.dock || Number(UI.componentScroll.contentView.bounds.origin.y) !== origin) throw new Error('Re-clicking Custom must retain selection and scroll.');
    choosePreset(UI.tabs.map(function (tab) { return tab.id; }).indexOf('system'));
    startJob('review');
}
function preferenceModalTest() {
    if (UI.smoke !== 'preference-editor' || !UI.preferenceSheet) throw new Error('Preference modal test is not active.');
    var editor = UI.preferenceSheet;
    if (editor.values.length !== UI.model.settings.filter(function (setting) { return editor.selected.indexOf(setting.component) >= 0; }).length) throw new Error('Every selected preference must remain in the editor draft.');
    if (UI.modalTestDecision !== 'unchanged') {
        PreferenceEditor.select(editor, 'dock');
        var size = editor.rows.filter(function (row) { return row.setting.id === 'dock-size'; })[0];
        size.mode.selectItemAtIndex(0); UI.controller.preferenceMode(size.mode);
        if (size.control.enabled) throw new Error('Keep current must disable the value control.');
        size.mode.selectItemAtIndex(2); UI.controller.preferenceMode(size.mode);
        size.control.doubleValue = 63.7; UI.controller.preferenceValue(size.control);
        if (!size.control.enabled || ObjC.unwrap(size.number.stringValue) !== '64') throw new Error('Numeric controls must display bounded integral values.');
        PreferenceEditor.select(editor, 'finder');
        var view = editor.rows.filter(function (row) { return row.setting.id === 'finder-view'; })[0];
        view.mode.selectItemAtIndex(1); UI.controller.preferenceMode(view.mode);
        if (view.control.enabled) throw new Error('Use macOS default must disable explicit values.');
        PreferenceEditor.select(editor, 'dock');
        var recent = editor.rows.filter(function (row) { return row.setting.id === 'dock-recent'; })[0];
        if (Number(recent.control.indexOfSelectedItem) !== 1) throw new Error('Stored false must display Off.');
        recent.control.selectItemAtIndex(0); UI.controller.preferenceValue(recent.control);
        var draft = JSON.stringify(PreferenceEditor.draft(editor)), dark = UI.theme.dark;
        applyTheme(!dark);
        if (JSON.stringify(PreferenceEditor.draft(editor)) !== draft) throw new Error('Theme switching must preserve editor drafts.');
        applyTheme(dark);
    }
    if (UI.modalTestDecision === 'cancel') UI.controller.cancelPreferences(null);
    else UI.controller.finishPreferences(null);
}
function preferenceEditorTick(job) {
    if (!job.ready || UI.editorInTest) return;
    UI.editorInTest = true;
    try {
        if (UI.smokePhase === 0) {
            var key = UI.model.reviewKey(), token = job.token;
            UI.modalTestDecision = 'cancel'; showPreferences();
            if (UI.job !== job || UI.model.reviewKey() !== key || job.token !== token || !UI.apply.enabled) throw new Error('Editor cancellation must preserve values and reviewed approval.');
            UI.modalTestDecision = 'done'; showPreferences();
            if (UI.job || UI.apply.enabled || UI.model.ids().length !== UI.model.presets.system.length || UI.model.reviewKey() === key) throw new Error('Committed preference edits must invalidate review without changing selected cards.');
            UI.smokePhase = 1; startJob('review');
        } else {
            var retained = UI.model.reviewKey(), current = UI.job;
            if (UI.output.indexOf('real 64') < 0) throw new Error('Edited values must reach the backend review.');
            UI.modalTestDecision = 'unchanged'; showPreferences();
            if (UI.model.reviewKey() !== retained || UI.job !== current || !UI.apply.enabled) throw new Error('Done on an unchanged editor must retain review.');
            choosePreset(0);
            UI.model.chosen = {}; controls();
            if (UI.preferencesButton.enabled) throw new Error('Preferences must disable without selected groups.');
            UI.model.toggle('dock', true); selectionChanged();
            var onlyDock = makePreferenceSheet();
            if (onlyDock.rows.length !== UI.model.settings.filter(function (setting) { return setting.component === 'dock'; }).length || onlyDock.rows.some(function (row) { return row.setting.component !== 'dock'; })) throw new Error('The editor must show only selected preference groups.');
            onlyDock.panel.orderOut(null);
            console.log('PASS: native preference sheet modes, typed controls, actual Done/Cancel, review invalidation, unchanged drafts, theme preservation, and selected-group scope');
            $.NSApp.terminate(null);
        }
    } finally { UI.editorInTest = false; }
}
function repairSmokeDecision(job, canApply) {
    UI.repairDecisions = UI.repairDecisions || [];
    UI.repairDecisions.push({ automatic: canApply, token: job.token });
    if (UI.smoke.indexOf('repair-preferences-') === 0) return preferenceRepairDecision(job, canApply);
    if (UI.smoke === 'repair-manual') {
        if (canApply) throw new Error('Redirected startup files must not offer automatic application.');
        return 'cancel';
    }
    if (!canApply) throw new Error('Expected an automatic repair plan: ' + UI.output);
    if (UI.smoke === 'repair-cancel') return 'cancel';
    if (UI.smoke === 'repair-details' && UI.repairDecisions.length === 1) return 'later';
    if (UI.smoke === 'repair-stale') {
        var home = ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('HOME'));
        if (!data('# changed after repair review\n').writeToFileAtomically(home + '/.zshrc', true)) throw new Error('Could not prepare stale repair.');
    }
    if (UI.smoke === 'repair-selection') {
        choosePreset(1);
        if (UI.job || UI.model.activeTab !== 'terminal') throw new Error('Selection changes must retire the proposed repair.');
        console.log('PASS: native GUI repair selection change prevents application');
        $.NSApp.terminate(null);
        return 'cancel';
    }
    return 'apply';
}
function repairSmokeTick(job) {
    if (UI.smoke.indexOf('repair-preferences-') === 0) { preferenceRepairTick(job); return; }
    if (UI.smoke === 'repair-details' && job.ready && UI.repairDecisions && UI.repairDecisions.length === 1) {
        if (checked(UI.details) || !UI.apply.enabled || !job.requiresConfirmation || ObjC.unwrap(UI.apply.title)!=='Apply') throw new Error('Later must retain the review and stable Apply label without forcing Details.');
        applyJob(); return;
    }
    if (!job.finished) return;
    if (UI.smoke === 'repair-cancel' && job.cancelled) {
        if (UI.apply.enabled) throw new Error('Cancelled repair must not remain approved.');
        console.log('PASS: native GUI repair cancellation without application'); $.NSApp.terminate(null); return;
    }
    if (UI.smoke === 'repair-manual' && job.repair) {
        if (!UI.repairDecisions || UI.repairDecisions[0].automatic || UI.apply.enabled) throw new Error('Manual requirements need instructions without Apply fixes.');
        console.log('PASS: native GUI manual repair guidance without automatic application'); $.NSApp.terminate(null); return;
    }
    if (job.kind === 'apply' && job.task.terminationStatus !== 0) {
        if (UI.smoke !== 'repair-stale' || UI.output.indexOf('Target changed after preview:') < 0) throw new Error('Repair application failed: ' + UI.output);
        console.log('PASS: native GUI stale repair approval rejected'); $.NSApp.terminate(null); return;
    }
    if (job.kind === 'verify' && UI.results.apply.level === 'success') {
        if (job.task.terminationStatus !== 0 || UI.results.verify.level !== 'success') throw new Error('Automatic repair verification failed: ' + UI.output);
        if (UI.smoke === 'repair-details' && (UI.repairDecisions.length !== 2 || UI.repairDecisions[0].token !== UI.repairDecisions[1].token)) throw new Error('Details must preserve the same reviewed repair.');
        console.log('PASS: native GUI ' + UI.smoke + ' acceptance, application, and automatic verification'); $.NSApp.terminate(null);
    }
}
function editPreferenceFixture(action) {
    var environment = $.NSProcessInfo.processInfo.environment;
    var path = ObjC.unwrap(environment.objectForKey('MAC_TWEAK_PREFERENCE_STORE'));
    if (!UI.smoke || ObjC.unwrap(environment.objectForKey('MAC_TWEAK_PREFERENCES_TEST')) !== '1' || !path) throw new Error('Preference smoke requires an injected store.');
    var value = JSON.parse(readText(path)); action(value);
    if (!data(JSON.stringify(value)).writeToFileAtomically(path, true)) throw new Error('Could not update preference fixture.');
}
function preferenceRepairDecision(job, canApply) {
    if (UI.smoke === 'repair-preferences-policy') {
        if (canApply) throw new Error('Managed preference policy must not offer automatic application.');
        return 'cancel';
    }
    if (!canApply) throw new Error('Expected supported preference fixes: ' + UI.output);
    if (State.recommendations(UI.output, TITLES).join(' ').indexOf('Dock preferences') < 0) throw new Error('The popup must recommend the preference fixes.');
    if (UI.smoke === 'repair-preferences-cancel') return 'cancel';
    if (UI.smoke === 'repair-preferences-details' && UI.repairDecisions.length === 1) return 'later';
    if (UI.smoke === 'repair-preferences-stale') editPreferenceFixture(function (value) { value.values['dock-size'] = { present: true, type: 'real', value: 72 }; });
    return 'apply';
}
function preferenceRepairTick(job) {
    if (UI.smoke === 'repair-preferences-details' && job.ready && UI.repairDecisions && UI.repairDecisions.length === 1) {
        if (!UI.apply.enabled || checked(UI.details)) throw new Error('Later must retain the preference plan without forcing Details.');
        applyJob(); return;
    }
    if (!job.finished) return;
    if (UI.smoke === 'repair-preferences-keep') {
        if (job.kind !== 'verify' || job.task.terminationStatus !== 0 || UI.repairDecisions) throw new Error('Keep current must verify without offering changes.');
        console.log('PASS: native preference Keep current verifies without writes or a fix popup'); $.NSApp.terminate(null); return;
    }
    if (UI.smoke === 'repair-preferences-cancel' && job.cancelled) {
        if (UI.apply.enabled) throw new Error('Cancelled preference fixes must not remain approved.');
        console.log('PASS: native preference fix cancellation without writes'); $.NSApp.terminate(null); return;
    }
    if (UI.smoke === 'repair-preferences-policy' && job.repair) {
        if (!UI.repairDecisions || UI.repairDecisions[0].automatic || UI.apply.enabled) throw new Error('Preference policy needs manual guidance.');
        console.log('PASS: native preference policy guidance without an automatic apply button'); $.NSApp.terminate(null); return;
    }
    if (job.kind === 'apply' && job.task.terminationStatus !== 0) {
        if (UI.results.apply.level !== 'error') throw new Error('Failed preference writes must show a red result.');
        if (UI.smoke === 'repair-preferences-stale' && UI.output.indexOf('Preference changed after preview') >= 0) {
            console.log('PASS: native preference stale approval rejected without setup writes'); $.NSApp.terminate(null); return;
        }
        if (UI.smoke !== 'repair-preferences-failure' || UI.smokePhase !== 0) throw new Error('Unexpected preference application failure: ' + UI.output);
        editPreferenceFixture(function (value) { delete value.failSync; });
        UI.smokePhase = 1; startJob('review'); return;
    }
    if (job.kind === 'verify' && UI.results.apply.level === 'success') {
        if (job.task.terminationStatus !== 0 || UI.results.verify.level !== 'success' || UI.summary.indexOf('Saved preferences verified') < 0) throw new Error('Preference fixes must verify the saved edited values automatically.');
        if (UI.smoke === 'repair-preferences-details' && (UI.repairDecisions.length !== 2 || UI.repairDecisions[0].token !== UI.repairDecisions[1].token)) throw new Error('Details must retain the same preference token.');
        console.log('PASS: native preference ' + UI.smoke + ' uses edited values, accepted fixes, saved-state results, and automatic verification');
        $.NSApp.terminate(null);
    }
}
function interactionSmokeStart() {
    function check(value, message) { if (!value) throw new Error(message); }
    choosePreset(1);
    check(UI.checkboxes[0].enabled && UI.checkboxes[0].contentTintColor.isEqual(UI.theme.muted), 'Unrelated cards must be gray and clickable.');
    UI.checkboxes[0].performClick(UI.controller);
    check(UI.model.activeTab === 'custom' && UI.model.chosen.node && UI.model.chosen.aliases, 'Gray-card activation must preserve choices and enter Custom.');
    choosePreset(UI.tabs.map(function (tab) { return tab.id; }).indexOf('full'));
    UI.checkboxes[0].performClick(UI.controller);
    check(UI.model.activeTab === 'custom' && !UI.model.chosen.node && UI.model.chosen.aliases, 'Deselecting Full must preserve other choices in Custom.');
    choosePreset(1);
    var retained = UI.model.key(); choosePreset(0);
    check(UI.model.key() === retained, 'Entering Custom must retain choices.');
    UI.model.chosen = {}; controls();
    var aliases = UI.checkboxes[UI.model.parts.map(function (part) { return part.id; }).indexOf('aliases')];
    if (!UI.window.makeFirstResponder(aliases)) throw new Error('Cards must accept keyboard focus.');
    aliases.performClick(UI.controller);
    check(UI.model.key() === 'aliases', 'Native whole-card activation must toggle exactly once.');
    aliases.performClick(UI.controller); check(!UI.model.chosen.aliases, 'Repeated activation must deselect.');
    aliases.performClick(UI.controller);
    if (UI.tabs.length > 20) check(Number(UI.navDocument.frame.size.height) > Number(UI.navScroll.contentView.bounds.size.height), 'Many tabs must scroll.');
    check(UI.model.sections.every(function (section, index) { return UI.tabs[index + 1].id === section.id; }), 'Tabs and sections must share order.');
    check(UI.accentKeys.every(function (accent, index) { return accent === UI.model.sections.filter(function (section) { return UI.model.presets[section.id].indexOf(UI.model.parts[index].id) >= 0; })[0].accent; }), 'Cards must share their section accent.');
    startJob('review');
}
function interactionSmokeTick(job) {
    if (!job.ready || UI.smokePhase !== 0) return;
    UI.smokePhase = 1;
    var token = job.token, key = UI.model.key(), dark = UI.theme.dark;
    Hovers.set(ObjC.unwrap(UI.repository.identifier),true); Hovers.set(ObjC.unwrap(UI.repository.identifier),false);
    if(UI.job!==job||job.token!==token||UI.model.key()!==key||UI.repositoryHovered)throw new Error('Hover must preserve the retained review.');
    UI.themeToggle.state = dark ? 0 : 1; UI.controller.changeTheme(UI.themeToggle);
    if (UI.theme.dark === dark || UI.job !== job || job.token !== token || UI.model.key() !== key || !UI.apply.enabled) throw new Error('Theme switching must preserve review and selection.');
    choosePreset(0);
    if (!UI.apply.enabled || UI.job !== job) throw new Error('Re-clicking Custom must preserve reviewed approval.');
    UI.details.state = 1; renderOutput();
    var clip = UI.outputScroll.contentView;
    clip.scrollToPoint($.NSMakePoint(0, 70)); UI.outputScroll.reflectScrolledClipView(clip);
    var origin = Number(clip.bounds.origin.y), writes = UI.renderWrites;
    poll(); poll();
    if (UI.renderWrites !== writes || Number(clip.bounds.origin.y) !== origin) throw new Error('Idle polling must not repaint or move details.');
    var handle = $.NSFileHandle.fileHandleForWritingAtPath(job.output);
    handle.seekToEndOfFile; handle.writeData(data('\nNew test progress\n')); handle.closeFile;
    poll();
    if (UI.renderWrites !== writes + 1 || Number(clip.bounds.origin.y) !== origin) throw new Error('New progress must preserve a scrolled reading position.');
    UI.themeToggle.state = dark ? 1 : 0; UI.controller.changeTheme(UI.themeToggle);
    if (Number(clip.bounds.origin.y) !== origin || !UI.apply.enabled) throw new Error('Theme switching must preserve detail position and approval.');
    console.log('PASS: native GUI scoped tabs, Custom transitions, many-tab navigation, theme switch, approval, and stable details');
    $.NSApp.terminate(null);
}
function failureSmokeTick(job) {
    if (job.ready && job.kind === 'review') {
        if (UI.smoke === 'stale') {
            var home = ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('HOME'));
            if (!data('# changed after graphical review\n').writeToFileAtomically(home + '/.zshrc', true)) {
                throw new Error('Could not prepare stale-review test.');
            }
        }
        applyJob();
        return;
    }
    if (!job.finished) return;
    if (UI.smokePhase === 0) {
        if (['verify-pending', 'verify-versions', 'verify-reused'].indexOf(UI.smoke) >= 0) {
            if (UI.results.verify.level !== 'warning' || checked(UI.details) || UI.apply.enabled || !UI.review.enabled) throw new Error('Incomplete setup must show an actionable orange warning.');
            if (UI.smoke === 'verify-pending' && UI.summary.indexOf('Not applied yet') < 0) throw new Error('Pending setup needs a clear explanation.');
            if (UI.smoke === 'verify-versions' && UI.summary.indexOf('Installed: 24.22.0') < 0) throw new Error('Version warnings must show the installed version.');
            if (UI.smoke === 'verify-reused' && (UI.summary.indexOf('Working: uv') < 0 || UI.summary.indexOf('Shell PATH') < 0)) throw new Error('Compatible tools must report working health separately from pending integration.');
            console.log('PASS: native GUI ' + UI.smoke + ' warning and labeled orange result');
            $.NSApp.terminate(null); return;
        }
        var expected = { blocked: 'Symlink conflict:', stale: 'Target changed after preview:',
            'apply-failure': 'FAILED [', 'verify-health': 'FAIL [aliases]' }[UI.smoke];
        if (job.task.terminationStatus === 0 || UI.output.indexOf(expected) < 0) {
            throw new Error('Expected GUI failure result for ' + UI.smoke + ': ' + UI.output);
        }
        if (UI.apply.enabled || !UI.review.enabled || !UI.verify.enabled || !UI.checkboxes[0].enabled) {
            throw new Error('Failed runs must disable Apply and restore review, verification, and selection controls.');
        }
        if (UI.smoke === 'blocked') {
            if (UI.results.review.level !== 'warning') throw new Error('Preflight blockers must use a labeled warning result.');
            if (checked(UI.details) || ObjC.unwrap(UI.text.string).indexOf('resolve target ') < 0 ||
                ObjC.unwrap(UI.text.string).indexOf('.zshrc') < 0) {
                throw new Error('Preflight blockers must be visible in the concise result.');
            }
        } else {
            if(UI.results[job.kind].level!=='error'||checked(UI.details))throw new Error('Failures must stay visible without forcing Details.');
            UI.details.state=1;renderOutput();if(ObjC.unwrap(UI.text.string).indexOf(UI.smoke==='stale'?expected:'Failed')<0)throw new Error('Explicit Details must retain the failed activity.');UI.details.state=0;renderOutput();
        }
        console.log('PASS: native GUI ' + UI.smoke + ' result, details, and recovery controls');
        if (UI.smoke !== 'apply-failure') { $.NSApp.terminate(null); return; }
        // The transport fixture fails one edit once, allowing a real review/retry.
        UI.smokePhase = 1;
        startJob('review');
    } else if (UI.smokePhase === 1 && job.kind === 'apply') {
        if (job.task.terminationStatus !== 0) throw new Error('GUI retry failed: ' + UI.output);
        UI.smokePhase = 2;
        startJob('verify');
    } else if (UI.smokePhase === 2 && job.kind === 'verify') {
        if (job.task.terminationStatus !== 0 || UI.summary.indexOf('Verification passed.') < 0) {
            throw new Error('GUI retry verification failed: ' + UI.output);
        }
        console.log('PASS: native GUI recovery by fresh review, retry, and verification');
        $.NSApp.terminate(null);
    }
}
function uxBitmap(view,name) {
    var path=MaintenanceIO.env('MAC_TWEAK_VISUAL_DIR');if(!path)return;
    var context=MaintenanceIO.make();if(!context.fixture||path.indexOf(context.fixture+'/')!==0)throw new Error('Visual tests require a private fixture path.');
    var window=view.window;view.wantsLayer=true;window.orderFrontRegardless;window.displayIfNeeded;view.layoutSubtreeIfNeeded;view.displayIfNeeded;
    $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.05));
    var rep=view.bitmapImageRepForCachingDisplayInRect(view.bounds),context=$.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep);
    $.NSGraphicsContext.saveGraphicsState;$.NSGraphicsContext.setCurrentContext(context);
    (view===UI.window.contentView||view===UI.window.contentView.superview?UI.theme.background:$.NSColor.windowBackgroundColor).setFill;$.NSRectFill(view.bounds);
    view.layer.renderInContext(context.CGContext);$.NSGraphicsContext.restoreGraphicsState;
    var png=rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG,$({}));
    if(!png.writeToFileAtomically(path+'/'+name+'.png',true))throw new Error('Cannot render owned native view.');
}
function uxFrame(window,name){
    window.makeKeyAndOrderFront(null);window.displayIfNeeded;
    if(window.titlebarAppearsTransparent||Number(window.titleVisibility)!==Number($.NSWindowTitleVisible)||Number(window.backgroundColor.alphaComponent)<0.99)throw new Error('Native title bar must have a readable opaque backing.');
    var frame=window.contentView.superview;if(Number(frame.bounds.size.height)<=Number(window.contentView.bounds.size.height))throw new Error('Frame capture must include the title bar.');uxBitmap(frame,name);
}
function inheritedScrollers(root){
    var count=0;function visit(view){if(view.isKindOfClass($.NSScrollView)){if(Number(view.scrollerStyle)!==Number($.NSScroller.preferredScrollerStyle))throw new Error('Scrollbars must inherit the system style.');count++;}var children=view.subviews;for(var i=0;i<Number(children.count);i++)visit(children.objectAtIndex(i));}visit(root);return count;
}
function uxResponsiveness(){
    var scans=Hovers.scans(),painters=UI.painters.length,document=UI.componentScroll.documentView;
    var start=Date.now();for(var i=0;i<100;i++)poll();var idle=Date.now()-start;
    if(Hovers.scans()!==scans)throw new Error('Idle polling must not rediscover hover controls.');
    for(var i=0;i<3;i++){var about=aboutPanel();if(Number(about.heading.font.pointSize)<25||!about.path.selectable||Number(about.repositoryLabel.frame.origin.x)!==Number(about.path.frame.origin.x))throw new Error('Info typography, value alignment and selectable paths must be readable.');Hovers.clear(about.panel.contentView);about.panel.orderOut(null);}
    if(UI.painters.length!==painters)throw new Error('Closed Info windows must not retain theme painters.');
    var max=Number(UI.componentDocument.frame.size.height)-Number(UI.componentScroll.contentView.bounds.size.height),origin=Number(UI.componentScroll.contentView.bounds.origin.y);
    start=Date.now();for(var i=0;i<30;i++){UI.componentScroll.contentView.scrollToPoint($.NSMakePoint(0,(i%10)*max/9));UI.componentScroll.reflectScrolledClipView(UI.componentScroll.contentView);UI.window.displayIfNeeded;}var scroll=(Date.now()-start)/30;
    UI.componentScroll.contentView.scrollToPoint($.NSMakePoint(0,origin));var key=UI.model.reviewKey(),dark=UI.theme.dark;
    start=Date.now();applyTheme(!dark);var first=Date.now()-start;start=Date.now();applyTheme(dark);var second=Date.now()-start;
    if(!UI.componentScroll.documentView.isEqual(document)||Number(UI.componentScroll.contentView.bounds.origin.y)!==origin||UI.model.reviewKey()!==key)throw new Error('Appearance changes must retain documents, positions and review identity.');
    if(!UI.componentDocument.wantsLayer||!UI.navDocument.wantsLayer)throw new Error('Scrolling documents must be layer-backed.');
    UI.cards.forEach(function(card,i){var frame=UI.indicators[i].mark.box.frame;if(Math.abs(Number(frame.origin.y)+Number(frame.size.height)/2-Number(card.frame.size.height)/2)>0.5)throw new Error('Checkboxes must align with the full multiline card and centered icon.');if(Number(card.borderWidth)!==0||(!UI.indicators[i].mark.check.hidden)!==!!UI.model.chosen[UI.model.parts[i].id])throw new Error('Cards must be borderless with explicit selection marks.');});
    console.log('PERF: 100 idle polls '+idle+' ms, zero hover scans; scroll submission '+scroll.toFixed(2)+' ms/frame; theme update '+first+'/'+second+' ms (render scheduling, not display latency)');
}
function uxHoverGeometry(button){
    var id=ObjC.unwrap(button.identifier);Hovers.set(id,true);
    var children=button.superview.subviews,plate=null;
    for(var i=0;i<Number(children.count);i++){var child=children.objectAtIndex(i);if(ObjC.unwrap(child.identifier)===id+'-surface')plate=child;}
    if(!plate||plate.hidden||!$.NSEqualRects(plate.frame,button.frame))throw new Error('Hover must follow the current control frame after results and refresh.');
    uxBitmap(button.superview,'close-hover-'+Number(button.frame.origin.x));Hovers.set(id,false);
}
function uxScreenSaverControls(editor){
    var modelKey=UI.model.reviewKey();PreferenceEditor.select(editor,'screensaver');
    function idleRow(){return editor.rows.filter(function(row){return row.setting.id==='screensaver-idle';})[0];}
    function seconds(){return PreferenceEditor.draft(editor).filter(function(row){return row.id==='screensaver-idle';})[0].value;}
    var idle=idleRow();if(ObjC.unwrap(idle.label.stringValue)!=='Custom delay (min)'||!idle.decrease.hidden||!idle.increase.hidden)throw new Error('Custom delay controls must remain hidden for Keep current.');
    idle.mode.selectItemAtIndex(2);idle.control.doubleValue=5;PreferenceEditor.update(editor,0);idle.increase.performClick(UI.controller);
    if(seconds()!==360)throw new Error('Plus must increase the draft by one minute.');idle.decrease.performClick(UI.controller);if(seconds()!==300)throw new Error('Minus must decrease the draft by one minute.');
    PreferenceEditor.select(editor,'power');PreferenceEditor.select(editor,'screensaver');idle=idleRow();if(seconds()!==300)throw new Error('Switching preference groups must preserve the custom delay draft.');
    idle.control.doubleValue=0;PreferenceEditor.update(editor,0);if(idle.decrease.enabled||ObjC.unwrap(idle.number.stringValue)!=='Never')throw new Error('Zero means Never and disables minus.');idle.decrease.performClick(UI.controller);if(seconds()!==0)throw new Error('Minus must not underflow.');idle.increase.performClick(UI.controller);if(seconds()!==60)throw new Error('Plus must work from Never.');
    idle.control.doubleValue=180;PreferenceEditor.update(editor,0);if(idle.increase.enabled)throw new Error('The maximum disables plus.');idle.increase.performClick(UI.controller);if(seconds()!==10800)throw new Error('Plus must not overflow.');
    idle.mode.selectItemAtIndex(0);PreferenceEditor.update(editor,0);if(!idle.increase.hidden||!idle.decrease.hidden||idle.increase.enabled||idle.decrease.enabled||UI.model.reviewKey()!==modelKey)throw new Error('Keep current and editing an uncommitted draft must preserve the model.');
    idle.mode.selectItemAtIndex(2);idle.control.doubleValue=5;PreferenceEditor.update(editor,0);uxBitmap(editor.panel.contentView,'screen-saver-custom-delay');
    uxSettingsNavigation();
}
function uxSettingsNavigation(){
    var clock=0,state={pid:0,ready:false,safe:true},opened=[],url='x-apple.systempreferences:com.apple.Wallpaper-Settings.extension?ScreenSaver';
    UI.settingsRouter=SettingsNavigation.create({now:function(){return clock;},inspect:function(){return state;},open:function(value){opened.push(value);return true;}});
    openNativeSettings(url);
    if(!UI.settingsActivity||!UI.settingsActivity.bar.indeterminate||!UI.settingsTimer||opened.length!==1||opened[0].indexOf('?')>=0)throw new Error('Cold navigation must show progress and open Wallpaper first.');
    openNativeSettings(url);if(opened.length!==1)throw new Error('Pending native navigation must coalesce repeated clicks.');
    state={pid:42,ready:true,safe:true};UI.controller.settingsNavigationPoll(null);clock=1200;UI.controller.settingsNavigationPoll(null);
    if(UI.settingsActivity||UI.settingsTimer||opened.length!==2||opened[1]!==url)throw new Error('Completed navigation must stop progress and open only the hydrated chooser.');
    openNativeSettings(url);if(UI.settingsActivity||opened.length!==3||opened[2]!==url)throw new Error('Warm navigation must open the chooser directly.');
    state={pid:43,ready:false,safe:true};openNativeSettings(url);cancelSettingsNavigation();clock=9000;state.ready=true;UI.controller.settingsNavigationPoll(null);
    if(UI.settingsActivity||UI.settingsTimer||opened.length!==4)throw new Error('Cancelling must stop progress and prevent late native navigation.');
    UI.settingsRouter=null;
}
function uxCompactAbout(editor){
    if(Number(editor.panel.contentView.frame.size.width)!==560||Number(editor.panel.contentView.frame.size.height)>=440)throw new Error('Info should be compact, with room for the fixture path.');
    editor.metadataRows.forEach(function(row,index){if(index&&Number(editor.metadataRows[index-1].frame.origin.y)-Number(row.frame.origin.y)!==32)throw new Error('Info metadata rows must have equal spacing.');});
    if(Number(editor.path.cell.cellSizeForBounds($.NSMakeRect(0,0,392,1000)).height)>Number(editor.path.frame.size.height))throw new Error('The complete selectable saved path must fit.');
}
function uxBulkSelection(editor){
    var original=editor.rows;
    // Selection-only rows exercise the native controls; restore real inventory before review.
    editor.rows=[{id:'bulk-visible',title:'Visible item',path:'/fixture/visible',reason:'test',bytes:1024,blocked:'',requires:['bulk-dependency']},{id:'bulk-hidden',title:'Other item',path:'/fixture/other',reason:'test',bytes:2048,blocked:''},{id:'bulk-protected',title:'Visible protected',path:'/fixture/protected',reason:'test',bytes:999999,blocked:'Protected'},{id:'bulk-dependency',title:'Dependency',path:'/fixture/dependency',reason:'test',bytes:4096,blocked:''}];
    editor.chosen={'bulk-hidden':true};editor.filter.stringValue='visible';MaintenanceSheet.filter(editor);editor.bulk.performClick(UI.controller);
    if(!editor.chosen['bulk-visible']||!editor.chosen['bulk-dependency']||!editor.chosen['bulk-hidden']||editor.chosen['bulk-protected']||ObjC.unwrap(editor.bulk.title)!=='Deselect all shown')throw new Error('Filtered bulk selection must retain hidden choices, include dependencies and protect blocked rows.');
    if(ObjC.unwrap(editor.message.stringValue).indexOf('3 selected · 7.0 KB')<0)throw new Error('Selected size must include filtered choices and required dependencies, excluding protected rows.');
    var selectedCard=editor.cards.filter(function(card){return card.row.id==='bulk-visible';})[0];if(selectedCard.mark.check.hidden||Number(selectedCard.box.borderWidth)!==0)throw new Error('Selected maintenance cards need an obvious filled checkmark without a border.');
    editor.bulk.performClick(UI.controller);if(editor.chosen['bulk-visible']||!editor.chosen['bulk-hidden'])throw new Error('Filtered deselection must preserve hidden choices.');
    if(ObjC.unwrap(editor.message.stringValue).indexOf('6.0 KB')<0)throw new Error('Deselecting visible rows must update the hidden selection size.');
    editor.rows[1].bytes=null;MaintenanceSheet.filter(editor);if(ObjC.unwrap(editor.message.stringValue).indexOf('size unavailable')<0)throw new Error('Unavailable sizes must not appear as a known zero.');
    editor.show.selectItemAtIndex(3);editor.filter.stringValue='';MaintenanceSheet.filter(editor);if(editor.bulk.enabled)throw new Error('Protected-only lists must disable bulk selection.');
    editor.show.selectItemAtIndex(0);editor.rows=original;editor.chosen={};MaintenanceSheet.filter(editor);
    console.log('PASS: native filtered bulk selection/deselection, hidden choices, dependencies and protected rows; acceptance remains separate');
}
function restoreMacTweakWindow(){if(!Presentation.safe()){UI.waitingForDesktop=true;return;}UI.window.deminiaturize(null);UI.window.makeKeyAndOrderFront(null);if(!UI.smoke)$.NSApp.activateIgnoringOtherApps(false);UI.reopenRequested=true;}
function hostLifecycle(){
    Presentation.testDesktop();
    // Keep idle lifecycle polling free of subprocesses and nested task waits.
    var context=UI.hostContext,pid=UI.hostPID;
    if(UI.hostPhase===0){
        UI.hostPhase=1;MaintenanceIO.write(context.fixture+'/lifecycle-'+pid+'.json',{version:1,pid:pid,mode:UI.smoke,transport:UI.transport,selection:UI.model.key(),window:Number(UI.window.windowNumber),applicationClass:ObjC.unwrap($.NSApp.className),hosted:UI.hosted,applet:UI.applet,registered:!!UI.nativeEventsRegistered,path:ObjC.unwrap($.NSRunningApplication.currentApplication.executableURL.path)});
        if(UI.smoke==='ux-host-close'){console.log('PASS: delayed native Close dispatched');UI.window.performClose(null);}
        else if(UI.smoke==='ux-host-menu-quit'){console.log('PASS: delayed native menu Quit dispatched');$.NSApp.mainMenu.itemAtIndex(0).submenu.performActionForItemAtIndex(0);}
        else if(UI.smoke==='ux-host-busy-close'){
            var task=$.NSTask.alloc.init,pipe=$.NSPipe.pipe;task.launchPath='/bin/cat';task.standardInput=pipe;task.standardOutput=$.NSFileHandle.fileHandleWithNullDevice;task.standardError=$.NSFileHandle.fileHandleWithNullDevice;task.launch;
            UI.job={kind:'apply',task:task};UI.window.performClose(null);if(!UI.hostBusyGuard||UI.cleaned||!UI.window.visible)throw new Error('Active work must veto Close.');UI.hostBusyGuard=false;$.NSApp.mainMenu.itemAtIndex(0).submenu.performActionForItemAtIndex(0);if(!UI.hostBusyGuard||UI.cleaned)throw new Error('Active work must veto menu Quit.');pipe.fileHandleForWriting.closeFile;task.waitUntilExit;UI.job=null;console.log('PASS: native busy Close and menu Quit veto; waiting for idle Close');
        }
        else if(UI.smoke==='ux-host-busy-external'){
            var task=$.NSTask.alloc.init,pipe=$.NSPipe.pipe;task.launchPath='/bin/cat';task.standardInput=pipe;task.standardOutput=$.NSFileHandle.fileHandleWithNullDevice;task.standardError=$.NSFileHandle.fileHandleWithNullDevice;task.launch;UI.hostInput=pipe.fileHandleForWriting;UI.hostTask=task;UI.job={kind:'apply',task:task};var ready=MaintenanceIO.json(context.fixture+'/lifecycle-'+pid+'.json');ready.busy=true;MaintenanceIO.write(context.fixture+'/lifecycle-'+pid+'.json',ready);
        }
        else if(UI.smoke==='ux-host-modal-quit'){
            var editor=infoPanel('Lifecycle check','Quit should close this idle sheet and the app.');UI.window.beginSheetCompletionHandler(editor.panel,function(){});var ready=$.NSTimer.timerWithTimeIntervalTargetSelectorUserInfoRepeats(0.1,UI.controller,'hostModalReady:',null,false);$.NSRunLoop.currentRunLoop.addTimerForMode(ready,$.NSModalPanelRunLoopMode);var response=runPanelModal(editor.panel);UI.window.endSheetReturnCode(editor.panel,response);Hovers.clear(editor.panel.contentView);editor.panel.orderOut(null);
        }
        else if(UI.smoke==='ux-host-reopen')UI.window.performMiniaturize(null);
    }else if(UI.smoke==='ux-host-busy-close'){UI.window.performClose(null);}
    else if(UI.smoke==='ux-host-busy-external'&&UI.hostPhase===1&&UI.hostBusyGuard){
        if(UI.cleaned||!UI.window.visible)throw new Error('Active work must veto external Quit.');UI.hostInput.closeFile;UI.hostTask.waitUntilExit;UI.job=null;UI.hostPhase=2;MaintenanceIO.write(context.fixture+'/guarded-'+pid+'.json',{pid:pid,protected:true});console.log('PASS: native external Quit veto during active work');
    }
    else if(UI.smoke==='ux-host-reopen'){
        if(UI.hostPhase===1&&UI.window.miniaturized){var report=MaintenanceIO.json(context.fixture+'/lifecycle-'+pid+'.json');report.minimized=true;MaintenanceIO.write(context.fixture+'/lifecycle-'+pid+'.json',report);UI.hostPhase=2;}
        else if(UI.hostPhase===2&&UI.reopenRequested&&!UI.window.miniaturized){MaintenanceIO.write(context.fixture+'/reopened-'+pid+'.json',{pid:pid,selection:UI.model.key(),window:Number(UI.window.windowNumber)});UI.hostPhase=3;console.log('PASS: native reopen restored the existing selection and window');}
    }
}
function uxStart() {
    var fixtureContext=MaintenanceIO.make();if(!fixtureContext.fixture)throw new Error('Maintenance GUI tests require an isolated fixture.');
    if(UI.smoke==='ux-native-reveal'){$.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(0.3,UI.controller,'testNativeReveal:',null,false);return;}
    if(UI.hosted&&MaintenanceIO.env('MAC_TWEAK_HOSTED_MAINTENANCE_TEST')==='1'&&UI.smoke.indexOf('ux-cleanup-')===0){UI.hostedMaintenance=true;$.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(0.3,UI.controller,'testHostedMaintenance:',null,false);return;}
    if(UI.smoke.indexOf('ux-host-')===0){
        if(UI.smoke==='ux-host-reopen'){UI.model.toggle('aliases',true);selectionChanged();}
        UI.hostContext=fixtureContext;UI.hostPID=Number($.NSProcessInfo.processInfo.processIdentifier);UI.hostPhase=0;UI.hostTimer=$.NSTimer.scheduledTimerWithTimeIntervalTargetSelectorUserInfoRepeats(0.3,UI.controller,'hostLifecycle:',null,true);return;
    }
    if(UI.smoke==='ux-host'){
        var own=$.NSRunningApplication.currentApplication,identity={id:ObjC.unwrap(own.bundleIdentifier),name:ObjC.unwrap(own.localizedName),path:ObjC.unwrap(own.executableURL.path),regular:Number(own.activationPolicy)===0};
        if(identity.id!=='io.github.brucerry.MacTweak'||identity.name!=='Mac Tweak'||!identity.regular)throw new Error('The interactive host must expose the regular Mac Tweak identity.');
        $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.2));UI.window.performMiniaturize(null);
        for(var attempt=0;attempt<40&&!UI.window.miniaturized;attempt++)$.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.05));
        if(!UI.window.miniaturized)throw new Error('The owned Mac Tweak window did not finish minimizing.');UI.window.deminiaturize(null);
        for(var attempt=0;attempt<40&&UI.window.miniaturized;attempt++)$.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.05));
        if(UI.window.miniaturized)throw new Error('The owned window did not finish restoring.');
        console.log('IDENTITY: '+JSON.stringify(identity));console.log('PASS: native Mac Tweak app identity, regular activation, own-window minimize/restore and unchanged helper exclusions');$.NSApp.terminate(null);return;
    }
    if(UI.smoke==='ux-details'){
        uxResponsiveness();
        if(UTILITIES.some(function(row){return row.kind==='helpers';}))throw new Error('Selection-dependent helper startup must be removed.');
        UTILITIES.forEach(function(row,index){var image=UI.utilities.menu.itemAtIndex(index+1).image,bitmap=$.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation),visible=0;
            for(var x=3;x<Number(bitmap.pixelsWide);x+=6)for(var y=3;y<Number(bitmap.pixelsHigh);y+=6)if(Number(bitmap.colorAtXY(x,y).alphaComponent)>0.1)visible++;
            if(UI.utilities.menu.itemAtIndex(index+1).respondsToSelector('preferredImageVisibility')&&Number(UI.utilities.menu.itemAtIndex(index+1).preferredImageVisibility)!==1)throw new Error('macOS 27 menu images must explicitly request visibility.');
            if(!image.valid||Number(image.size.width)!==18||visible<2)throw new Error('Utility menu icons must have visible raster pixels: '+row.title);
        });
        if(Number(UI.status.frame.origin.y)+Number(UI.status.frame.size.height)>=52||Number(UI.componentScroll.frame.size.height)<530)throw new Error('The compact footer must reclaim body space without overlapping status.');

        var oldOutput=UI.output,oldSummary=UI.summary;
        UI.output='Selection: dock aliases\ndock: Set selected preferences\nPREFERENCE_CHANGE [dock] Dock size: real 32 -> real 64\nPREFERENCE_CHANGE [dock] Auto-hide: boolean false -> boolean true\n--- before\n+++ after\n-old setting\n+new setting\nFAIL [aliases] Example check needs attention\nRun records and recovery information: ~/Library/Application Support/Mac Tweak\n';
        UI.details.state=1;renderOutput();var readable=ObjC.unwrap(UI.text.string),added=readable.indexOf('  + 64');
        if(added<0||!UI.text.textStorage.attributesAtIndexEffectiveRange(added,Ref()).objectForKey($.NSForegroundColorAttributeName).isEqual(UI.theme.green))throw new Error('Details must have readable before/after values and semantic colors.');uxBitmap(UI.window.contentView,'readable-activity');
        var recommendations=State.recommendations(UI.output,TITLES),offer=Dialogs.recommendation(recommendations,true);if(ObjC.unwrap(offer.buttons.objectAtIndex(0).title)!=='Apply'||ObjC.unwrap(offer.buttons.objectAtIndex(2).title)!=='Later'||recommendations.join(' ').indexOf('32 → 64')<0)throw new Error('The popup must disclose concrete changes with Apply and Later.');offer.layout;offer.window.makeKeyAndOrderFront(null);uxBitmap(offer.window.contentView,'concrete-recommendations');offer.window.orderOut(null);
        UI.output+='\n'+Array(30).join('Activity continues\n')+'PREFERENCE_';renderOutput();var clip=UI.outputScroll.contentView;clip.scrollToPoint($.NSMakePoint(0,70));UI.outputScroll.reflectScrolledClipView(clip);var reading=Number(clip.bounds.origin.y);UI.output+='CHANGE [dock] Dock size: real 64 -> real 72';renderOutput();if(Number(clip.bounds.origin.y)!==reading)throw new Error('Completing a partial log line must retain reading position.');var beforeTheme=UI.theme.dark;applyTheme(!beforeTheme);if(Number(clip.bounds.origin.y)!==reading)throw new Error('Recoloring activity must retain its reading position.');applyTheme(beforeTheme);
        UI.details.state=0;UI.output=oldOutput;UI.summary=oldSummary;renderOutput();
        if(!UI.savedFiles.enabled||UI.model.ids().length)throw new Error('Saved files must be available without selection or Review.');
        var editor=makeSavedSheet();if(inheritedScrollers(UI.window.contentView)<3||inheritedScrollers(editor.panel.contentView)<2)throw new Error('Main and saved-detail scrollbars must inherit macOS.');UI.savedSheet=editor;editor.panel.appearance=UI.window.appearance;Hovers.sync(editor.panel.contentView);editor.refresh('aliases');
        if(ObjC.unwrap(editor.text.string).indexOf("alias ll='ls -al'")<0||!editor.reveal.enabled)throw new Error('Existing saved configuration must be permanently reviewable.');
        var savedContent=ObjC.unwrap(editor.text.string),revealed='';UI.savedRevealAdapter=function(path){revealed=path;};editor.reveal.performClick(UI.controller);
        if(revealed!==editor.selected.path||ObjC.unwrap(editor.notice.stringValue)!==''||ObjC.unwrap(editor.text.string)!==savedContent)throw new Error('Reveal must dispatch the selected path while retaining its contents.');
        UI.savedRevealAdapter=function(){throw new Error('The selected file disappeared.');};editor.reveal.performClick(UI.controller);
        if(editor.reveal.enabled||ObjC.unwrap(editor.notice.stringValue).indexOf('disappeared')<0)throw new Error('Reveal failures must be visible and stale paths disabled.');UI.savedRevealAdapter=null;editor.refresh('aliases');

        Hovers.event(null,true);Hovers.cursor(null);updateTransparency(true);uxFrame(UI.window,'window-frame-solid');if(!UI.backdrop.hidden||!UI.window.opaque)throw new Error('Reduce transparency must use a solid background.');updateTransparency(false);if(Number(UI.backdrop.material)!==Number($.NSVisualEffectMaterialSidebar)||Number(UI.theme.surface.alphaComponent)>=0.75)throw new Error('Frosted presentation needs a native sidebar material and translucent surfaces.');uxFrame(UI.window,'window-frame-translucent');if(UI.backdrop.hidden||UI.window.opaque)throw new Error('Enabled transparency must use the native backdrop.');var reduced=!!$.NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceTransparency;updateTransparency(!reduced);UI.controller.accessibilityChanged(null);if(UI.reducedTransparency!==reduced)throw new Error('System display notification must refresh the backdrop.');var about=aboutPanel();uxCompactAbout(about);about.panel.makeKeyAndOrderFront(null);if(!$.NSApp.applicationIconImage||Hovers.count()<30)throw new Error('App icon and interactive hover controls must be installed.');uxBitmap(about.panel.contentView,'about');uxFrame(about.panel,'about-window-frame');Hovers.clear(about.panel.contentView);about.panel.orderOut(null);
        var key=UI.model.reviewKey(),dark=UI.theme.dark;Hovers.set(ObjC.unwrap(UI.repository.identifier),true);
        if(!UI.repositoryHovered||Number(UI.repositoryPlate.borderWidth)!==0||Number(UI.repositoryPlate.fillColor.alphaComponent)<0.09||UI.model.reviewKey()!==key)throw new Error('GitHub hover must use color without a border and preserve choices.');
        Hovers.set(ObjC.unwrap(UI.repository.identifier),false);if(UI.repositoryHovered||Number(UI.repositoryPlate.borderWidth)!==0)throw new Error('Hover exit must restore the icon.');
        UI.themeToggle.state=dark?0:1;UI.controller.changeTheme(UI.themeToggle);
        if(ObjC.unwrap(UI.themeBulb.accessibilityLabel)!==(dark?'Theme bulb off':'Theme bulb on')||UI.model.reviewKey()!==key)throw new Error('Bulb must follow the switch without selection edits.');
        UI.themeToggle.state=dark?1:0;UI.controller.changeTheme(UI.themeToggle);
        uxBitmap(editor.panel.contentView,'saved-files');Hovers.clear(editor.panel.contentView);editor.panel.orderOut(null);UI.savedSheet=null;
        UI.model.preset('display');selectionChanged();UI.componentScroll.contentView.scrollToPoint($.NSMakePoint(0,UI.sectionOffsets.display));uxBitmap(UI.window.contentView,'display-cards');if(!UI.preferencesButton.enabled)throw new Error('Display choices need configuration controls.');var displayEditor=makePreferenceSheet();UI.preferenceSheet=displayEditor;
        ['wallpaper','screensaver','protection','displays','power'].forEach(function(id){PreferenceEditor.select(displayEditor,id);Hovers.sync(displayEditor.panel.contentView);if(!displayEditor.guidedActions.length)throw new Error('Native display controls are missing.');var button=$.NSButton.alloc.init;button.tag=0;UI.controller.openSettingsPage(button);if(UI.openedSettingsURL!==nativeSettingsURL(UI.pages[id].actions[0])||displayEditor.guidedActions.length!==1)throw new Error('Each native Settings group needs its own exact route and no duplicate actions.');if(id==='screensaver'&&Number($.NSProcessInfo.processInfo.operatingSystemVersion.majorVersion)>=26&&UI.openedSettingsURL.indexOf('?ScreenSaver')<0)throw new Error('Modern macOS must open the screen-saver subpage.');uxBitmap(displayEditor.panel.contentView,'display-'+id);uxFrame(displayEditor.panel,'display-'+id+'-frame');});
        uxScreenSaverControls(displayEditor);Hovers.clear(displayEditor.panel.contentView);displayEditor.panel.orderOut(null);UI.preferenceSheet=null;
        var reopened=makeSavedSheet();reopened.refresh('aliases');if(ObjC.unwrap(reopened.text.string).indexOf("alias ll='ls -al'")<0)throw new Error('Saved configuration must survive closing/reopening details.');reopened.panel.orderOut(null);
        choosePreset(UI.tabs.map(function(tab){return tab.id;}).indexOf('full'));uxBitmap(UI.window.contentView,'main');
        var hoverID=ObjC.unwrap(UI.checkboxes[UI.model.parts.map(function(part){return part.id;}).indexOf('prompt')].identifier),beforeHover=UI.model.reviewKey();Hovers.set(hoverID,true);uxBitmap(UI.window.contentView,'card-hover');Hovers.set(hoverID,false);if(UI.model.reviewKey()!==beforeHover)throw new Error('Card hover must preserve selection.');
        UI.componentScroll.contentView.scrollToPoint($.NSMakePoint(0,UI.sectionOffsets.system));uxBitmap(UI.window.contentView,'system-colors');
        UI.componentScroll.contentView.scrollToPoint($.NSMakePoint(0,Math.max(0,Number(UI.componentDocument.frame.size.height)-480)));uxBitmap(UI.window.contentView,'behavior-colors');
        console.log('PASS: native saved paths/content, no-Review availability, reopened details, hover/cursor, unique colors and on/off bulb');$.NSApp.terminate(null);return;
    }
    var mode=UI.smoke.indexOf('ux-remove')===0?'remove':'cleanup';
    if(/-cancel$/.test(UI.smoke)){
        UI.uxCancelMode=true;showMaintenance(mode);
        if(UI.maintenanceSheet)throw new Error('Cancelling the sheet must close it.');
        console.log('PASS: native '+mode+' sheet lists exact paths, starts empty and cancels without acceptance');$.NSApp.terminate(null);return;
    }
    var editor=makeMaintenanceSheet(mode);inheritedScrollers(editor.panel.contentView);UI.maintenanceSheet=editor;editor.panel.appearance=UI.window.appearance;Hovers.sync(editor.panel.contentView);editor.panel.makeKeyAndOrderFront(null);
    uxPrepareMaintenance(editor,mode);
}
function uxPrepareMaintenance(editor,mode){
    uxBulkSelection(editor);
    var index=editor.rows.map(function(row){return row.title;}).indexOf(mode==='cleanup'?'Run staging · 20261026T010000Z-999999':'Old aliases.zsh · 20261026T010000Z-999999');
    if(index<0||editor.primary.enabled)throw new Error('Maintenance must show fixture rows with nothing preselected.');
    editor.buttons[index].performClick(UI.controller);if(!editor.primary.enabled)throw new Error('Selecting an item must enable Review.');
    var chosenId=editor.rows[index].id;editor.filter.stringValue='no-matching-fixture';
    // Deliver the search field's own editing notification through AppKit,
    // exercising its real delegate connection without keyboard interception.
    $.NSNotificationCenter.defaultCenter.postNotificationNameObject('NSControlTextDidChangeNotification',editor.filter);
    if(MaintenanceSheet.visible(editor).length||editor.cards.length||!editor.chosen[chosenId]||!editor.primary.enabled)throw new Error('Native filter editing must refresh cards and preserve selections.');editor.filter.stringValue='';editor.show.selectItemAtIndex(2);MaintenanceSheet.filter(editor);if(MaintenanceSheet.visible(editor).length!==1)throw new Error('Selected filter must show chosen cards.');editor.show.selectItemAtIndex(0);MaintenanceSheet.filter(editor);uxBitmap(editor.panel.contentView,mode+'-inventory');UI.controller.maintenancePrimary(null);
}
function uxCancelMaintenance() {
    var editor=UI.maintenanceSheet;
    if(!UI.uxCancelMode||!editor||editor.phase!=='inventory'||editor.primary.enabled||Object.keys(editor.chosen).some(function(id){return editor.chosen[id];}))throw new Error('Cancellation must begin without accepted items.');
    uxBitmap(editor.panel.contentView,editor.mode+'-cancel');UI.controller.maintenanceClose(null);
}
function nativeRevealStart(){
    Presentation.testDesktop();
    if(!Presentation.safe())throw new Error('Native reveal needs a safe desktop.');
    $.NSApp.activateIgnoringOtherApps(true);
    var editor=makeSavedSheet();UI.savedSheet=editor;editor.refresh('aliases');UI.nativeRevealContent=ObjC.unwrap(editor.text.string);UI.nativeRevealPath=editor.selected.path;
    UI.window.beginSheetCompletionHandler(editor.panel,function(){});UI.nativeRevealDeadline=Date.now()+7000;
    UI.nativeRevealTimer=$.NSTimer.timerWithTimeIntervalTargetSelectorUserInfoRepeats(0.1,UI.controller,'checkNativeReveal:',null,true);$.NSRunLoop.currentRunLoop.addTimerForMode(UI.nativeRevealTimer,$.NSModalPanelRunLoopMode);
    var response=runPanelModal(editor.panel);UI.window.endSheetReturnCode(editor.panel,response);Hovers.clear(editor.panel.contentView);editor.panel.orderOut(null);UI.savedSheet=null;
}
function nativeRevealTick(){
    Presentation.testDesktop();var editor=UI.savedSheet;
    var front=MaintenanceIO.capture('/usr/bin/osascript',['-l','JavaScript','-e',"ObjC.import('AppKit');ObjC.unwrap($.NSWorkspace.sharedWorkspace.frontmostApplication.bundleIdentifier);"]).trim();
    if(!UI.nativeRevealClicked){
        if(front!=='io.github.brucerry.MacTweak'){if(Date.now()>UI.nativeRevealDeadline)throw new Error('The safe native reveal fixture did not become active: '+front+'; active='+String($.NSApp.active));return;}
        UI.nativeRevealClicked=true;editor.reveal.performClick(UI.controller);return;
    }
    if(front==='com.apple.finder'){
        if(editor.selected.path!==UI.nativeRevealPath||ObjC.unwrap(editor.text.string)!==UI.nativeRevealContent||ObjC.unwrap(editor.notice.stringValue)!=='')throw new Error('Native Reveal must retain its modal browser and file contents.');
        console.log('PASS: real native Finder reveal from the modal saved-files browser; selection and contents retained');requestMacTweakQuit();
    }else if(Date.now()>UI.nativeRevealDeadline)throw new Error('Finder did not activate for the disposable selected file.');
}
function uxTick() {
    if(UI.cleaned||UI.uxTickRunning)return;UI.uxTickRunning=true;
    try{uxTickBody();}finally{UI.uxTickRunning=false;}
}
function uxTickBody() {
    Presentation.testDesktop();
    var editor=UI.maintenanceSheet;if(!editor)return;MaintenanceSheet.poll(editor);
    if(editor.phase==='review'&&UI.smokePhase===0){
        if(editor.bulk.enabled||editor.buttons.some(function(button){return button&&button.enabled;}))throw new Error('Review must freeze bulk and individual selection.');var frozen=JSON.stringify(editor.chosen);UI.controller.maintenanceBulk(null);if(JSON.stringify(editor.chosen)!==frozen)throw new Error('Bulk selection must not change an accepted list.');
        UI.smokePhase=1;if(editor.review.items.length!==1||ObjC.unwrap(editor.primary.title).indexOf('Trash')<0)throw new Error('The exact itemized acceptance must follow Review.');
        if(ObjC.unwrap(editor.message.stringValue).indexOf(editor.review.items[0].bytes+' B')<0)throw new Error('Exact review must display the refreshed selected byte total.');
        uxBitmap(editor.panel.contentView,editor.mode+'-review');
        if(UI.smoke==='ux-cleanup-stale'){
            var path=editor.review.items[0].path+'/download';$('changed after review').writeToFileAtomicallyEncodingError(path,true,$.NSUTF8StringEncoding,Ref());
        }
        UI.controller.maintenancePrimary(null);
        if(editor.close.enabled||editor.primary.enabled)throw new Error('Accepted work must disable duplicate acceptance and closing.');
    }
    if(UI.smoke==='ux-cleanup-interrupt'&&editor.phase==='applying'&&editor.job&&readText(editor.job.output).indexOf('\"type\":\"paused\"')>=0){editor.job.task.terminate;}
    if(editor.phase==='finished'){
        var expected=UI.smoke==='ux-cleanup-interrupt'?'interrupted':UI.smoke==='ux-cleanup-stale'?'failed':UI.smoke==='ux-cleanup-failure'?'partial-failure':'completed';
        if(editor.result.status!==expected)throw new Error('Unexpected native maintenance result: '+JSON.stringify(editor.result));
        if(!editor.close.enabled)throw new Error('Results must remain readable and closable.');uxHoverGeometry(editor.close);uxBitmap(editor.panel.contentView,editor.mode+'-result');
        if(!editor.spinner.hidden||editor.bulk.enabled||editor.filter.enabled)throw new Error('Terminal maintenance states must stop and hide progress, with no active selection controls.');
        var context=MaintenanceIO.make();if(MaintenanceIO.attributes(context.state+'/lock'))throw new Error('Finished maintenance must not leave its worker lock behind.');
        ['cleanup','remove'].forEach(function(mode){var rows=JSON.parse(maintenanceBackend('inventory',[mode]));if(rows.some(function(row){return /setup is locked/i.test(row.blocked);}))throw new Error('Both utilities must remain available after a terminal run.');});
        MaintenanceSheet.refresh(editor);if(editor.phase!=='inventory'||!editor.spinner.hidden||editor.filter.hidden||editor.bulk.hidden||Object.keys(editor.chosen).length)throw new Error('Refreshing results must return to an unselected, idle inventory.');

        uxHoverGeometry(editor.close);
        Hovers.clear(editor.panel.contentView);editor.panel.orderOut(null);UI.maintenanceSheet=null;
        console.log('PASS: native '+UI.smoke+' item selection, exact acceptance, guarded execution, Trash receipts and persistent results');requestMacTweakQuit();
    }
    if(editor.phase==='failed')throw new Error(String(editor.message.stringValue));
}

function run(argv) {
    var root = argv[0];
    if (!root) throw new Error('Repository location is required.');
    Project = (0,eval)(readText(root + '/src/project.js'));
    Presentation=(0,eval)(readText(root+'/src/gui/presentation.js'));
    Icons=(0,eval)(readText(root+'/src/gui/icons.js'));Icons.init(root);
    Hovers=(0,eval)(readText(root+'/src/gui/hover.js'));
    Activity=(0,eval)(readText(root+'/src/gui/activity.js'));
    SettingsNavigation=(0,eval)(readText(root+'/src/gui/settings-navigation.js'));
    ActivityLog=(0,eval)(readText(root+'/src/gui/activity-log.js'));
    State = (0, eval)(readText(root + '/src/gui/state.js'));
    Dialogs = (0, eval)(readText(root + '/src/gui/dialogs.js'));
    PreferenceModel = (0, eval)(readText(root + '/src/preferences/model.js'));
    PreferenceEditor = (0, eval)(readText(root + '/src/gui/preferences.js'));
    FilesBrowser = (0,eval)(readText(root+'/src/gui/files.js'));
    NativeFiles = (0,eval)(readText(root+'/src/maintenance/native-files.js'));
    MaintenanceSheet = (0,eval)(readText(root+'/src/gui/maintenance.js'));
    MaintenanceIO = (0,eval)(readText(root+'/src/maintenance/io.js'));
    if (argv.indexOf('--self-test') >= 0) return selfTest(root);
    var smoke = argv.indexOf('--smoke-apply') >= 0 ? 'apply' : argv.indexOf('--smoke') >= 0 ? 'cancel' : '';
    ['blocked', 'stale', 'apply-failure', 'verify-pending', 'verify-versions', 'verify-reused', 'verify-health', 'interaction', 'preference-layout', 'preference-editor'].forEach(function (mode) {
        if (argv.indexOf('--smoke-' + mode) >= 0) smoke = mode;
    });
    ['repair-review', 'repair-pending', 'repair-cancel', 'repair-details', 'repair-versions', 'repair-manual', 'repair-stale', 'repair-selection', 'repair-config',
        'repair-preferences-accept', 'repair-preferences-cancel', 'repair-preferences-details', 'repair-preferences-stale', 'repair-preferences-policy', 'repair-preferences-failure', 'repair-preferences-keep','ux-host','ux-host-close','ux-host-menu-quit','ux-host-external-quit','ux-host-reopen','ux-host-busy-close','ux-host-busy-external','ux-host-modal-quit','ux-native-reveal','ux-details','ux-cleanup-cancel','ux-cleanup-accept','ux-cleanup-native','ux-cleanup-stale','ux-cleanup-failure','ux-cleanup-interrupt','ux-remove-cancel','ux-remove-accept'].forEach(function (mode) {
        if (argv.indexOf('--smoke-' + mode) >= 0) smoke = mode;
    });
    if (smoke && ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('MAC_TWEAK_GUI_TEST')) !== '1') {
        throw new Error('Native GUI smoke tests require MAC_TWEAK_GUI_TEST=1 and a disposable HOME.');
    }
    if(smoke)Presentation.testDesktop();
    return buildWindow(root, smoke,argv.indexOf('--native-host')>=0,argv.indexOf('--applet-host')>=0);
}
