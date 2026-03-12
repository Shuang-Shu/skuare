package skillbundle

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"errors"
	"io"
	"path/filepath"

	"skuare-svc/internal/model"
	"skuare-svc/internal/validator"
)

func ExtractTarGz(data []byte) ([]model.UploadedFile, error) {
	if len(data) == 0 {
		return nil, errors.New("invalid skill bundle: bundle is required")
	}

	gz, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, errors.New("invalid skill bundle: " + err.Error())
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	files := make([]model.UploadedFile, 0)
	seen := make(map[string]struct{})

	for {
		header, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, errors.New("invalid skill bundle: " + err.Error())
		}
		if header.FileInfo().IsDir() {
			continue
		}
		if header.Typeflag != tar.TypeReg && header.Typeflag != tar.TypeRegA {
			return nil, errors.New("invalid skill bundle: only regular files are supported")
		}

		cleanPath := filepath.ToSlash(filepath.Clean(header.Name))
		if err := validator.ValidateRelativeFilePath(cleanPath); err != nil {
			return nil, err
		}
		if _, ok := seen[cleanPath]; ok {
			return nil, errors.New("invalid skill bundle: duplicate file path " + cleanPath)
		}
		content, err := io.ReadAll(tr)
		if err != nil {
			return nil, errors.New("invalid skill bundle: " + err.Error())
		}
		seen[cleanPath] = struct{}{}
		files = append(files, model.UploadedFile{
			Path:    cleanPath,
			Content: content,
		})
	}

	if len(files) == 0 {
		return nil, errors.New("invalid skill bundle: no files found")
	}
	return files, nil
}
