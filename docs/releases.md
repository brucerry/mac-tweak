# Release preparation

The product version and bundle identity live in `src/app/metadata.json`. Version 0.1.0 release text is in `docs/releases/v0.1.0.md`; generated notes append real commit links using the Description / Changes / Commits layout from [the reference releases](https://github.com/brucerry/mark-six-studio/releases).

Run `python3 scripts/release/build.py`, then `python3 scripts/release/verify.py dist` to prepare and check:

- `MacTweak-0.1.0-macos-universal-unsigned.zip` containing **Mac Tweak.app**.
- `MacTweak-0.1.0-macos-universal-unsigned.pkg` targeting `/Applications`.
- A SHA-256 file and JSON manifest with version, architectures, signing status and source commit/dirty state.

The launcher contains Apple Silicon and Intel slices, bundles all chooser/helper source and licenses, and uses macOS's JXA runtime. No runtime package manager is needed to open it. Applying individual components can require their documented prerequisites. Local preparation never runs an installer, starts helpers, changes preferences or publishes a release.

The app is ad-hoc signed. The installer is unsigned, and neither artifact is notarized; Gatekeeper may require approval through System Settings. No signing/notarization secret is configured. The source launcher remains available. Minimum macOS is 13; Node needs 13.5 and Dock/launcher gestures need 27.

The validation workflow runs isolated backend checks and native maintenance UI cases on macOS 15 Apple Silicon and Intel, then builds and inspects universal packaging on both architectures, exercising the bundled launcher natively. macOS 27 gesture planning is explicitly simulated only with a validated temporary preference store; it is not a claim of runtime gesture coverage on macOS 15. Optional manual live checks download pinned tools and test a private UUID preference domain.

After committing and pushing reviewed source, tag the matching version (for example `v0.1.0`) and push that tag, or manually run the release workflow for an existing tag. The workflow validates that exact tag, checks the version, builds and verifies artifacts, uploads workflow artifacts and creates an **unpublished draft**. It never automatically publishes. An existing release causes the create step to stop rather than overwrite assets. Review its notes and assets before publishing through GitHub.
