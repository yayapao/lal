package main

import "testing"

func TestSelectedBatchKeepsServiceOrderStable(t *testing.T) {
	app := testApp(t)
	services := make(map[string]ServiceView)
	for _, name := range []string{"Zulu", "Alpha", "Middle"} {
		service, err := app.CreateService(ServiceInput{
			Name:      name,
			Directory: t.TempDir(),
			Command:   "trap 'exit 0' TERM; while :; do sleep 1; done",
		})
		if err != nil {
			t.Fatalf("create %s: %v", name, err)
		}
		services[name] = service
	}

	assertServiceNames(t, app.GetAppState().Services, []string{"Alpha", "Middle", "Zulu"})
	started := app.StartServices([]string{services["Zulu"].ID, services["Middle"].ID, services["Zulu"].ID})
	if started.Changed != 2 || started.Skipped != 0 || len(started.Errors) != 0 {
		t.Fatalf("unexpected start result: %#v", started)
	}
	assertServiceNames(t, app.GetAppState().Services, []string{"Alpha", "Middle", "Zulu"})
	if state := serviceState(t, app, services["Alpha"].ID); state.Status != "stopped" {
		t.Fatalf("unselected service changed state: %#v", state)
	}
	repeated := app.StartServices([]string{services["Middle"].ID, "missing"})
	if repeated.Changed != 0 || repeated.Skipped != 1 || len(repeated.Errors) != 1 {
		t.Fatalf("unexpected repeated start result: %#v", repeated)
	}
	unstarted := app.StopServices([]string{services["Alpha"].ID, "missing"})
	if unstarted.Changed != 0 || unstarted.Skipped != 1 || len(unstarted.Errors) != 1 {
		t.Fatalf("unexpected unstarted stop result: %#v", unstarted)
	}

	stopped := app.StopServices([]string{services["Zulu"].ID, services["Middle"].ID})
	if stopped.Changed != 2 || stopped.Skipped != 0 || len(stopped.Errors) != 0 {
		t.Fatalf("unexpected stop result: %#v", stopped)
	}
}

func TestParseResourceUsageAggregatesProcessGroups(t *testing.T) {
	usage := parseResourceUsage(`
  100  12.5  100
  100   0.5  200
  200   3.0  512
  999  40.0  999
  invalid row
`, map[int]string{100: "alpha", 200: "beta"}, []string{"stopped", "beta", "alpha"})

	if len(usage) != 3 {
		t.Fatalf("usage count = %d, want 3", len(usage))
	}
	if usage[0].ServiceID != "alpha" || usage[0].CPUPercent != 13 || usage[0].MemoryBytes != 300*1024 || usage[0].ProcessCount != 2 {
		t.Fatalf("unexpected alpha usage: %#v", usage[0])
	}
	if usage[1].ServiceID != "beta" || usage[1].CPUPercent != 3 || usage[1].MemoryBytes != 512*1024 || usage[1].ProcessCount != 1 {
		t.Fatalf("unexpected beta usage: %#v", usage[1])
	}
	if usage[2].ServiceID != "stopped" || usage[2].CPUPercent != 0 || usage[2].MemoryBytes != 0 || usage[2].ProcessCount != 0 {
		t.Fatalf("unexpected stopped usage: %#v", usage[2])
	}
}
