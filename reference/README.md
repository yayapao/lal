# Reference

[返回 README](../README.md) · [开发与贡献](CONTRIBUTING.md) · [English](README.en.md)

## 项目配置

例如，已有 Vite 项目可配置为目录 `~/Projects/my-web`、命令 `npm run dev`、地址 `http://localhost:5173`。自动识别不明确时，可在项目根目录创建 `.lal.json` 指定访问地址：

```json
{
  "url": "http://localhost:5173"
}
```

该文件仅作为元数据读取；它不包含启动命令，也不会被执行。

要在手机上打开本地页面，可在 LAL 中查看和复制局域网 IPv4、网关，并展开网络接口详情。

## 本地数据与执行边界

- 可用绝对路径 `LAL_CONFIG_PATH` 指定独立配置，用于开发或测试；默认项目列表与 Workspace 保存到 `~/Library/Application Support/LAL/config.json`。LAL 不要求账号或云同步；启动你自己的项目仍可能产生该项目的网络请求。
- 启动命令在项目目录中通过 zsh 执行，并加载 `~/.zshrc`。只添加你信任的项目，运行前检查启动命令与缓存清理命令。
- 清理命令由你配置；默认值 `rm -rf .next` 适用于部分 Next.js 项目，请按项目修改。
- 日志在进入界面与导出前，会对常见凭据字段、授权头、URL 账号密码和私钥做尽力脱敏；无法保证识别所有业务自定义秘密，分享前仍需检查。自动发现的 Prompt 仅从项目目录内安全读取；外部文件需手动关联。
- 常规停止与退出清理针对本次由 LAL 启动的进程。外部端口占用会先展示诊断，不会自动停止；目录匹配时可确认停止后交由 LAL 启动。
- Git 配置编辑只写当前仓库的 local 配置；不修改 global / system 配置。
- Codex 自动粘贴可能需要 macOS 辅助功能权限；未授权时仍可手动复制提示词。VS Code 快捷入口需要安装 VS Code。

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
