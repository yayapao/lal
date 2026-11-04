# Development and contributing

[Back to README](../README.en.md) · [Configuration and demo notes](README.en.md) · [简体中文](CONTRIBUTING.md)

Install dependencies and the Wails CLI using the [source build steps](../README.en.md#build-from-source) first.

## Local development

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
├── reference/                   # Configuration, demo notes and contribution guide
├── assets/readme/               # Feature diagram, screenshots and Excalidraw source
├── build/                       # App icon and platform packaging configuration
└── scripts/                     # Build and local development tools
```

Keep handwritten source files within 300 lines. Wails generates `frontend/wailsjs/`; run `wails3 task bindings` after changing backend types. The Go module, CLI and `@wailsio/runtime` are pinned to Wails 3.1.0.

## Get involved

Share specific problems you encounter while developing multiple projects through [Issues](https://github.com/yayapao/lal/issues), or submit a pull request. For bug reports, include your macOS version, project type, reproduction steps, and commands and logs with sensitive information removed.

LAL focuses on managing local projects on a single computer. It currently provides no remote deployment, team permissions or startup dependency orchestration.
