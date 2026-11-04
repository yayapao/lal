package main

import "sync"

// Native quit requests return immediately while the confirmation sheet is open.
// A confirmed request re-enters the native quit path and then runs cleanup.
type quitGuard struct {
	mu                sync.Mutex
	pending, approved bool
	running           func() bool
	confirm           func(func(bool))
	quit              func()
}

func (g *quitGuard) shouldQuit() bool {
	g.mu.Lock()
	if g.approved || !g.running() {
		g.mu.Unlock()
		return true
	}
	if g.pending {
		g.mu.Unlock()
		return false
	}
	g.pending = true
	g.mu.Unlock()
	go g.confirm(func(approved bool) {
		g.mu.Lock()
		g.pending = false
		g.approved = approved
		g.mu.Unlock()
		if approved {
			g.quit()
		}
	})
	return false
}
