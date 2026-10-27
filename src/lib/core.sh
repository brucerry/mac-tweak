# Shared CLI primitives. Catalog data and persisted state are never sourced.
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }
usage() {
    cat <<'EOF'
Usage: ./tweak.sh                         # open the graphical chooser
       ./Tweak.command                    # double-clickable launcher
       ./tweak.sh <list|info|plan|apply|verify> [options]
       ./tweak.sh --terminal               # advanced terminal selector
       ./tweak.sh recover-preferences --run id [--yes]

Options:
  --preset terminal|terminal-app|development|system|behaviors|display|full
  --with id[,id...]       Add components (repeatable)
  --without id[,id...]    Exclude components (repeatable)
  --preferences-file path  Typed system preference choices (advanced)
  --yes                  Approve the current apply plan noninteractively
  -h, --help             Show this help
EOF
}
main() {
    . "$SETUP_ROOT/lib/catalog.sh"
    . "$SETUP_ROOT/lib/selection.sh"
    . "$SETUP_ROOT/lib/inspect.sh"
    . "$SETUP_ROOT/lib/plan.sh"
    . "$SETUP_ROOT/lib/verify.sh"
    . "$SETUP_ROOT/lib/apply.sh"
    . "$SETUP_ROOT/lib/artifacts.sh"
    . "$SETUP_ROOT/lib/repair.sh"
    . "$SETUP_ROOT/lib/preferences.sh"
    . "$SETUP_ROOT/lib/helpers.sh"
    case "${1:-}" in
        -h|--help|help) usage ;;
        list) test "$#" -eq 1 || die 'list takes no options'; catalog_validate; catalog_list ;;
        info) test "$#" -eq 2 || die 'info requires one component identifier'; catalog_validate; catalog_info "$2" ;;
        plan) shift; catalog_validate; selection_parse "$@"; plan_build ;;
        verify) shift; catalog_validate; selection_parse "$@"; verify_selection ;;
        apply) shift; catalog_validate; selection_parse "$@"; apply_selection ;;
        review-session) shift; catalog_validate; selection_parse "$@"; review_session ;;
        repair-session) shift; catalog_validate; selection_parse "$@"; REPAIR_MODE=1; review_session ;;
        recover-preferences) shift; catalog_validate; preferences_recover "$@" ;;
        terminal) shift; test "$#" = 0 || die 'The terminal selector takes no options'; catalog_validate; if interactive_select; then apply_selection; else printf 'Cancelled; no changes.\n'; fi ;;
        *) usage; die 'Choose a command and a nonempty component selection.' ;;
    esac
}
