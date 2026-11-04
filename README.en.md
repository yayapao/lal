<p align="center">
  <img src="frontend/src/assets/images/lal-logo-color.png" width="72" alt="LAL logo">
</p>

<h1 align="center">LAL · Local App Launcher</h1>

<p align="center"><a href="README.md">简体中文</a> · <strong>English</strong></p>

<p align="center"><strong>AI helps you build more projects. LAL helps you run them.</strong></p>
<p align="center">A local project manager for macOS: launch development servers and games, inspect logs, ports and Git, and get back to building.</p>
<p align="center">
  <a href="#getting-started">Getting started</a> · <a href="#one-window-for-your-local-projects">Features</a> · <a href="#get-involved">Get involved</a> · <a href="LICENSE">MIT License</a>
</p>

![Bring scattered local projects into one place to launch and monitor them](assets/readme/overview.png)

## Why LAL?

AI coding tools make it easier to build a Web app, an API or a small game. As projects multiply, their folders, terminals, ports, startup commands and context become harder to track. Where is yesterday's demo? Which service is using that port? Why did the latest change break startup?

LAL is a **local project launcher and development workbench for macOS**. Add projects already on your computer to a Workspace, then start and stop them, open their pages, and inspect logs and Git status in one place. It suits independent developers maintaining several repositories and people building their first products with AI.

LAL is built with Go, Wails and React. Keep using your preferred editor, terminal and AI coding tools; LAL brings your projects' running state together.

## One window for your local projects

### Services: from a running process to a reachable port

![LAL service workbench with demo projects and data](assets/readme/services.jpg)

- **Project detection**: read `package.json`, common startup scripts and port settings from a selected folder to suggest a name, command and URL. You can edit the suggestions.
- **Start and stop**: control one, several or all services. Projects stay sorted by name as their state changes. Green means start; red means stop.
- **Workspaces**: group projects by product or workflow, with collapsible groups, search, renaming and bulk moves.
- **Diagnostics**: live stdout / stderr logs, log export, CPU and memory trends, PID, uptime, unexpected exits and port ownership details.

The UI status “可访问” means the **TCP port at the configured address is reachable**. It does not confirm HTTP or application health. LAL distinguishes external processes from those it starts; stopping an external process requires explicit confirmation in the UI.

### Games: launch native and Web projects

![LAL game library with demo projects and data](assets/readme/games.jpg)

Detect Godot, Unity and Phaser / Web game projects, and configure their launch commands, preview URLs and cache cleanup commands. Cards provide start, stop, VS Code and Finder shortcuts. Games and services have separate views; starting all services does not launch games.

Native game launch state is tracked separately from Web preview readiness. Install Godot or Unity yourself; LAL does not bundle game engines.

### Pick up your development context

| What you want to do | What LAL provides |
| --- | --- |
| Continue editing a project | Open VS Code or Finder from the project menu |
| Check repository state | Inspect branches, changed files, conflicts and repository-local Git configuration |
| Continue working with Codex | Read Markdown in the project's `prompts/` folder, copy a prompt, or open Codex and paste it without sending |
| Open a local page on your phone | View and copy your LAN IPv4 address and gateway, and expand network interface details |
| Run an existing project task | Select a `package.json` script and inspect its execution logs |

Screenshots show the actual frontend using demo projects and data. The UI and the feature diagram are currently in Chinese. The diagram's [editable Excalidraw source](assets/readme/overview.excalidraw) is included in this repository.

## Getting started

Download the [macOS universal preview from Releases](https://github.com/yayapao/lal/releases/tag/v0.1.0) for Apple Silicon and Intel, or build from source below. Verify the download against `SHA256SUMS.txt` on the same release page, extract the archive, and drag `LAL.app` into your Applications folder.

The preview uses an ad-hoc signature and has not been signed with Developer ID or notarized by Apple. macOS may block it from opening; see the release notes for signing status and validation scope. The current UI is primarily Chinese, and desktop integrations target macOS.

You need macOS 12+, Xcode Command Line Tools, Go 1.26+ (toolchain pinned to 1.26.10), Node.js 20.19+ on the 20.x line or 22.12+, and npm. Also install the package managers and runtimes required by the projects you want to launch.

```bash
git clone https://github.com/yayapao/lal.git
cd lal

go install github.com/wailsapp/wails/v3/cmd/wails3@v3.1.0
npm --prefix frontend ci
scripts/build-macos.sh
open "$HOME/Applications/LAL.app"
```

Make sure Go's bin directory is on your `PATH` so you can run `wails3`. By default, the build script creates an Apple Silicon / Intel universal app and installs it at `~/Applications/LAL.app`. Use `scripts/build-macos.sh --no-install` to build without installing; the app is written to `build/bin/LAL.app`.

The project list is empty on first launch:

1. Click “添加服务” (Add service), choose your project folder, and review the detected launch command and URL.
2. Choose or create a Workspace, save, and click the green start button.
3. Open the project's URL, or inspect its logs and resource trends in the right pane.
4. To add a game, switch to “游戏” (Games) and choose its project folder.

For example, an existing Vite project might use the folder `~/Projects/my-web`, command `npm run dev` and URL `http://localhost:5173`. If automatic detection is inconclusive, create `.lal.json` in the project root to declare its URL:

```json
{
  "url": "http://localhost:5173"
}
```

This file is read only as metadata. It contains no startup command and is never executed.

### Local data and command execution

- Set `LAL_CONFIG_PATH` to an absolute path for an isolated development or test configuration. By default, projects and Workspaces are saved in `~/Library/Application Support/LAL/config.json`. LAL requires no account or cloud sync; projects you launch may make their own network requests.
- Startup commands run through zsh in the project folder and load `~/.zshrc`. Add projects you trust, and review startup and cache cleanup commands before running them.
- You configure cleanup commands. The default `rm -rf .next` suits some Next.js projects; change it to match your project.
- Normal stop actions and shutdown cleanup target processes started by LAL in the current session. External port owners are shown for diagnosis and are not stopped automatically. When the project folder matches, you can confirm stopping the external process before starting the project through LAL.
- Git configuration edits affect only the current repository's local configuration, leaving global and system settings unchanged.
- Automatic pasting into Codex may require macOS Accessibility permission. You can still copy prompts manually without it. The VS Code shortcut requires VS Code to be installed.

## Development and contributing

```bash
# Develop the LAL desktop app
wails3 dev

# Check the Go backend
go test -race ./...
go vet ./...

# Check the frontend
cd frontend
npm test
npm run build
```

Files are organized by responsibility:

```text
lal/
├── main.go, app.go, desktop.go  # Wails v3 entry point, service and native adapter
├── internal/launcher/           # Backend implementation and same-package tests
├── frontend/                    # React UI, tests and generated Wails bindings
├── assets/readme/               # Feature diagram, screenshots and Excalidraw source
├── build/                       # App icon and platform packaging configuration
└── scripts/                     # Build and local development tools
```

Keep handwritten source files within 300 lines. Wails generates `frontend/wailsjs/`; run `wails3 task bindings` after changing backend types. The Go module, CLI and `@wailsio/runtime` are pinned to Wails 3.1.0.

## Get involved

Share specific problems you encounter while developing multiple projects through [Issues](https://github.com/yayapao/lal/issues), or submit a pull request. For bug reports, include your macOS version, project type, reproduction steps, and commands and logs with sensitive information removed.

LAL focuses on managing local projects on a single computer. It currently provides no remote deployment, team permissions or startup dependency orchestration.

## License

[MIT](LICENSE) © 2026 Yango. Third-party dependencies and bundled fonts retain their own licenses.
