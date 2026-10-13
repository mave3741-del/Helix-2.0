# Browser Launcher Fix v0.99.25

The previous launcher used invalid escaped quotes inside `cmd /k`, which can produce Windows:
"The filename, directory name, or volume label syntax is incorrect."

The canonical launcher now uses Windows `START /D` with `%ComSpec% /K` and invokes `RUN_HELIX_SERVER.bat` via `call`, avoiding nested quote parsing.
