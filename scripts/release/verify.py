#!/usr/bin/env python3
"""Check release digests and inspect a disposable extraction; never install the package."""
import argparse,hashlib,json,pathlib,plistlib,subprocess,tempfile,zipfile
root=pathlib.Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('directory',type=pathlib.Path);args=parser.parse_args();directory=args.directory.resolve()
meta=json.loads((root/'src/app/metadata.json').read_text());stem='MacTweak-'+meta['version']+'-macos-universal-unsigned'
manifest=json.loads((directory/(stem+'.manifest.json')).read_text())
assert manifest['version']==meta['version'] and manifest['architectures']==['arm64','x86_64']
assert {row['name'] for row in manifest['files']}=={stem+'.zip',stem+'.pkg'}
for row in manifest['files']:
    path=directory/row['name'];assert path.stat().st_size==row['bytes'] and hashlib.sha256(path.read_bytes()).hexdigest()==row['sha256']
for line in (directory/(stem+'.sha256')).read_text().splitlines():
    digest,name=line.split('  ',1);assert name in [stem+ext for ext in ['.zip','.pkg','.manifest.json']];assert hashlib.sha256((directory/name).read_bytes()).hexdigest()==digest
with zipfile.ZipFile(directory/(stem+'.zip')) as archive:
    assert all(not pathlib.PurePosixPath(name).is_absolute() and '..' not in pathlib.PurePosixPath(name).parts for name in archive.namelist())
with tempfile.TemporaryDirectory(prefix='mac-tweak-package-check-') as temporary:
    stage=pathlib.Path(temporary)
    subprocess.run(['ditto','-x','-k',str(directory/(stem+'.zip')),str(stage)],check=True)
    app=stage/'Mac Tweak.app';info=plistlib.loads((app/'Contents/Info.plist').read_bytes())
    assert info['CFBundleIdentifier']==meta['bundleIdentifier'] and info['CFBundleShortVersionString']==meta['version'] and info['LSMinimumSystemVersion']=='13.0'
    binary=app/'Contents/MacOS/MacTweak'
    resources=app/'Contents/Resources'
    assert all((resources/name).is_file() for name in ['tweak.sh','Tweak.command'])
    assert not any((resources/name).exists() for name in ['setup.sh','Setup.command'])
    for name in ['tweak.sh','Tweak.command']:
        assert (resources/name).read_bytes()==(root/name).read_bytes() and (resources/name).stat().st_mode & 0o111
    assert set(subprocess.check_output(['lipo','-archs',str(binary)],text=True).split())=={'arm64','x86_64'}
    subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
    # Read-only chooser model check through the actual bundled launcher.
    result=subprocess.run([str(binary),'--self-test'],capture_output=True,text=True,timeout=30)
    assert result.returncode==0 and 'PASS:' in result.stdout,result.stdout+result.stderr
    subprocess.run(['pkgutil','--expand-full',str(directory/(stem+'.pkg')),str(stage/'expanded')],check=True)
    package_info=next((stage/'expanded').rglob('PackageInfo')).read_text()
    assert meta['bundleIdentifier'] in package_info and 'install-location="/Applications"' in package_info
    payload=next((stage/'expanded').rglob('Payload/Mac Tweak.app/Contents/Info.plist'))
    assert plistlib.loads(payload.read_bytes())==info
    packaged=payload.parent.parent
    def contents(folder):return {str(path.relative_to(folder)):hashlib.sha256(path.read_bytes()).hexdigest() for path in folder.rglob('*') if path.is_file()}
    assert contents(packaged)==contents(app),'Installer payload differs from the verified ZIP app.'
    for path in (root/'src').rglob('*'):
        if path.is_file() and '__pycache__' not in path.parts and path.suffix!='.pyc':
            shipped=app/'Contents/Resources'/path.relative_to(root)
            assert shipped.is_file() and shipped.read_bytes()==path.read_bytes(),str(path)

print('PASS: release manifest/checksums, universal launcher, ad-hoc signature, bundled runtime/resources, ZIP and unsigned installer payload (not installed)')
