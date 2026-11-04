package main

import (
	"os"
	"reflect"
	"regexp"
	"testing"
)

func TestDesktopBridgeMatchesGeneratedBindings(t *testing.T) {
	data, err := os.ReadFile("frontend/wailsjs/lal/app.ts")
	if err != nil {
		t.Fatal(err)
	}
	methods := regexp.MustCompile(`export function (\w+)\(`).FindAllStringSubmatch(string(data), -1)
	bridge := reflect.TypeOf(&App{})
	// Wails consumes lifecycle methods itself; they must not be callable from JS.
	lifecycle := map[string]bool{"ServiceStartup": true, "ServiceShutdown": true}
	if len(methods) != bridge.NumMethod()-len(lifecycle) {
		t.Fatalf("bridge has %d public methods; bindings have %d", bridge.NumMethod(), len(methods))
	}
	for _, match := range methods {
		if lifecycle[match[1]] {
			t.Errorf("lifecycle method %s exposed to JS", match[1])
		}
		if _, ok := bridge.MethodByName(match[1]); !ok {
			t.Errorf("binding method %s is missing from main.App", match[1])
		}
	}
}
