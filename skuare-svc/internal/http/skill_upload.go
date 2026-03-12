package http

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"strings"

	"github.com/cloudwego/hertz/pkg/app"

	"skuare-svc/internal/model"
	"skuare-svc/internal/skillbundle"
)

func isMultipartSkillUpload(c *app.RequestContext) bool {
	contentType := strings.TrimSpace(string(c.Request.Header.ContentType()))
	if contentType == "" {
		return false
	}
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return false
	}
	return mediaType == "multipart/form-data"
}

func parseMultipartSkillUpload(c *app.RequestContext) (model.CreateSkillUploadRequest, error) {
	contentType := strings.TrimSpace(string(c.Request.Header.ContentType()))
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return model.CreateSkillUploadRequest{}, errors.New("invalid multipart content-type: " + err.Error())
	}
	boundary := strings.TrimSpace(params["boundary"])
	if boundary == "" {
		return model.CreateSkillUploadRequest{}, errors.New("invalid multipart request: boundary is required")
	}

	reader := multipart.NewReader(bytes.NewReader(c.Request.Body()), boundary)
	var metadata model.CreateSkillVersionRequest
	var metadataSeen bool
	var bundleData []byte

	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return model.CreateSkillUploadRequest{}, errors.New("invalid multipart request: " + err.Error())
		}

		payload, err := io.ReadAll(part)
		_ = part.Close()
		if err != nil {
			return model.CreateSkillUploadRequest{}, errors.New("invalid multipart part: " + err.Error())
		}

		switch part.FormName() {
		case "metadata":
			if metadataSeen {
				return model.CreateSkillUploadRequest{}, errors.New("invalid multipart request: duplicate metadata part")
			}
			if err := json.Unmarshal(payload, &metadata); err != nil {
				return model.CreateSkillUploadRequest{}, errors.New("invalid metadata JSON: " + err.Error())
			}
			metadataSeen = true
		case "bundle":
			if bundleData != nil {
				return model.CreateSkillUploadRequest{}, errors.New("invalid multipart request: duplicate bundle part")
			}
			bundleData = payload
		case "":
			return model.CreateSkillUploadRequest{}, errors.New("invalid multipart request: unnamed part")
		default:
			return model.CreateSkillUploadRequest{}, errors.New("invalid multipart request: unexpected part " + part.FormName())
		}
	}

	if !metadataSeen {
		return model.CreateSkillUploadRequest{}, errors.New("invalid multipart request: missing metadata part")
	}
	files, err := skillbundle.ExtractTarGz(bundleData)
	if err != nil {
		return model.CreateSkillUploadRequest{}, err
	}
	return model.CreateSkillUploadRequest{
		SkillID: metadata.SkillID,
		Version: metadata.Version,
		Force:   metadata.Force,
		Skill:   metadata.Skill,
		Files:   files,
	}, nil
}
