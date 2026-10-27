"""Validate pinned digests against upstream metadata when explicitly requested."""
import json
import pathlib
import sys
import urllib.request

repo = pathlib.Path(__file__).resolve().parent.parent
rows = [line.split("|") for line in (repo / "src/catalog/releases.txt").read_text().splitlines() if line and not line.startswith("#")]
assert len({(r[0], r[4]) for r in rows}) == len(rows)
assert {r[0] for r in rows} == {"node", "uv", "gh", "tig"}
for row in rows:
    assert len(row) == 12 and len(row[8]) == 64
    assert {r[4] for r in rows if r[0] == row[0]} == {"arm64", "x64"}
if "--upstream" in sys.argv:
    cache = {}
    def get(url):
        if url not in cache:
            cache[url] = urllib.request.urlopen(url, timeout=60).read().decode()
        return cache[url]
    for tool, version, minimum, maximum, arch, os_min, fmt, url, digest, root, commands, bindir in rows:
        filename = url.rsplit("/", 1)[1]
        if tool == "node":
            checksums = get(f"https://nodejs.org/dist/v{version}/SHASUMS256.txt")
        elif tool == "uv":
            checksums = get(url + ".sha256")
        elif tool == "gh":
            checksums = get(f"https://github.com/cli/cli/releases/download/v{version}/gh_{version}_checksums.txt")
        else:
            release = json.loads(get(f"https://api.github.com/repos/jonas/tig/releases/tags/tig-{version}"))
            asset = next(asset for asset in release["assets"] if asset["name"] == filename)
            assert asset["digest"] == "sha256:" + digest
            print(f"PASS: upstream {tool} {version} {arch}")
            continue
        published = {parts[1].lstrip("*"): parts[0] for line in checksums.splitlines() if len(parts := line.split()) == 2}
        assert published[filename] == digest, (tool, arch)
        print(f"PASS: upstream {tool} {version} {arch}")
else:
    print("PASS: release manifest structure and architecture coverage")
