/* Plain-text activity parsing with semantic native colors. Output is never evaluated. */
(function(){
    function value(text){return text.replace(/\b(?:boolean|integer|real|string)\s+/g,'').replace(/no user override/g,'macOS default').replace(/\btrue\b/g,'On').replace(/\bfalse\b/g,'Off').replace(/^"(.*)"$/,'$1');}
    function rows(output,names,settings,home){
        names=names||{};settings=settings||[];var result=[];
        function title(id){var row=settings.filter(function(row){return row.id===id;})[0];return names[id]||{'local-bin-path':'Shell PATH','shell-integration':'Shell loading'}[id]||(row?row.label:id);}
        function add(text,kind){result.push({text:text,kind:kind||'text'});}
        output.split('\n').forEach(function(raw){
            if(/^__MAC_TWEAK_|^__PREFERENCES_/.test(raw))return;
            var line=home?raw.split(home+'/').join('~/'):raw,match;
            if((match=line.match(/^PREFERENCE_CHANGE \[([^\]]+)\] (.*?): (.*?) -> (.*)$/))){add(title(match[1])+' · '+match[2],'heading');add('  − '+value(match[3]),'removed');add('  + '+value(match[4]),'added');return;}
            if((match=line.match(/^(INSTALL|CHANGE|HELPER_CHANGE|SATISFIED|PASS|DONE|PENDING|FAIL|FAILED|GUIDED|MANUAL|REFRESH|RECOMMEND) \[([^\]]+)\] ?(.*)$/))){var kinds={INSTALL:'added',CHANGE:'added',HELPER_CHANGE:'added',SATISFIED:'success',PASS:'success',DONE:'success',PENDING:'warning',FAIL:'error',FAILED:'error',GUIDED:'warning',MANUAL:'warning',REFRESH:'muted',RECOMMEND:'text'},labels={INSTALL:'Install',CHANGE:'Update',HELPER_CHANGE:'Update helper',SATISFIED:'✓',PASS:'✓',DONE:'✓',PENDING:'Pending',FAIL:'Failed',FAILED:'Failed',GUIDED:'In macOS',MANUAL:'In macOS',REFRESH:'Refresh',RECOMMEND:'Next'};add(labels[match[1]]+' · '+title(match[2])+(match[3]?' — '+match[3]:''),kinds[match[1]]);return;}
            if((match=line.match(/^Selection: (.*)$/))){add('Selection: '+match[1].split(/\s+/).filter(Boolean).map(title).join(', '),'heading');return;}
            if((match=line.match(/^([a-z][a-z-]*): (.*)$/))&&names[match[1]]){add(title(match[1]),'heading');return;}
            if(/^BLOCKED:|^Error:|execution error:|^Run failed|^Verification failed|^Target changed/.test(line)){add(line,'error');return;}
            if(/^--- /.test(line)){add('Before · '+line.slice(4),'muted');return;}if(/^\+\+\+ /.test(line)){add('After · '+line.slice(4),'muted');return;}
            if(/^@@/.test(line)){add(line,'muted');return;}if(/^\+/.test(line)){add(line,'added-code');return;}if(/^-/.test(line)){add(line,'removed-code');return;}
            add(line,/^(Plan:|Host:|Run records)/.test(line)?'heading':/^\s*(?:Backup|Recovery|Path|Scope|Prerequisites):/.test(line)?'muted':'text');
        });return result;
    }
    function string(rows){return rows.map(function(row){return row.text;}).join('\n');}
    var styles=null;
    function attributed(rows,palette,offset){
        if(!styles){styles={};['text','heading','code'].forEach(function(kind){var paragraph=$.NSMutableParagraphStyle.alloc.init;paragraph.lineSpacing=3;paragraph.paragraphSpacing=kind==='heading'?6:2;styles[kind]={paragraph:paragraph,font:kind==='code'?$.NSFont.monospacedSystemFontOfSizeWeight(12,$.NSFontWeightRegular):$.NSFont.systemFontOfSizeWeight(13,kind==='heading'?$.NSFontWeightSemibold:$.NSFontWeightRegular)};});}
        var result=$.NSMutableAttributedString.alloc.init,position=0;offset=offset||0;
        rows.forEach(function(row,index){var text=(index?'\n':'')+row.text,start=position;position+=text.length;if(position<=offset)return;if(offset>start)text=text.slice(offset-start);
            var kind=row.kind,style=styles[/-code$/.test(kind)?'code':kind==='heading'?'heading':'text'],attrs=$.NSMutableDictionary.alloc.init,key=/^added/.test(kind)?'green':/^removed/.test(kind)?'red':{heading:'accent',success:'green',warning:'orange',error:'red',muted:'muted'}[kind]||'text';
            attrs.setObjectForKey(palette[key],$.NSForegroundColorAttributeName);
            attrs.setObjectForKey(style.font,$.NSFontAttributeName);attrs.setObjectForKey(style.paragraph,$.NSParagraphStyleAttributeName);
            var location=Number(result.length);result.mutableString.appendString(text);result.addAttributesRange(attrs,$.NSMakeRange(location,text.length));
        });return result;
    }
    return {rows:rows,string:string,attributed:attributed,value:value};
}())
