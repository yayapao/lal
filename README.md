# LAL

LAL（Local App Launcher）是一个基于 Wails v2 的 macOS 本地开发服务控制台。它把分散在不同目录中的独立项目收拢到同一个窗口，提供单个和批量启停、端口可用性、访问地址、PID、运行时长与实时日志。

## 第一版产品边界

核心场景是日常同时开发多个非 monorepo 项目：每个服务可以配置名称、项目目录、启动命令和访问地址。LAL 在项目目录中使用非交互 zsh 执行命令，并显式加载 `~/.zshrc`，因此能够读取 Volta 等常见的 Node 环境配置，同时避免交互 shell 的作业控制挂起服务。

当前版本包含：

- 服务的添加、编辑、删除和搜索
- 单个服务一键启动、停止
- 服务状态手动刷新、重启，以及执行可自定义的缓存清理脚本后自动重启
- 按服务读取 Codex 启动提示词，支持一键复制或在对应项目中新建 Codex 对话并粘贴
- 根据项目内容自动识别并显示 Next.js、Vite、React、Vue、Go 等项目图标
- 多选服务后批量启动、停止
- 全部启动、全部停止
- stdout / stderr 实时日志、启动和脚本执行前自动清空、手动清空、下载与自动跟随
- PID、运行时长、异常退出码和路径失效提示
- 按服务进程组汇总 CPU、RSS 内存和进程数，并展示实时趋势
- HTTP/HTTPS 访问地址展示与一键打开
- 基于访问地址端口的可用性探测，区分进程运行和服务真正可访问
- 启动前检查已配置访问地址的本机 TCP 端口，占用时展示进程和处理建议
- 服务按名称稳定排序，运行状态变化不会改变列表位置或日志焦点
- 配置原子持久化
- 使用独立进程组启动；停止时先发送 `SIGTERM`，超时后发送 `SIGKILL`
- 退出应用时提示并停止由本次 LAL 会话启动的所有服务

当前版本刻意不包含系统登录自启、Docker 编排、远程同步和外部进程接管。LAL 不会扫描或终止用户在终端中自行启动的同名进程。

## 默认服务

首次启动且以下目录存在时，LAL 会创建两个初始配置：

| 服务 | 项目目录 | 启动命令 | 访问地址 |
| --- | --- | --- | --- |
| myStock | `/Users/yango/github/stock/mystock` | `npm run dev` | `http://localhost:35790` |
| ViewAI | `/Users/yango/Documents/huyaprojects/ai/viewai` | `npm run dev` | `http://localhost:3900` |

之后的配置保存在 `~/Library/Application Support/LAL/config.json`，不会写入各项目目录。旧版 v1/v2/v3 配置会自动迁移到当前版本；上述两个已知服务还会补充默认访问地址。同版本早期使用的单 Prompt 路径字段也会兼容转换。

每个服务都有独立的缓存清理脚本，默认是 `rm -rf .next`。可以在编辑服务时改成项目实际需要的命令，例如 `rm -rf .next dist/.cache .turbo` 或项目内的清理脚本路径；命令会在该服务的项目目录中执行。

项目头像优先读取项目目录下的 `public/logo.png`，也支持 JPG、JPEG、WebP、SVG、GIF、AVIF 和 ICO，文件不能超过 2 MB。服务状态更新时会检查图片路径、修改时间和大小；替换图片后，点击“刷新状态”可以强制重新读取头像。删除图片后会恢复默认项目图标。

服务的省略号菜单提供“Prompt 启动”入口。LAL 会递归扫描并自动读取项目 `prompts/` 目录中的所有 `.md` 文件，也可以在 Prompt 管理界面关联其他位置的文件；移除关联不会删除原文件。本地文件修改后，可以通过“同步 Prompt”刷新卡片内容。每张 Prompt 卡片支持复制内容，或在对应项目中新建 Codex 对话并粘贴内容，但不会自动发送；这两个操作都会在点击时重新读取文件。首次使用自动粘贴时，macOS 可能要求在“系统设置 > 隐私与安全性 > 辅助功能”中允许 LAL；未授权时内容仍会保留在剪贴板。

## 状态说明

- `可访问`：LAL 启动的进程仍在运行，且访问地址对应的 TCP 端口可以连接
- `等待端口`：进程已启动，LAL 正在等待服务监听端口
- `地址不可达`：进程仍在运行，但启动宽限期结束后端口仍不可连接，或已经可用的端口后来断开
- `运行中`：进程正在运行，但没有配置访问地址，因此只判断进程状态

## 本地开发

环境要求：Go 1.25+、Node.js 20.19+（20.x）或 22.12+、npm 和 Xcode Command Line Tools。

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
cd frontend && npm install && cd ..
wails dev
```

`wails dev` 只用于开发 LAL 本身。日常使用 LAL 管理其他项目时，推荐构建 macOS 应用包后直接运行：

```bash
scripts/build-macos.sh
open "$HOME/Applications/LAL.app"
```

构建脚本会执行干净的 macOS universal 构建，将应用安装到 `~/Applications/LAL.app`，刷新 LaunchServices 和 Spotlight，并校验应用是否能被系统索引。可以通过 `INSTALL_DIR=/Applications scripts/build-macos.sh` 安装到系统应用目录，或使用 `--install-dir PATH` 指定其他目录；使用 `--no-install` 只构建不安装。

检查代码：

```bash
go test -race ./...
go vet ./...
cd frontend && npm test && npm run build
```

## 后续规划

第二阶段优先考虑“工作集”：把若干服务保存为一组，一键切换开发上下文，并允许配置启动顺序和依赖等待条件。只有在真实使用证明有必要后，再增加菜单栏快捷控制和登录自启，避免第一版演变成通用进程管理器。
