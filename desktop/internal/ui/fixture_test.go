package ui

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/openkakutou/sff"
)

func writeFixtureFiles(t *testing.T, dir string) {
	t.Helper()
	files := map[string]string{
		"char.def": "[Info]\nname = Test Character\nauthor = A\n\n[Files]\nsprite = char.sff\nanim = char.air\ncns = char.cns\n",
		"char.cns": "[Statedef 200, Attack]\ntype = S\nmovetype = A\nphysics = S\nanim = 200\nctrl = 0\n",
		"char.air": "[Begin Action 200]\n0,0, 0,0, 5\n",
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	pcx, err := sff.EncodePCX(&sff.PCXImage{Width: 2, Height: 2, Pixels: []byte{0, 1, 2, 3}})
	if err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	if err := sff.SerializeV1(&buf, [4]byte{1, 0, 0, 1}, false, []sff.V1WriteSprite{
		{Group: 0, Image: 0, PixelData: pcx, Palette: make([]byte, sff.V1PaletteBlockSize)},
	}); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "char.sff"), buf.Bytes(), 0o644); err != nil {
		t.Fatal(err)
	}
}
