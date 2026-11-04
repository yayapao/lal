package main

import (
	"os"
	"reflect"
	"regexp"
	"testing"
)

func TestDesktopBridgeMatchesGeneratedBindings(t *testing.T) {
	data, err := os.ReadFile("frontend/wailsjs/go/main/App.d.ts")
	if err != nil {
		t.Fatal(err)
	}
	methods := regexp.MustCompile(`export function (\w+)\(`).FindAllStringSubmatch(string(data), -1)
	bridge := reflect.TypeOf(&App{})
	if len(methods) != bridge.NumMethod() {
		t.Fatalf("bridge has %d methods; bindings have %d", bridge.NumMethod(), len(methods))
	}
	for _, match := range methods {
		if _, ok := bridge.MethodByName(match[1]); !ok {
			t.Errorf("binding method %s is missing from main.App", match[1])
		}
	}
}
