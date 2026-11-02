package main

import "testing"

func TestOpenServiceInVSCodeRejectsMissingDirectory(t *testing.T) {
	app := testApp(t)
	service, err := app.CreateService(ServiceInput{Name: "Missing", Directory: "/tmp/lal-missing-vscode-project", Command: "true"})
	if err != nil {
		t.Fatal(err)
	}
	if err := app.OpenServiceInVSCode(service.ID); err == nil {
		t.Fatal("expected a missing directory to fail")
	}
}
