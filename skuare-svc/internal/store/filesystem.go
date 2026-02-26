package store

import (
	"io/fs"
	"os"
	"path/filepath"
)

// FileSystem abstracts filesystem operations used by FSStore.
// Custom implementations can map these operations to non-local filesystems.
type FileSystem interface {
	MkdirAll(path string, perm os.FileMode) error
	Stat(name string) (os.FileInfo, error)
	ReadFile(name string) ([]byte, error)
	WriteFile(name string, data []byte, perm os.FileMode) error
	Rename(oldpath string, newpath string) error
	RemoveAll(path string) error
	Remove(name string) error
	ReadDir(name string) ([]os.DirEntry, error)
	WalkDir(root string, fn fs.WalkDirFunc) error
	OpenFile(name string, flag int, perm os.FileMode) (*os.File, error)
}

type OSFileSystem struct{}

func (OSFileSystem) MkdirAll(path string, perm os.FileMode) error { return os.MkdirAll(path, perm) }
func (OSFileSystem) Stat(name string) (os.FileInfo, error)        { return os.Stat(name) }
func (OSFileSystem) ReadFile(name string) ([]byte, error)         { return os.ReadFile(name) }
func (OSFileSystem) WriteFile(name string, data []byte, perm os.FileMode) error {
	return os.WriteFile(name, data, perm)
}
func (OSFileSystem) Rename(oldpath string, newpath string) error { return os.Rename(oldpath, newpath) }
func (OSFileSystem) RemoveAll(path string) error                 { return os.RemoveAll(path) }
func (OSFileSystem) Remove(name string) error                    { return os.Remove(name) }
func (OSFileSystem) ReadDir(name string) ([]os.DirEntry, error)  { return os.ReadDir(name) }
func (OSFileSystem) WalkDir(root string, fn fs.WalkDirFunc) error {
	return filepath.WalkDir(root, fn)
}
func (OSFileSystem) OpenFile(name string, flag int, perm os.FileMode) (*os.File, error) {
	return os.OpenFile(name, flag, perm)
}
