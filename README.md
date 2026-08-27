# LAL

LAL（Local App Launcher）是一个基于 Wails v2 的 macOS 本地开发服务控制台。它把分散在不同目录中的独立项目收拢到同一个窗口，提供单个和批量启停、运行状态、PID、运行时长与实时日志。

## 第一版产品边界

核心场景是日常同时开发多个非 monorepo 项目：每个服务只需要名称、项目目录和启动命令。LAL 在项目目录中通过用户的登录 zsh 执行命令，因此能够读取常见的 Node 版本管理器与 shell 环境配置。

当前版本包含：

- 服务的添加、编辑、删除和搜索
- 单个服务一键启动、停止
- 全部启动、全部停止
- stdout / stderr 实时日志、日志清空与自动跟随
- PID、运行时长、异常退出码和路径失效提示
- 配置原子持久化
- 使用独立进程组启动；停止时先发送 `SIGTERM`，超时后发送 `SIGKILL`
- 退出应用时提示并停止由本次 LAL 会话启动的所有服务

当前版本刻意不包含端口探测、系统登录自启、Docker 编排、远程同步和外部进程接管。LAL 不会扫描或终止用户在终端中自行启动的同名进程。

## 默认服务

首次启动且以下目录存在时，LAL 会创建两个初始配置：

| 服务 | 项目目录 | 启动命令 |
| --- | --- | --- |
| myStock | `/Users/yango/github/stock/mystock` | `npm run dev` |
| ViewAI | `/Users/yango/Documents/huyaprojects/ai/viewai` | `npm run dev` |

之后的配置保存在 `~/Library/Application Support/LAL/config.json`，不会写入各项目目录。

## 本地开发

环境要求：Go 1.25+、Node.js 15+、npm 和 Xcode Command Line Tools。

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
cd frontend && npm install && cd ..
wails dev
```

检查代码：

```bash
go test -race ./...
go vet ./...
cd frontend && npm exec tsc -- --noEmit
```

生成 macOS 应用包：

```bash
wails build -platform darwin/universal
```

## 后续规划

第二阶段优先考虑“工作集”：把若干服务保存为一组，一键切换开发上下文，并允许配置启动顺序和依赖等待条件。只有在真实使用证明有必要后，再增加端口健康检查、菜单栏快捷控制和登录自启，避免第一版演变成通用进程管理器。
