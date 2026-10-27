ObjC.import('Foundation');
function run(argv) {
    function xml(text) { return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    if (argv[0] === 'agent') return '<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>'+xml(argv[1])+'</string><key>ProgramArguments</key><array><string>/usr/bin/open</string><string>-gj</string><string>'+xml(argv[2])+'</string></array><key>RunAtLoad</key><'+(argv[3] === 'true' ? 'true' : 'false')+'/></dict></plist>';
    if (argv[0] === 'info') return '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>'+xml(argv[1])+'</string><key>CFBundleIdentifier</key><string>'+xml(argv[2])+'</string><key>CFBundleName</key><string>'+xml(argv[1])+'</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1</string><key>LSUIElement</key><true/><key>LSMinimumSystemVersion</key><string>13.0</string></dict></plist>';
    throw new Error('Unknown helper metadata operation.');
}
