#!/bin/bash
set -eo pipefail
CI_REPO=$(cd "$(dirname "$0")/.." && pwd -P)
printf 'Native validation: macOS %s, %s, %s\n' "$(sw_vers -productVersion)" "$(uname -m)" "$(/bin/bash --version | head -1)"
for script in "$CI_REPO/tweak.sh" "$CI_REPO/src/cli.sh" "$CI_REPO"/src/app/*.sh "$CI_REPO"/src/lib/*.sh "$CI_REPO"/src/components/{tools,terminal,preferences,profiles,guided}/*.sh "$CI_REPO"/tests/*.sh; do
    /bin/bash -n "$script"
done
for snippet in "$CI_REPO"/src/terminal/*.zsh; do /bin/zsh -n "$snippet"; done
/bin/bash "$CI_REPO/tests/test.sh"

/usr/bin/osascript -l JavaScript "$CI_REPO/tests/gui-enhancements.js" "$CI_REPO"
python3 "$CI_REPO/tests/rename.py"
python3 "$CI_REPO/tests/release-notes.py"
python3 "$CI_REPO/tests/release-ci.py"
python3 "$CI_REPO/tests/helper-launch.py"
python3 "$CI_REPO/tests/display-settings.py"

/usr/bin/osascript -l JavaScript "$CI_REPO/tests/activity-log.js" "$CI_REPO"
/usr/bin/osascript -l JavaScript "$CI_REPO/tests/settings-navigation.js" "$CI_REPO"
python3 "$CI_REPO/tests/terminal-signals.py"
python3 "$CI_REPO/tests/app-host.py"
python3 "$CI_REPO/tests/terminal-interrupt.py"

/usr/bin/osascript -l JavaScript "$CI_REPO/tests/presentation.js" "$CI_REPO"
python3 "$CI_REPO/tests/native-files.py"
python3 "$CI_REPO/tests/hosted-maintenance.py"
