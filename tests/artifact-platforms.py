"""Inspect real binary headers on either host without executing foreign binaries."""
import hashlib
import io
import pathlib
import re
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zipfile

if "--live" not in sys.argv:
    raise SystemExit("Pass --live to download and inspect the pinned binary artifacts.")
repo = pathlib.Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix="mac-tweak-platforms-") as temporary:
    for line in (repo / "src/catalog/releases.txt").read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        tool, version, minimum, maximum, arch, os_min, fmt, url, digest, root, commands, bindir = line.split("|")
        if fmt == "source":
            continue
        blob = urllib.request.urlopen(url, timeout=120).read()
        assert hashlib.sha256(blob).hexdigest() == digest, url
        member = root + "/" + ("" if bindir == "." else bindir + "/") + tool
        if fmt == "zip":
            with zipfile.ZipFile(io.BytesIO(blob)) as archive: payload = archive.read(member)
        else:
            with tarfile.open(fileobj=io.BytesIO(blob)) as archive: payload = archive.extractfile(member).read()
        binary = pathlib.Path(temporary) / (tool + "-" + arch)
        binary.write_bytes(payload)
        header = subprocess.check_output(["/usr/bin/otool", "-hv", str(binary)], text=True)
        assert ("ARM64" if arch == "arm64" else "X86_64") in header, header
        load = subprocess.check_output(["/usr/bin/otool", "-l", str(binary)], text=True)
        found = []
        for section in re.split(r"\n\s*Load command \d+\n", load):
            if "cmd LC_BUILD_VERSION" in section:
                found += re.findall(r"\n\s*minos ([0-9.]+)", section)
            if "cmd LC_VERSION_MIN_MACOSX" in section:
                found += re.findall(r"\n\s*version ([0-9.]+)", section)
        assert found, load
        normalized = lambda version: tuple((list(map(int, version.split("."))) + [0, 0])[:3])
        assert all(normalized(actual) <= normalized(os_min) for actual in found), (tool, arch, found, os_min)
        print(f"PASS: real {tool} {version} {arch}, checksum and Mach-O minimum {found}, declared macOS {os_min}", flush=True)
