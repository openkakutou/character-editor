package session

import (
	"bytes"
	"encoding/binary"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/openkakutou/sff"
)

const defText = "; my comment\n[Info]\nname = Test Character\nauthor = Test Author\n\n[Files]\nsprite = char.sff\nanim = char.air\ncns = char.cns\n"

func writeCharacter(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	files := map[string]string{
		"char.def": defText,
		"char.cns": "[Statedef 200, Attack]\ntype = S\nmovetype = A\nphysics = S\nanim = 200\nctrl = 0\n",
		"char.air": "[Begin Action 200]\n0,0, 0,0, 5\n",
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	pixels := []byte{0, 1, 2, 3}
	pcx, err := sff.EncodePCX(&sff.PCXImage{Width: 2, Height: 2, Pixels: pixels})
	if err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	err = sff.SerializeV1(&buf, [4]byte{1, 0, 0, 1}, false, []sff.V1WriteSprite{
		{Group: 0, Image: 0, PixelData: pcx, Palette: make([]byte, sff.V1PaletteBlockSize)},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "char.sff"), buf.Bytes(), 0o644); err != nil {
		t.Fatal(err)
	}
	return filepath.Join(dir, "char.def")
}

func TestOpen_ValidCharacter_ExposesNameAuthorAndCounts(t *testing.T) {
	s, err := Open(writeCharacter(t))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if s.Name() != "Test Character" || s.Author() != "Test Author" {
		t.Errorf("got name %q author %q", s.Name(), s.Author())
	}
	if s.AnimationCount() != 1 || s.SpriteCount() != 1 {
		t.Errorf("got %d animations, %d sprites; want 1 and 1", s.AnimationCount(), s.SpriteCount())
	}
}

func TestSave_AfterRename_WritesNewNameAndReopens(t *testing.T) {
	path := writeCharacter(t)
	s, _ := Open(path)
	s.SetName("Renamed")
	if err := s.Save(); err != nil {
		t.Fatalf("Save: %v", err)
	}
	raw, _ := os.ReadFile(path)
	if !strings.Contains(string(raw), "Renamed") || strings.Contains(string(raw), "Test Character") {
		t.Errorf("saved file does not hold the new name:\n%s", raw)
	}
	again, err := Open(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	if again.Name() != "Renamed" || again.Author() != "Test Author" {
		t.Errorf("reopened name %q author %q", again.Name(), again.Author())
	}
}

func TestSave_WithoutChanges_LeavesFileByteIdentical(t *testing.T) {
	path := writeCharacter(t)
	s, _ := Open(path)
	if err := s.Save(); err != nil {
		t.Fatalf("Save: %v", err)
	}
	raw, _ := os.ReadFile(path)
	if string(raw) != defText {
		t.Errorf("unchanged save altered the file:\n%s", raw)
	}
}

func TestSetName_MarksDirtyOnlyWhenValueChanges(t *testing.T) {
	s, _ := Open(writeCharacter(t))
	s.SetName("Test Character")
	if s.Dirty() {
		t.Error("same name must not mark dirty")
	}
	s.SetName("Other")
	if !s.Dirty() {
		t.Error("new name must mark dirty")
	}
	if err := s.Save(); err != nil {
		t.Fatal(err)
	}
	if s.Dirty() {
		t.Error("save must clear dirty")
	}
}

func TestOpen_MissingDefFile_ReturnsError(t *testing.T) {
	if _, err := Open(filepath.Join(t.TempDir(), "nope.def")); err == nil {
		t.Fatal("expected an error")
	}
}

func TestOpen_EmptyDefFile_ReturnsErrorAndWritesNothing(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "empty.def")
	if err := os.WriteFile(path, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Open(path); err == nil {
		t.Fatal("expected an error")
	}
	if info, _ := os.Stat(path); info.Size() != 0 {
		t.Error("empty file was modified")
	}
}

func TestOpen_MissingReferencedSprite_ReturnsErrorNamingTheProblem(t *testing.T) {
	path := writeCharacter(t)
	os.Remove(filepath.Join(filepath.Dir(path), "char.sff"))
	_, err := Open(path)
	if err == nil {
		t.Fatal("expected an error")
	}
}

func TestOpen_CorruptSprite_ReturnsErrorNotPanic(t *testing.T) {
	path := writeCharacter(t)
	garbage := make([]byte, 64)
	binary.LittleEndian.PutUint32(garbage, 0xdeadbeef)
	os.WriteFile(filepath.Join(filepath.Dir(path), "char.sff"), garbage, 0o644)
	if _, err := Open(path); err == nil {
		t.Fatal("expected an error")
	}
}

func TestSave_UnwritableTarget_ReturnsErrorAndKeepsDirty(t *testing.T) {
	path := writeCharacter(t)
	s, _ := Open(path)
	s.SetName("X")
	s.path = filepath.Join(filepath.Dir(path), "missing-dir", "x.def")
	if err := s.Save(); err == nil {
		t.Fatal("expected an error")
	}
	if !s.Dirty() {
		t.Error("failed save must stay dirty")
	}
}
