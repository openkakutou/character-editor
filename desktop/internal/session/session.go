// Package session holds the editor's open character, independent of any GUI
// toolkit so it can be tested without a display.
package session

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"

	"github.com/openkakutou/character"
	"github.com/openkakutou/character/def"
)

// Session is one character opened from a .def file.
type Session struct {
	path     string
	original []byte
	loaded   *character.Character
	info     def.CharacterInfo
	dirty    bool
}

// Open loads the character referenced by the .def file at path, through the
// same character and sff libraries as the web build.
func Open(path string) (*Session, error) {
	original, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", path, err)
	}
	info, err := def.Parse(bytes.NewReader(original))
	if err != nil {
		return nil, fmt.Errorf("parsing %s: %w", path, err)
	}
	loaded, err := character.Load(path)
	if err != nil {
		return nil, err
	}
	return &Session{path: path, original: original, loaded: loaded, info: info}, nil
}

func (s *Session) Name() string        { return s.info.Name }
func (s *Session) Author() string      { return s.info.Author }
func (s *Session) AnimationCount() int { return len(s.loaded.Animations) }
func (s *Session) Dirty() bool         { return s.dirty }

// SpriteCount is the total number of sprites across all groups.
func (s *Session) SpriteCount() int {
	n := 0
	for _, g := range s.loaded.Sprites {
		n += len(g.Sprites)
	}
	return n
}

func (s *Session) SetName(name string) {
	if name == s.info.Name {
		return
	}
	s.info.Name = name
	s.dirty = true
}

// Save writes the .def file back, byte-identical when nothing changed. The
// write goes through a temp file so a failure never truncates the original.
func (s *Session) Save() error {
	out, err := character.SerializeDef(s.original, s.info)
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(s.path), ".save-*.def")
	if err != nil {
		return fmt.Errorf("saving %s: %w", s.path, err)
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(out); err != nil {
		tmp.Close()
		return fmt.Errorf("saving %s: %w", s.path, err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("saving %s: %w", s.path, err)
	}
	if err := os.Rename(tmp.Name(), s.path); err != nil {
		return fmt.Errorf("saving %s: %w", s.path, err)
	}
	s.original = out
	s.dirty = false
	return nil
}
