#!/usr/bin/env python3
"""Build portable universal Mac Tweak assets. Never installs or publishes anything."""
import argparse,hashlib,json,pathlib,plistlib,shutil,subprocess,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[2]
def run(*args,**kwargs):
    print("Running:",str(args[0]),flush=True)
    return subprocess.run(list(map(str,args)),check=True,**kwargs)
def capture(*args):return subprocess.check_output(list(map(str,args)),text=True).strip()
def build(destination):
    meta=json.loads((ROOT/'src/app/metadata.json').read_text());version=meta['version']
    destination=destination.resolve();destination.mkdir(parents=True,exist_ok=True)
    stem=f'MacTweak-{version}-macos-universal-unsigned'
    with tempfile.TemporaryDirectory(prefix='mac-tweak-release-') as directory:
        stage=pathlib.Path(directory);app=stage/'Mac Tweak.app';contents=app/'Contents';resources=contents/'Resources';binary=contents/'MacOS';binary.mkdir(parents=True);resources.mkdir()
        for name in ['src','docs']:shutil.copytree(ROOT/name,resources/name,ignore=shutil.ignore_patterns('__pycache__','*.pyc','.DS_Store'))
        for name in ['tweak.sh','Tweak.command','README.md','LICENSE']:shutil.copy2(ROOT/name,resources/name)
        shutil.copy2(ROOT/'src/gui/assets/MacTweak.icns',resources/'MacTweak.icns')
        info=dict(CFBundleName=meta['name'],CFBundleDisplayName=meta['name'],CFBundleIdentifier=meta['bundleIdentifier'],CFBundleExecutable='MacTweak',CFBundlePackageType='APPL',CFBundleShortVersionString=version,CFBundleVersion=version,CFBundleIconFile='MacTweak',LSMinimumSystemVersion=meta['minimumMacOS'],LSUIElement=False,NSHighResolutionCapable=True,NSHumanReadableCopyright=meta['copyright'])
        (contents/'Info.plist').write_bytes(plistlib.dumps(info))
        for architecture in ['arm64','x86_64']:
            run('xcrun','swiftc','-O','-target',architecture+'-apple-macosx13.0',ROOT/'src/app/Launcher.swift','-o',stage/architecture)
        run('lipo','-create',stage/'arm64',stage/'x86_64','-output',binary/'MacTweak')
        run('codesign','--force','--sign','-',app)
        run('codesign','--verify','--deep','--strict',app)
        run('ditto','-c','-k','--norsrc','--noextattr','--noacl','--keepParent',app,stage/(stem+'.zip'))
        run('pkgbuild','--component',app,'--install-location','/Applications','--identifier',meta['bundleIdentifier'],'--version',version,stage/(stem+'.pkg'))
        files=[]
        for extension in ['.pkg','.zip']:
            source=stage/(stem+extension);target=destination/source.name;shutil.copy2(source,target)
            files.append(dict(name=target.name,bytes=target.stat().st_size,sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
        commit=capture('git','-C',ROOT,'rev-parse','HEAD');dirty=bool(capture('git','-C',ROOT,'status','--porcelain','--untracked-files=all'))
        manifest=dict(product=meta['name'],version=version,platform='macos',architectures=['arm64','x86_64'],minimumMacOS=meta['minimumMacOS'],signing='ad-hoc app; unsigned installer; not notarized',source=dict(commit=commit,dirty=dirty),files=files)
        (destination/(stem+'.manifest.json')).write_text(json.dumps(manifest,indent=2)+'\n')
        checks=[*files,dict(name=stem+'.manifest.json',sha256=hashlib.sha256((destination/(stem+'.manifest.json')).read_bytes()).hexdigest())]
        (destination/(stem+'.sha256')).write_text(''.join(row['sha256']+'  '+row['name']+'\n' for row in checks))
    print(destination)
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=pathlib.Path,default=ROOT/'dist');options=parser.parse_args();build(options.output)
