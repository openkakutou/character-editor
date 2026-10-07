package ui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"fyne.io/fyne/v2/test"
)

func writeDef(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "c.def")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestEditor_InitialState_SaveDisabledAndHintShown(t *testing.T) {
	e := New(test.NewApp().NewWindow("t"), func() {})
	if !e.saveButton.Disabled() {
		t.Error("save must be disabled before a character is open")
	}
	if e.status.Text == "" {
		t.Error("expected a hint telling the user to open a character")
	}
}

func TestEditor_LoadInvalidFile_ShowsErrorAndKeepsSaveDisabled(t *testing.T) {
	e := New(test.NewApp().NewWindow("t"), func() {})
	e.Load(filepath.Join(t.TempDir(), "missing.def"))
	if !strings.Contains(e.status.Text, "missing.def") {
		t.Errorf("status should name the failing file, got %q", e.status.Text)
	}
	if !e.saveButton.Disabled() {
		t.Error("save must stay disabled after a failed open")
	}
}

func TestEditor_LoadThenEditAndSave_WritesTheNewName(t *testing.T) {
	// A def without referenced files cannot load; use the real fixture shape.
	dir := t.TempDir()
	writeFixtureFiles(t, dir)
	path := filepath.Join(dir, "char.def")

	e := New(test.NewApp().NewWindow("t"), func() {})
	e.Load(path)
	if e.nameEntry.Text != "Test Character" {
		t.Fatalf("name entry shows %q", e.nameEntry.Text)
	}
	if !e.saveButton.Disabled() {
		t.Error("save must be disabled while nothing changed")
	}
	e.nameEntry.SetText("Renamed")
	if e.saveButton.Disabled() {
		t.Error("save must be enabled after an edit")
	}
	test.Tap(e.saveButton)
	raw, _ := os.ReadFile(path)
	if !strings.Contains(string(raw), "Renamed") {
		t.Errorf("file not saved:\n%s", raw)
	}
	if !e.saveButton.Disabled() {
		t.Error("save must be disabled again after saving")
	}
}
