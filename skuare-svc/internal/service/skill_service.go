package service

import (
	"skuare-svc/internal/model"
	"skuare-svc/internal/store"
)

type SkillService struct {
	store store.Store
}

func NewSkillService(store store.Store) *SkillService {
	return &SkillService{store: store}
}

func (s *SkillService) Create(req model.CreateSkillVersionRequest) (model.SkillEntry, error) {
	return s.store.Create(req)
}

func (s *SkillService) List(query string) ([]model.SkillEntry, error) {
	return s.store.List(query)
}

func (s *SkillService) GetSkill(skillID string) (model.SkillOverview, error) {
	return s.store.GetSkill(skillID)
}

func (s *SkillService) GetVersion(skillID string, version string) (model.SkillDetail, error) {
	return s.store.GetVersion(skillID, version)
}

func (s *SkillService) Delete(skillID string, version string) error {
	return s.store.Delete(skillID, version)
}

func (s *SkillService) Validate(skillID string, version string) (model.SkillEntry, error) {
	return s.store.Validate(skillID, version)
}

func (s *SkillService) Reindex() (int, error) {
	return s.store.Reindex()
}
