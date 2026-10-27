ObjC.import('Foundation');
function run(argv){
    var source=ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(argv[0]+'/src/gui/activity-log.js',$.NSUTF8StringEncoding,Ref())),log=(0,eval)(source);
    var output='Selection: dock aliases\ndock: Set selected Dock appearance\nPREFERENCE_CHANGE [dock] Dock size: real 32 -> real 64\nPREFERENCE_CHANGE [dock] Auto-hide: boolean false -> boolean true\nCHANGE [aliases] /fixture/home/.config/aliases.zsh\n--- before\n+++ after\n-old\n+new\nFAIL [aliases] example failure\nRun records and recovery information: /fixture/home/.local/state/run\n$(untrusted)\n__PREFERENCES_PLAN__|private';
    var rows=log.rows(output,{dock:'Dock',aliases:'Shell shortcuts'},[],'/fixture/home'),text=log.string(rows);
    if(text.indexOf('Dock size')<0||text.indexOf('− 32')<0||text.indexOf('+ 64')<0||text.indexOf('− Off')<0||text.indexOf('+ On')<0||text.indexOf('~/')<0||text.indexOf('$(untrusted)')<0||text.indexOf('__PREFERENCES_')>=0)throw new Error('Activity must keep readable values, paths and literal unknown text while removing private protocol data.');
    if(!rows.some(function(row){return row.kind==='error';})||!rows.some(function(row){return row.kind==='added-code';})||!rows.some(function(row){return row.kind==='removed-code';}))throw new Error('Failures and diffs need semantic styles.');
    return 'PASS: readable activity groups, named old/new values, semantic diff/error colors, literal output and private protocol filtering';
}
