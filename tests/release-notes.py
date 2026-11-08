"""Release-note formatting and tag checks in a private Git fixture."""
import json,pathlib,shutil,subprocess,tempfile
repo=pathlib.Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='mac-tweak-notes-') as temporary:
    root=pathlib.Path(temporary);(root/'scripts/release').mkdir(parents=True);(root/'src/app').mkdir(parents=True);(root/'docs/releases').mkdir(parents=True)
    version=json.loads((repo/'src/app/metadata.json').read_text())['version'];tag='v'+version
    for name in ['scripts/release/notes.py','src/app/metadata.json','docs/releases/'+tag+'.md']:shutil.copy2(repo/name,root/name)
    def git(*args):return subprocess.run(['git','-C',str(root),*args],check=True,capture_output=True,text=True)
    git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');git('add','.');git('commit','-m','Prepare initial release');git('tag',tag)
    output=root/'notes.md'
    def render(tag):return subprocess.run(['python3',str(root/'scripts/release/notes.py'),'--tag',tag,'--output',str(output)],capture_output=True,text=True)
    assert render(tag).returncode==0
    text=output.read_text();assert [line for line in text.splitlines() if line.startswith('## ')]==['## 📦 Description','## ✨ Changes','## 🧾 Commits']
    sha=git('rev-parse','HEAD').stdout.strip();assert '/commit/'+sha in text and '/commits/'+tag in text
    assert render('v9.0.0').returncode!=0 and render('main').returncode!=0
    git('add','notes.md');git('commit','-m','Later edits');assert render(tag).returncode!=0
    next_version=version.rsplit('.',1)[0]+'.'+str(int(version.rsplit('.',1)[1])+1);next_tag='v'+next_version
    metadata=json.loads((root/'src/app/metadata.json').read_text());metadata['version']=next_version
    (root/'src/app/metadata.json').write_text(json.dumps(metadata))
    shutil.copy2(root/('docs/releases/'+tag+'.md'),root/('docs/releases/'+next_tag+'.md'))
    git('add','.');git('commit','-m','Prepare next release');git('tag',next_tag)
    assert render(next_tag).returncode==0
    text=output.read_text();assert '/compare/'+tag+'...'+next_tag in text and '/commit/'+git('rev-parse','HEAD').stdout.strip() in text
    assert '/commit/'+sha not in text, 'Next release notes must exclude the previous release commits.'
print('PASS: reference release layout, real commit links, metadata/tag matching and stale checkout rejection')
