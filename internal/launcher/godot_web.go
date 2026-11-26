package launcher

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

type godotWebSession struct {
	server *http.Server
	view   GodotWebView
	done   chan struct{}
}

// StartGodotWeb serves an existing export, independently of native game launch.
func (m *serviceManager) StartGodotWeb(id string) error {
	m.mu.Lock()
	index := m.serviceIndexLocked(id)
	if index < 0 || m.godotWebViewLocked(m.services[index]) == nil {
		m.mu.Unlock()
		return fmt.Errorf("只有 Godot 游戏支持浏览器服务")
	}
	if m.shuttingDown {
		m.mu.Unlock()
		return fmt.Errorf("LAL 正在退出，无法启动浏览器服务")
	}
	if session := m.godotWeb[id]; session != nil && session.server != nil {
		m.mu.Unlock()
		return nil
	}
	service := m.services[index]
	view := detectGodotWeb(service.Directory)
	var root *os.Root
	var listener net.Listener
	var err error
	if !view.Available {
		err = errors.New(view.LastError)
	} else if process := m.processes[id]; process != nil && process.phase == "building" {
		err = fmt.Errorf("请等待当前构建完成后再启动浏览器服务")
	} else {
		root, err = os.OpenRoot(filepath.Dir(view.EntryPath))
		if err == nil {
			listener, err = net.Listen("tcp4", godotWebAddress(service.URL))
		}
	}
	if err != nil {
		if errors.Is(err, syscall.EADDRINUSE) {
			err = fmt.Errorf("浏览器服务端口已被占用：%s，请先停止占用服务或修改访问地址", godotWebAddress(service.URL))
		}
		if root != nil {
			root.Close()
		}
		view.Status, view.LastError = "failed", err.Error()
		m.godotWeb[id] = &godotWebSession{view: view}
		m.mu.Unlock()
		m.appendLog(id, "system", "浏览器服务启动失败："+err.Error())
		m.emitState(id)
		return err
	}
	view.Status = "running"
	view.URL = "http://" + listener.Addr().String() + "/" + url.PathEscape(filepath.Base(view.EntryPath))
	session := &godotWebSession{view: view, done: make(chan struct{})}
	session.server = &http.Server{Handler: godotWebHandler(root), ReadHeaderTimeout: 5 * time.Second}
	m.godotWeb[id] = session
	go m.serveGodotWeb(id, session, listener, root)
	m.mu.Unlock()
	m.appendLog(id, "system", "浏览器服务已启动："+view.URL+" · "+view.EntryPath)
	m.emitState(id)
	return nil
}

func godotWebAddress(configuredURL string) string {
	parsed, err := url.Parse(configuredURL)
	if err == nil && parsed.Scheme == "http" && parsed.Port() != "" {
		host := strings.ToLower(parsed.Hostname())
		if host == "localhost" || host == "127.0.0.1" || host == "::1" {
			return net.JoinHostPort("127.0.0.1", parsed.Port())
		}
	}
	return "127.0.0.1:0"
}

func godotWebHandler(root *os.Root) http.Handler {
	files := http.FileServerFS(root.FS())
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Embedder-Policy", "require-corp")
		w.Header().Set("Cache-Control", "no-store")
		switch strings.ToLower(filepath.Ext(r.URL.Path)) {
		case ".wasm":
			w.Header().Set("Content-Type", "application/wasm")
		case ".pck":
			w.Header().Set("Content-Type", "application/octet-stream")
		}
		// Do not expose directory listings or files outside the export root.
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "."
		}
		if info, err := root.Stat(path); err == nil && info.IsDir() && !isRootIndex(root, path) {
			http.NotFound(w, r)
			return
		}
		files.ServeHTTP(w, r)
	})
}

func isRootIndex(root *os.Root, path string) bool {
	info, err := root.Stat(filepath.Join(path, "index.html"))
	return err == nil && info.Mode().IsRegular()
}

func (m *serviceManager) serveGodotWeb(id string, session *godotWebSession, listener net.Listener, root *os.Root) {
	err := session.server.Serve(listener)
	root.Close()
	m.mu.Lock()
	session.server = nil
	session.view.Status, session.view.URL = "stopped", ""
	message := "浏览器服务已停止"
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		session.view.Status, session.view.LastError = "failed", err.Error()
		message = "浏览器服务异常退出：" + err.Error()
	}
	m.mu.Unlock()
	m.appendLog(id, "system", message)
	m.emitState(id)
	close(session.done)
}

func (m *serviceManager) StopGodotWeb(id string) error {
	m.mu.RLock()
	session := m.godotWeb[id]
	var server *http.Server
	if session != nil {
		server = session.server
	}
	m.mu.RUnlock()
	if server == nil {
		return nil
	}
	err := server.Close()
	<-session.done
	return err
}

func (a *App) OpenGodotWeb(id string) error {
	a.mu.RLock()
	session := a.godotWeb[id]
	address := ""
	if session != nil && session.server != nil {
		address = session.view.URL
	}
	a.mu.RUnlock()
	if address == "" {
		service, err := a.serviceByID(id)
		if err != nil || !isFile(filepath.Join(service.Directory, "project.godot")) || service.Module != moduleGame {
			return fmt.Errorf("请先启动浏览器服务")
		}
		port := inspectExternalPort(service)
		if port == nil || !port.PreviewOnly || !port.Accessible {
			return fmt.Errorf("请先启动浏览器服务")
		}
		address = service.URL
	}
	return a.desktop.OpenURL(address)
}
