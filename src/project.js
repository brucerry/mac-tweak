/* Shared destination layout. Existing installations retain their storage and recovery paths. */
(function () {
    function storage(home) {
        return ['/.config/macos-setup','/.local/state/macos-setup','/.local/opt/macos-setup'].some(function (suffix) {
            var raw=$.NSFileManager.defaultManager.attributesOfItemAtPathError(home + suffix,Ref()),attrs=raw?ObjC.deepUnwrap(raw):null;return !!attrs&&typeof attrs.NSFileType==='string';
        }) ? 'macos-setup' : 'mac-tweak';
    }
    function layout(home) { var id=storage(home);return {id:id,config:home+'/.config/'+id,state:home+'/.local/state/'+id,tools:home+'/.local/opt/'+id}; }
    return {storage:storage,layout:layout};
}())
