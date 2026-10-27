"""Release-note formatting and tag checks in a private Git fixture."""
import json,pathlib,shutil,subprocess,tempfile
repo=pathlib.Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='mac-tweak-notes-') as temporary:
    root=pathlib.Path(temporary);(root/'scripts/release').mkdir(parents=True);(root/'src/app').mkdir(parents=True);(root/'docs/releases').mkdir(parents=True)
    for name in ['scripts/release/notes.py','src/app/metadata.json','docs/releases/v0.1.0.md']:shutil.copy2(repo/name,root/name)
    def git(*args):return subprocess.run(['git','-C',str(root),*args],check=True,capture_output=True,text=True)
    git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');git('add','.');git('commit','-m','Prepare initial release');git('tag','v0.1.0')
    output=root/'notes.md'
    def render(tag):return subprocess.run(['python3',str(root/'scripts/release/notes.py'),'--tag',tag,'--output',str(output)],capture_output=True,text=True)
    assert render('v0.1.0').returncode==0
    text=output.read_text();assert [line for line in text.splitlines() if line.startswith('## ')]==['## 📦 Description','## ✨ Changes','## 🧾 Commits']
    sha=git('rev-parse','HEAD').stdout.strip();assert '/commit/'+sha in text and '/commits/v0.1.0' in text
    assert render('v9.0.0').returncode!=0 and render('main').returncode!=0
    git('add','notes.md');git('commit','-m','Later edits');assert render('v0.1.0').returncode!=0
print('PASS: reference release layout, real commit links, metadata/tag matching and stale checkout rejection')
