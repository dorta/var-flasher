# Installation

## Requirements

- Linux with an X11 or XWayland graphical session
- Docker
- `curl`, for the installer

## Install the latest release

Run the public installer directly from GitHub:

```sh
curl -fsSL https://raw.githubusercontent.com/dorta/var-flasher/main/install.sh | bash
```

The installer creates `~/.local/bin/var-flasher`. Ensure that directory is in
your `PATH`, then launch the application with:

```sh
var-flasher
```

## Commands

```text
var-flasher             Open the desktop application
var-flasher --update    Install and activate the latest GitHub release
var-flasher --uninstall Remove the application, installed versions, and cache
var-flasher --version   Print the installed version
```

The installer uses the latest published GitHub release. `GITHUB_TOKEN` is optional
and is only needed if API rate limits apply.

## Run from a clone

```sh
git clone git@github.com:dorta/var-flasher.git
cd var-flasher
./run.sh
```

`run.sh` builds and runs the application in Docker. Closing the window or
pressing `Ctrl+C` stops and removes the temporary container.
