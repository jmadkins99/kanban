# Helpers shared by all.sh and sync.sh (source it; it is not run on its own).
#
# kill_tree <pid>: kills a process and everything it started, so a Firebase
# emulator (java and node) never outlives the run that started it. On Windows
# taskkill /T walks the tree; elsewhere the tree is walked by parent pid,
# stopping each parent first so it cannot spawn a child mid-walk.
kill_tree() {
    if [ -r "/proc/$1/winpid" ]; then
        # Git Bash: taskkill /T follows Windows parent links, which a bash
        # subshell or a forked child does not always keep (a `sleep` started in
        # a subshell survived it). So walk the Bash-side tree (ps's PPID
        # column) first, deepest first, and taskkill /T each node, which
        # still reaches the native node and java processes below it.
        local kid
        for kid in $(ps | awk -v p="$1" '$2 == p && $1 != p { print $1 }'); do kill_tree "$kid"; done
        taskkill //T //F //PID "$(cat "/proc/$1/winpid")" > /dev/null 2>&1
    else
        kill -STOP "$1" 2>/dev/null
        local kid
        for kid in $(pgrep -P "$1"); do kill_tree "$kid"; done
        kill -KILL "$1" 2>/dev/null
    fi
}

# take_test_lock <scratch dir>: takes the machine-wide test lock through a
# holder process (run.sh with TEST_HOLD_LOCK=1; see run.sh) and returns once
# it holds it. The holder's pid is left in HOLDER. Returns 1 if it could not.
# drop_test_lock releases it.
HOLDER=''
take_test_lock() {
    rm -f "$1/ready"
    TEST_HOLD_LOCK=1 TEST_HOLD_LOCK_READY="$1/ready" bash run.sh &
    HOLDER=$!
    while [ ! -s "$1/ready" ]; do
        kill -0 "$HOLDER" 2> /dev/null || { HOLDER=''; return 1; }
        sleep 0.2
    done
}
drop_test_lock() {
    if [ -n "$HOLDER" ]; then kill "$HOLDER" 2> /dev/null; wait "$HOLDER" 2> /dev/null; HOLDER=''; fi
}
