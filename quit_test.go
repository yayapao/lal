package main

import (
	"testing"
	"time"
)

func TestQuitGuard(t *testing.T) {
	confirmations := make(chan func(bool), 2)
	quit := make(chan bool, 1)
	g := &quitGuard{
		running: func() bool { return true },
		confirm: func(done func(bool)) { confirmations <- done },
		quit:    func() { quit <- true },
	}
	if g.shouldQuit() {
		t.Fatal("running processes must require confirmation")
	}
	var done func(bool)
	select {
	case done = <-confirmations:
	case <-time.After(time.Second):
		t.Fatal("missing confirmation")
	}
	if g.shouldQuit() {
		t.Fatal("pending confirmation must block repeated quit")
	}
	select {
	case <-confirmations:
		t.Fatal("duplicate confirmation")
	default:
	}
	done(false)
	select {
	case <-quit:
		t.Fatal("cancel must preserve the session")
	default:
	}
	if g.shouldQuit() {
		t.Fatal("cancel must not approve a subsequent quit")
	}
	select {
	case done = <-confirmations:
	case <-time.After(time.Second):
		t.Fatal("cannot retry after cancellation")
	}
	done(true)
	select {
	case <-quit:
	case <-time.After(time.Second):
		t.Fatal("confirmed quit was not dispatched")
	}
	if !g.shouldQuit() {
		t.Fatal("confirmed native quit must proceed to shutdown")
	}
}

func TestQuitWithoutProcesses(t *testing.T) {
	g := &quitGuard{running: func() bool { return false }}
	if !g.shouldQuit() {
		t.Fatal("idle app should quit without a dialog")
	}
}
