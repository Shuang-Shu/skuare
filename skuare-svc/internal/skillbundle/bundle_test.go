package skillbundle

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"testing"
)

func TestExtractTarGz(t *testing.T) {
	var archive bytes.Buffer
	gz := gzip.NewWriter(&archive)
	tw := tar.NewWriter(gz)

	writeFile := func(path string, content []byte) {
		header := &tar.Header{
			Name: path,
			Mode: 0o644,
			Size: int64(len(content)),
		}
		if err := tw.WriteHeader(header); err != nil {
			t.Fatalf("WriteHeader failed: %v", err)
		}
		if _, err := tw.Write(content); err != nil {
			t.Fatalf("Write failed: %v", err)
		}
	}

	writeFile("SKILL.md", []byte("# demo\n"))
	writeFile("assets/icon.bin", []byte{0x00, 0x01, 0x02, 0xff})
	if err := tw.Close(); err != nil {
		t.Fatalf("tar close failed: %v", err)
	}
	if err := gz.Close(); err != nil {
		t.Fatalf("gzip close failed: %v", err)
	}

	files, err := ExtractTarGz(archive.Bytes())
	if err != nil {
		t.Fatalf("ExtractTarGz failed: %v", err)
	}
	if len(files) != 2 {
		t.Fatalf("len(files)=%d, want=2", len(files))
	}
	if files[0].Path != "SKILL.md" {
		t.Fatalf("first file path=%q", files[0].Path)
	}
	if !bytes.Equal(files[1].Content, []byte{0x00, 0x01, 0x02, 0xff}) {
		t.Fatalf("binary content mismatch: %v", files[1].Content)
	}
}

func TestExtractTarGzRejectsTraversal(t *testing.T) {
	var archive bytes.Buffer
	gz := gzip.NewWriter(&archive)
	tw := tar.NewWriter(gz)
	if err := tw.WriteHeader(&tar.Header{Name: "../evil.txt", Mode: 0o644, Size: 1}); err != nil {
		t.Fatalf("WriteHeader failed: %v", err)
	}
	if _, err := tw.Write([]byte("x")); err != nil {
		t.Fatalf("Write failed: %v", err)
	}
	if err := tw.Close(); err != nil {
		t.Fatalf("tar close failed: %v", err)
	}
	if err := gz.Close(); err != nil {
		t.Fatalf("gzip close failed: %v", err)
	}

	if _, err := ExtractTarGz(archive.Bytes()); err == nil {
		t.Fatalf("expected traversal path to fail")
	}
}
