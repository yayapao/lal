# Reference

[Back to README](../README.en.md) · [Development and contributing](CONTRIBUTING.en.md) · [简体中文](README.md)

## Project configuration

For example, an existing Vite project might use the folder `~/Projects/my-web`, command `npm run dev` and URL `http://localhost:5173`. If automatic detection is inconclusive, create `.lal.json` in the project root to declare its URL:

```json
{
  "url": "http://localhost:5173"
}
```

This file is read only as metadata. It contains no startup command and is never executed.

To open a local page on your phone, view and copy your LAN IPv4 address and gateway in LAL, or expand the network interface details.

## Local data and command execution

- Set `LAL_CONFIG_PATH` to an absolute path for an isolated development or test configuration. By default, projects and Workspaces are saved in `~/Library/Application Support/LAL/config.json`. LAL requires no account or cloud sync; projects you launch may make their own network requests.
- Startup commands run through zsh in the project folder and load `~/.zshrc`. Add projects you trust, and review startup and cache cleanup commands before running them.
- You configure cleanup commands. The default `rm -rf .next` suits some Next.js projects; change it to match your project.
- Logs receive best-effort masking of common credential fields, authorization headers, URL credentials and private keys before display or export. Custom application secrets may remain; review logs before sharing. Automatically discovered Prompts are read within the project directory; external files require an explicit association.
- Normal stop actions and shutdown cleanup target processes started by LAL in the current session. External port owners are shown for diagnosis and are not stopped automatically. When the project folder matches, you can confirm stopping the external process before starting the project through LAL.
- Git configuration edits affect only the current repository's local configuration, leaving global and system settings unchanged.
- Automatic pasting into Codex may require macOS Accessibility permission. You can still copy prompts manually without it. The VS Code shortcut requires VS Code to be installed.

## Status and engines

The UI status “可访问” means the **TCP port at the configured address is reachable**. It does not confirm HTTP or application health. LAL distinguishes external processes from those it starts; stopping an external process requires explicit confirmation in the UI.

Native game launch state is tracked separately from Web preview readiness. Install Godot or Unity yourself; LAL does not bundle game engines. Games and services have separate views; starting all services does not launch games.

## Recording demos

The README currently uses static screenshots; this repository has no screen recordings yet. Record actual interactions and use short GIFs for core workflows, with an MP4 video when narration is useful.

### Open-source tools

| Tool | Best for | Formats and features | License |
| --- | --- | --- | --- |
| [Kap](https://getkap.co/) · [Source](https://github.com/wulkano/Kap) | Recording macOS desktop apps; recommended for LAL | GIF, MP4, WebM and APNG; trimming and click highlights | MIT |
| [gifcap](https://gifcap.dev/) · [Source](https://github.com/joaomoreno/gifcap) | Recording in a browser without installing software | GIF export, cropping and trimming; recordings are processed locally without uploading | GPL-3.0 |
| [OBS Studio](https://obsproject.com/) · [Source](https://github.com/obsproject/obs-studio) | Longer demos, narration and multiple scenes | Video recording for full walkthroughs; GIF needs separate conversion | GPL-2.0-or-later |

Install Kap with `brew install --cask kap`. Select the area containing the LAL window, record, trim the beginning and end, then export GIF and MP4 versions. Use gifcap when you only need a short GIF.

### What to record

| Demo | Suggested length | Sequence |
| --- | --- | --- |
| Service lifecycle | 15–25 seconds | Add a demo project → review command and URL → start → inspect status and logs → stop |
| Game entry points | 10–15 seconds | Switch to Games → start a demo project → show the preview or editor shortcut → stop |

Use separate demo projects and configuration. Keep only LAL and any necessary preview window in frame. Start GIF exports at 960–1280 pixels wide and 10–15 fps, keeping text readable. Aim for 5 MB or less; shorten the sequence or use video if it becomes too large.

### Adding media to the README

- Store GIFs in `assets/readme/` and replace the matching screenshot references in both READMEs after recording. Short GIFs play automatically and suit launch actions and changing logs.
- Prefer H.264 for MP4. For GitHub inline playback, upload the video through an Issue / PR editor, then put the returned attachment URL on its own line in the README. A direct link to a repository `.mp4` may not play inline. Uploads send the file to GitHub immediately; see [GitHub's attachment documentation](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files).
- Share the same media between the Chinese and English READMEs, with captions in each language.

## Existing assets

Screenshots show the actual frontend using demo projects and data. The UI and feature diagram are primarily in Chinese.

- [Service workbench screenshot](../assets/readme/services.jpg)
- [Game library screenshot](../assets/readme/games.jpg)
- [Feature diagram](../assets/readme/overview.png) · [Editable Excalidraw source](../assets/readme/overview.excalidraw)
