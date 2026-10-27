/* Heroicons v2.2.0, MIT © Tailwind Labs. Loaded locally, without network access. */
(function () {
    var root='', cache={},menuCache={}, aliases={
        'hand.tap':'hand-raised','xmark.circle':'x-circle','keyboard':'key','terminal':'command-line',
        'curlybraces':'code-bracket','shippingbox':'cube','chevron.left.forwardslash.chevron.right':'code-bracket',
        'point.3.connected.trianglepath.dotted':'square-3-stack-3d','command':'arrows-right-left','paintpalette':'swatch',
        'square.grid.2x2':'squares-2x2','circle.lefthalf.filled':'moon','accessibility':'cursor-arrow-rays',
        'computermouse':'cursor-arrow-rays','rectangle.and.hand.point.up.left':'hand-raised','macwindow':'window',
        'desktopcomputer':'computer-desktop','speaker.wave.2':'speaker-wave','magnifyingglass':'magnifying-glass',
        'square':'stop','circle':'ellipsis-horizontal-circle','clock':'arrow-path','checkmark.square.fill':'check-badge',
        'checkmark.circle.fill':'check-circle','exclamationmark.triangle.fill':'exclamation-triangle',
        'exclamationmark.triangle':'exclamation-triangle','xmark.octagon.fill':'x-circle',
        'checkmark.shield':'shield-check','wrench.and.screwdriver':'adjustments-horizontal',
        'lightbulb':'light-bulb','lightbulb.fill':'light-bulb-solid'
    };
    function image(name) {
        var key=aliases[name]||name;
        if(!cache[key]){var value=$.NSImage.alloc.initWithContentsOfFile(root+'/src/gui/assets/heroicons/'+key+'.svg');
            if(!value)throw new Error('Missing bundled icon: '+key);value.template=true;cache[key]=value;}
        return cache[key];
    }
    function menuImage(name){
        var key=aliases[name]||name;
        if(!menuCache[key]){
            // Keep menu raster sizing separate from the shared SVG images
            // used by tintable NSImageView controls.
            var value=$.NSImage.alloc.initWithSize($.NSMakeSize(36,36));value.lockFocus;
            try{image(name).drawInRectFromRectOperationFraction($.NSMakeRect(0,0,36,36),$.NSZeroRect,$.NSCompositingOperationSourceOver,1);}finally{value.unlockFocus;}
            value.size=$.NSMakeSize(18,18);value.template=true;menuCache[key]=value;
        }
        return menuCache[key];
    }
    return {init:function(path){root=path;},image:image,menuImage:menuImage};
}())
