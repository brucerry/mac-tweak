"""Prepare a disposable checkout for a real managed-upgrade smoke test."""
import pathlib
import sys
import urllib.request

repo = pathlib.Path(sys.argv[1])
previous = "24.22.0"
checksums = urllib.request.urlopen(f"https://nodejs.org/dist/v{previous}/SHASUMS256.txt", timeout=60).read().decode()
published = {parts[1]: parts[0] for line in checksums.splitlines() if len(parts := line.split()) == 2}
rows = []
for line in (repo / "src/catalog/releases.txt").read_text().splitlines():
    if line.startswith("node|"):
        fields = line.split("|")
        filename = f"node-v{previous}-darwin-{fields[4]}.tar.gz"
        fields[1] = fields[2] = previous
        fields[7] = f"https://nodejs.org/dist/v{previous}/{filename}"
        fields[8] = published[filename]
        fields[9] = filename.removesuffix(".tar.gz")
        line = "|".join(fields)
    rows.append(line)
(repo / "src/catalog/releases.txt").write_text("\n".join(rows) + "\n")
print("Preparing previous real Node release:", previous)
