# Updating published tools

`src/catalog/releases.txt` is data, not executable configuration. Each pipe-delimited
row declares the tool ID, fixed install version, minimum accepted existing
version, exclusive upper bound, architecture, minimum macOS version, archive
format, HTTPS artifact URL, SHA-256, archive root, command list, and binary
directory. `local-bin-path` is a shell component and has no release artifact.

The checked-in versions are Node 24.22.1 (LTS), uv 0.13.5, GitHub CLI 2.103.2,
and tig 2.6.1. Node accepts compatible 24.x releases at or above the pinned
minimum; uv accepts 0.13.x; GitHub CLI and tig accept supported 2.x releases at
or above their pinned minimums. Companion executables must work too. Managed
installations converge to the fixed catalog version; supported external
installations are reused and kept under their existing manager.

When updating:

1. Review the upstream release notes and support policy; select a fixed release.
2. Check both macOS architecture artifacts, archive layouts, exposed commands,
   and minimum OS versions. Never infer compatibility from the filename alone.
3. Copy digests from upstream published checksum metadata. Tig's release asset
   digest is published by GitHub's release API. Review the upstream provenance
   before committing updated digests; replacing a checksum changes trusted code.
4. Update the rows and existing-version criteria together. All runtime downloads
   are verified against this checked-in digest before extraction or execution.
5. Run `python3 tests/releases.py --upstream`, `python3 tests/artifact-platforms.py --live`, the isolated behavior suite, and
   the [opt-in live smoke test](validation.md) on disposable supported Macs. Record untested
   architectures and OS versions explicitly.

Support references:

- [Node 24 build/support matrix](https://github.com/nodejs/node/blob/v24.22.1/BUILDING.md): macOS 13.5+ on arm64 and x64.
- [uv platform policy](https://github.com/astral-sh/uv/blob/0.13.5/docs/reference/policies/platforms.md): macOS 13+.
- [GitHub CLI release](https://github.com/cli/cli/releases/tag/v2.103.2) and its [Go 1.27 runtime requirement](https://go.dev/doc/go1.27#darwin): macOS 13+.
- [Tig installation](https://github.com/jonas/tig/blob/tig-2.6.1/INSTALL.adoc): native build using macOS system ncurses; our supported floor is macOS 13 with working Command Line Tools.

Applying a checkout never looks up `latest`. Updating an external installation
is a separate user action. The repository has no background update service.
