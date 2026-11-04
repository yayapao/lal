# 开发与贡献

[返回 README](../README.md) · [配置与演示说明](README.md) · [English](CONTRIBUTING.en.md)

先按 [README 的源码构建步骤](../README.md#从源码构建)安装依赖与 Wails CLI。

## 本地开发

```bash
# 开发 LAL 桌面端
wails3 dev

# 验证 Go 后端
go test -race ./...
go vet ./...

# 验证前端
cd frontend
npm test
npm run build
```

目录按职责组织：

```text
lal/
├── main.go, app.go, desktop.go  # Wails v3 入口、服务与原生适配
├── internal/launcher/           # 后端实现与同包测试
├── frontend/                    # React 界面、测试与生成的 Wails 绑定
├── reference/                   # 配置、演示素材说明与贡献指南
├── assets/readme/               # 介绍图、截图与 Excalidraw 源文件
├── build/                       # 应用图标与平台打包配置
└── scripts/                     # 构建与本地开发工具
```

手写源文件保持在 300 行以内；`frontend/wailsjs/` 由 Wails 自动生成，后端类型变化时运行 `wails3 task bindings` 重新生成绑定。Go 模块、CLI 与 `@wailsio/runtime` 固定使用 Wails 3.1.0。

## 参与项目

欢迎通过 [Issues](https://github.com/yayapao/lal/issues) 分享多项目开发中的具体问题，或提交 Pull Request。报错时请附 macOS 版本、项目类型、复现步骤，以及已去除敏感信息的命令与日志。

LAL 聚焦单机本地项目管理。目前不提供远程部署、团队权限或启动依赖编排。
