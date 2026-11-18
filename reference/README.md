# Reference

[返回 README](../README.md) · [开发与贡献](CONTRIBUTING.md) · [English](README.en.md)

## 项目配置

例如，已有 Vite 项目可配置为目录 `~/Projects/my-web`、命令 `npm run dev`、地址 `http://localhost:5173`。自动识别不明确时，可在项目根目录创建 `.lal.json` 指定访问地址：

```json
{
  "url": "http://localhost:5173"
}
```

游戏还可以声明正式启动和构建导出命令：

```json
{
  "url": "http://localhost:18040/index.html",
  "releaseCommand": "'dist/macos/Game.app/Contents/MacOS/Game'",
  "buildCommand": "python3 -u tools/build_release.py",
  "buildBeforeLaunch": true,
  "buildProfiles": [
    {"id": "mac-zh", "name": "Mac · 中文", "command": "python3 -u tools/build.py --platform macos --lang zh --archive"},
    {"id": "web-en", "name": "Web · English", "command": "python3 -u tools/build.py --platform web --lang en --archive"}
  ]
}
```

“构建”按钮只执行构建并导出；勾选“正式启动前构建并导出”后，正式启动先执行构建，退出码为 0 才启动正式包。构建失败或取消时不启动旧包，Debug 直接运行源码。构建期间显示实时日志，可取消；需先停止游戏才能单独构建。构建是否复用未变化的产物由项目脚本决定。

配置 `buildProfiles` 后，卡片的“构建”打开方案菜单，点击名称立即打包；这不会修改正式启动命令。编辑游戏可添加、改名、删除方案，或点击“从项目读取”只导入 `.lal.json` 中的方案。最多16项，每项 ID 与名称分别唯一，名称最多80字符、命令最多2000字节；同一游戏串行执行。卡片与日志显示当前方案及实际命令。不配置方案时保留单条构建按钮。配置版本8首次升级时会导入项目中的有效方案，并保留已保存的启动命令。

首次添加项目时读取 `.lal.json` 并填入配置，确认保存后以 LAL 中的配置为准；编辑游戏可修改命令与启动前构建开关。声明构建命令而省略 `buildBeforeLaunch` 时默认开启。项目检测仅解析数据，不执行命令；命令只在用户点击构建或启动后执行。

要在手机上打开本地页面，可在 LAL 中查看和复制局域网 IPv4、网关，并展开网络接口详情。

## 本地数据与执行边界

- 可用绝对路径 `LAL_CONFIG_PATH` 指定独立配置，用于开发或测试；默认项目列表与 Workspace 保存到 `~/Library/Application Support/LAL/config.json`。LAL 不要求账号或云同步；启动你自己的项目仍可能产生该项目的网络请求。
- 启动命令在项目目录中通过 zsh 执行，并加载 `~/.zshrc`。只添加你信任的项目，运行前检查启动命令与缓存清理命令。
- 清理命令由你配置；默认值 `rm -rf .next` 适用于部分 Next.js 项目，请按项目修改。
- 日志在进入界面与导出前，会对常见凭据字段、授权头、URL 账号密码和私钥做尽力脱敏；无法保证识别所有业务自定义秘密，分享前仍需检查。
- 常规停止与退出清理针对本次由 LAL 启动的进程。外部端口占用会先展示诊断，不会自动停止；目录匹配时可确认停止后交由 LAL 启动。
- Git 配置编辑只写当前仓库的 local 配置；不修改 global / system 配置。

## 状态与引擎

状态中的“可访问”表示配置地址对应的 **TCP 端口可连接**，不代表 HTTP 接口或业务健康检查已通过。外部进程与 LAL 启动的进程会区分展示；停止外部进程需要在界面中明确确认。

原生游戏的启动状态与 Web 预览服务独立判断。Godot 或 Unity 需要自行安装；LAL 不包含游戏引擎。游戏与服务分别展示，“全部启动服务”不会启动游戏。

## 操作演示制作

当前 README 使用静态截图，仓库尚未包含操作录屏。建议录制真实操作，用短 GIF 展示核心流程，需要讲解时补充 MP4 视频。

### 开源工具

| 工具 | 适用场景 | 格式与特点 | 许可证 |
| --- | --- | --- | --- |
| [Kap](https://getkap.co/) · [源码](https://github.com/wulkano/Kap) | macOS 桌面应用录屏，LAL 首选 | 支持 GIF、MP4、WebM、APNG，裁剪时长与点击高亮 | MIT |
| [gifcap](https://gifcap.dev/) · [源码](https://github.com/joaomoreno/gifcap) | 不想安装软件，直接在浏览器录屏 | 导出 GIF，支持裁剪与截取时段；在本地浏览器处理，不上传录制内容 | GPL-3.0 |
| [OBS Studio](https://obsproject.com/) · [源码](https://github.com/obsproject/obs-studio) | 较长演示、旁白或多场景录制 | 视频录制，适合制作完整演示；GIF 需另行转换 | GPL-2.0-or-later |

Kap 可通过 `brew install --cask kap` 安装。打开后选择 LAL 窗口区域，录制并裁剪首尾，再分别导出 GIF 与 MP4。gifcap 适合只需要短 GIF 的场景。

### 录制内容

| 演示 | 建议时长 | 操作顺序 |
| --- | --- | --- |
| 服务启停 | 15–25 秒 | 添加演示项目 → 确认命令与地址 → 启动 → 查看运行状态与日志 → 停止 |
| 游戏入口 | 10–15 秒 | 切换“游戏” → 启动演示项目 → 展示预览或编辑器入口 → 停止 |

使用独立演示项目与配置录制，画面只保留 LAL 和必要的预览窗口。导出 GIF 时可从宽 960–1280 像素、10–15 fps 开始，优先保留可读文字；目标体积不超过 5 MB，过大则缩短流程或改用视频。

### 接入 README

- GIF 放在 `assets/readme/`，录制完成后替换中英文 README 对应的截图引用。短 GIF 可自动播放，适合展示启停与日志变化。
- MP4 建议使用 H.264 编码。需要 GitHub 内嵌播放时，在 Issue / PR 的编辑框上传视频，取得附件 URL，再将该 URL 单独一行放入 README；直接链接仓库中的 `.mp4` 不保证内嵌播放。上传文件会立即传到 GitHub，操作说明见 [GitHub 附件文档](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)。
- 中英文 README 使用同一份媒体素材，分别维护说明文字。

## 现有素材

界面截图来自实际前端，使用演示项目与演示数据；界面和功能示意图主要为中文。

- [服务工作台截图](../assets/readme/services.jpg)
- [游戏库截图](../assets/readme/games.jpg)
- [功能示意图](../assets/readme/overview.png) · [可编辑 Excalidraw 源文件](../assets/readme/overview.excalidraw)
