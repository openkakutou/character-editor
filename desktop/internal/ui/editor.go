// Package ui is the Fyne front end of the desktop editor.
package ui

import (
	"fmt"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"github.com/openkakutou/character-editor/desktop/internal/session"
)

// Editor is the main window content: open a character, rename it, save.
type Editor struct {
	win        fyne.Window
	sess       *session.Session
	nameEntry  *widget.Entry
	author     *widget.Label
	stats      *widget.Label
	status     *widget.Label
	saveButton *widget.Button
	content    fyne.CanvasObject
}

// New builds the editor. onOpen is called when the user presses "Open…"; the
// caller shows a file picker and then calls Load.
func New(win fyne.Window, onOpen func()) *Editor {
	e := &Editor{
		win:       win,
		nameEntry: widget.NewEntry(),
		author:    widget.NewLabel(""),
		stats:     widget.NewLabel(""),
		status:    widget.NewLabel("Open a character's .def file to start."),
	}
	e.nameEntry.Disable()
	e.nameEntry.OnChanged = e.onNameChanged
	e.saveButton = widget.NewButton("Save", e.save)
	e.saveButton.Disable()

	form := widget.NewForm(
		widget.NewFormItem("Name", e.nameEntry),
		widget.NewFormItem("Author", e.author),
		widget.NewFormItem("Contents", e.stats),
	)
	toolbar := container.NewHBox(widget.NewButton("Open…", onOpen), e.saveButton)
	e.content = container.NewBorder(toolbar, e.status, nil, nil, form)
	return e
}

// Content is the widget tree to set on the window.
func (e *Editor) Content() fyne.CanvasObject { return e.content }

// Load opens the character at path, reporting any failure in the status line.
func (e *Editor) Load(path string) {
	s, err := session.Open(path)
	if err != nil {
		e.status.SetText(fmt.Sprintf("Cannot open %s: %v", path, err))
		return
	}
	e.sess = s
	e.nameEntry.Enable()
	e.nameEntry.SetText(s.Name())
	e.author.SetText(s.Author())
	e.stats.SetText(fmt.Sprintf("%d sprites, %d animations", s.SpriteCount(), s.AnimationCount()))
	e.status.SetText("Opened " + path)
	e.refreshSave()
}

func (e *Editor) onNameChanged(name string) {
	if e.sess == nil {
		return
	}
	e.sess.SetName(name)
	e.refreshSave()
}

func (e *Editor) save() {
	if e.sess == nil {
		return
	}
	if err := e.sess.Save(); err != nil {
		e.status.SetText("Save failed: " + err.Error())
		return
	}
	e.status.SetText("Saved.")
	e.refreshSave()
}

func (e *Editor) refreshSave() {
	if e.sess != nil && e.sess.Dirty() {
		e.saveButton.Enable()
	} else {
		e.saveButton.Disable()
	}
}
