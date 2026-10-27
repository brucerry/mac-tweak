# Mac Tweak

[![CI](https://github.com/brucerry/mac-tweak/actions/workflows/validate.yml/badge.svg)](https://github.com/brucerry/mac-tweak/actions/workflows/validate.yml)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Choose individual tweaks or adopt the full setup through a native macOS app.

---

## 📋 Requirements

macOS 13+ on Apple Silicon or Intel; Node.js requires macOS 13.5+. Command Line Tools are needed for tig and native helpers. Dock/launcher gestures target macOS 27. The app explains prerequisites for each selection.

---

## 💻 Terminal

| Item | Description |
| --- | --- |
| **Colored prompt** | Show your user, host, and current folder in a colored zsh prompt. |
| **Shell shortcuts** | Add convenient aliases for listing files. |
| **File colors** | Color file types in macOS `ls` output. |

## 🪟 Terminal app

| Item | Description |
| --- | --- |
| **Terminal preferences** | Adjust Terminal app options. |
| **Terminal profiles** | Install portable Dark and Light profiles with font, color, and shell-exit window behavior. |

## 🛠️ Development

| Item | Description |
| --- | --- |
| **Node.js & npm** | Install the JavaScript runtime and its package tools. |
| **uv** | Manage Python environments and packages. |
| **GitHub CLI** | Work with GitHub from your terminal. |
| **tig** | Browse Git history through an interactive terminal interface. |

## ⚙️  System

| Item | Description |
| --- | --- |
| **Finder** | Adjust window views, file extensions, hidden files, and display preferences. |
| **Dock** | Set size, position, magnification, and behavior. |
| **Keyboard** | Tune key repeat and automatic typing preferences. |
| **Screenshots** | Choose format, window shadows, and floating thumbnail behavior. |
| **Appearance** | Adjust appearance and when scroll bars are shown. |
| **Accessibility** | Choose motion, transparency, and contrast preferences. |
| **Mouse** | Adjust pointer speed and button behavior. |
| **Trackpad** | Configure pointer speed, taps, and gestures. |
| **Windows** | Adjust Spaces and window behavior. |
| **Desktop** | Configure desktop items, widgets, and Stage Manager. |
| **Sound** | Adjust sound effects and alerts. |
| **Spotlight** | Configure search options and open native search settings. |

## 🖱️ Behavior

| Item | Description |
| --- | --- |
| **Windows keyboard** | Swap Ctrl and Command behavior while keeping Alt as Option. |
| **Dock & gestures** | Minimize through Dock clicks, use Alt+Tab, and open the Apps launcher with the Windows-logo key when keyboard mapping is enabled. |
| **App close behavior** | Quit apps with the red button and quit Edge or Terminal after their final window closes. |

## 🖥️ Display & power

| Item | Description |
| --- | --- |
| **Wallpaper** | Open native choices for still, dynamic, and aerial wallpaper on each display. |
| **Screen saver** | Set a custom delay with minute controls and choose visuals through macOS. |
| **Screen protection** | Open native password-after-wake and display sleep controls. |
| **Display** | Open brightness, resolution, and display arrangement settings. |
| **Power** | Open battery and energy controls supported by your Mac. |

---

## 🚀 Open

Download or clone this repository, then double-click **[Tweak.command](Tweak.command)** or run `./tweak.sh`. No extra runtime is needed to open the app. **Ctrl+C** in the launching terminal requests a normal quit while protecting active Apply work.

Click cards to choose components, then **Review** the changes or **Verify** existing settings. **Apply** performs the reviewed changes and verifies automatically. **Later** keeps the review ready, and **Details** shows readable, color-coded activity. When no changes are needed, Apply stays disabled and the app explains why.

## 🎨 Customize

| Control | Description |
| --- | --- |
| **Presets** | Choose Terminal, Terminal app, Development, System, Behaviors, Display, or Full. Full includes every card; unchecking preserves existing setup. |
| **Custom selection** | Custom keeps your choices. Clicking a gray card or deselecting a card in Full switches to Custom while preserving the remaining selection. |
| **Preferences…** | Edit selected settings before Review. Keep current leaves a setting alone; Use macOS default removes its supported user override. |
| **Theme and information** | The bulb switches the app theme, and **ⓘ** shows app information. Background transparency and scrollbars follow macOS preferences. |

Changed files and preference originals are saved for recovery. Compatible installed tools are reused. Appearance starts at Keep current. Visual, security, and hardware choices use native macOS pages; saved preferences may need a normal relaunch or sign-out to become visible.

## 🗂️ Saved files and utilities

| Utility | Description |
| --- | --- |
| **Saved files…** | Inspect exact configuration paths, saved keys, and recovery records, with local previews and Finder reveal. Available independently of Review. |
| **Clean up temporary files** | Review Mac Tweak's generated temporary files and caches before moving accepted items to Trash. |
| **Remove old saved configs** | Remove accepted old copies while keeping current settings and installed apps. No recovery copy is retained automatically. |
| **Selection and review** | Filter item cards, select individual items or all shown, and review their paths and total size before accepting removal. Hidden selections remain included; nothing is preselected. |
| **Terminal profiles** | Open an installed profile, then set it as Default in Terminal if desired. |
| **System Settings** | Open background-app, Accessibility, and Spotlight controls. |

Open installed helpers from `~/Applications` or enable their login option in Preferences. Window helpers need Accessibility approval; installing them does not start input hooks automatically. Terminal profiles close their window on shell exit; the close helper can then quit Terminal after its final window closes.

---

## 🏗️ Build

Build on macOS with **Python 3** and **Apple Command Line Tools** (`xcode-select --install`). Run these commands from the repository root:

```sh
python3 scripts/release/build.py
python3 scripts/release/verify.py dist
```

The build creates a universal app for Apple Silicon and Intel. The verification command checks the generated packages, signatures, checksums, and bundled source.

| Output in `dist/` | Contents |
| --- | --- |
| `*.zip` | Portable **Mac Tweak.app**. |
| `*.pkg` | Installer for **Mac Tweak.app** in `/Applications`. |
| `*.sha256` | Checksums for the ZIP, installer, and manifest. |
| `*.manifest.json` | Version, architectures, signing status, and source commit. |

The app is ad-hoc signed; the installer is unsigned, and the packages are not notarized. See [release preparation](docs/releases.md) for CI and release workflows.

---

## 📚 Documentation

| Topic | Details |
| --- | --- |
| Help | [Troubleshooting](docs/troubleshooting.md) and [recovery](docs/recovery.md). |
| Development | [Advanced usage](docs/cli.md), [source organization](docs/architecture.md), and [validation](docs/validation.md). |
| Releases | [Release preparation](docs/releases.md): packages, CI, and version **0.1.0**. Existing installations retain their original storage paths. |
