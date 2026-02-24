package validator

import (
	"errors"
	"fmt"
	"regexp"
	"strings"

	"skuare-svc/internal/model"
)

var (
	skillIDRe = regexp.MustCompile(`^[a-z0-9-]{1,64}$`)
	versionRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)
)

func ValidateSkillID(skillID string) error {
	if !skillIDRe.MatchString(skillID) {
		return errors.New("invalid skill_id: use [a-z0-9-], length 1-64")
	}
	return nil
}

func ValidateVersion(version string) error {
	if !versionRe.MatchString(version) {
		return errors.New("invalid version: use letters/digits/._-, length 1-64")
	}
	return nil
}

func ParseFrontMatter(skillMD string) (name, description string, err error) {
	lines := strings.Split(skillMD, "\n")
	if len(lines) < 4 || strings.TrimSpace(lines[0]) != "---" {
		return "", "", errors.New("SKILL.md must start with YAML frontmatter")
	}

	end := -1
	for i := 1; i < len(lines); i++ {
		if strings.TrimSpace(lines[i]) == "---" {
			end = i
			break
		}
	}
	if end < 0 {
		return "", "", errors.New("frontmatter end marker not found")
	}

	for _, line := range lines[1:end] {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "name:") {
			name = strings.Trim(strings.TrimSpace(strings.TrimPrefix(trimmed, "name:")), "\"'")
		}
		if strings.HasPrefix(trimmed, "description:") {
			description = strings.Trim(strings.TrimSpace(strings.TrimPrefix(trimmed, "description:")), "\"'")
		}
	}

	if name == "" || description == "" {
		return "", "", errors.New("frontmatter requires name and description")
	}
	return name, description, nil
}

func ValidateSkillSpec(skill model.SkillSpec) error {
	if strings.TrimSpace(skill.Description) == "" {
		return errors.New("skill.description is required")
	}
	if strings.TrimSpace(skill.Overview) == "" {
		return errors.New("skill.overview is required")
	}
	for i, s := range skill.Sections {
		if strings.TrimSpace(s.Title) == "" {
			return fmt.Errorf("skill.sections[%d].title is required", i)
		}
		if strings.TrimSpace(s.Content) == "" {
			return fmt.Errorf("skill.sections[%d].content is required", i)
		}
	}
	return nil
}

func RenderSkillMD(skillID string, skill model.SkillSpec) string {
	var b strings.Builder
	b.WriteString("---\n")
	b.WriteString("name: ")
	b.WriteString(skillID)
	b.WriteString("\n")
	b.WriteString("description: ")
	b.WriteString(skill.Description)
	b.WriteString("\n")
	b.WriteString("---\n\n")
	b.WriteString("# ")
	b.WriteString(skillID)
	b.WriteString("\n\n")
	b.WriteString("## Overview\n")
	b.WriteString(skill.Overview)
	b.WriteString("\n\n")
	for _, s := range skill.Sections {
		b.WriteString("## ")
		b.WriteString(s.Title)
		b.WriteString("\n")
		b.WriteString(s.Content)
		b.WriteString("\n\n")
	}
	return b.String()
}

func ValidateSkillMD(skillID string, skillMD string) (name string, description string, err error) {
	if strings.TrimSpace(skillMD) == "" {
		return "", "", errors.New("SKILL.md content is required")
	}
	name, description, err = ParseFrontMatter(skillMD)
	if err != nil {
		return "", "", err
	}
	if name != skillID {
		return "", "", fmt.Errorf("frontmatter name(%s) must equal skill_id(%s)", name, skillID)
	}
	return name, description, nil
}

func ValidateRelativeFilePath(p string) error {
	if p == "" {
		return errors.New("file path is required")
	}
	if strings.HasPrefix(p, "/") || strings.Contains(p, "..") {
		return errors.New("file path must be relative and cannot contain '..'")
	}
	return nil
}
