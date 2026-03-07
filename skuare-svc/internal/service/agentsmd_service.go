package service

import (
	"skuare-svc/internal/model"
	"skuare-svc/internal/store"
)

type AgentsMDService struct {
	store store.Store
}

func NewAgentsMDService(store store.Store) *AgentsMDService {
	return &AgentsMDService{store: store}
}

func (s *AgentsMDService) Create(req model.CreateAgentsMDRequest) (model.AgentsMDEntry, error) {
	return s.store.CreateAgentsMD(req)
}

func (s *AgentsMDService) List(query string) ([]model.AgentsMDEntry, error) {
	return s.store.ListAgentsMD(query)
}

func (s *AgentsMDService) GetAgentsMD(agentsmdID string) (model.AgentsMDOverview, error) {
	return s.store.GetAgentsMD(agentsmdID)
}

func (s *AgentsMDService) GetVersion(agentsmdID string, version string) (model.AgentsMDDetail, error) {
	return s.store.GetAgentsMDVersion(agentsmdID, version)
}

func (s *AgentsMDService) Delete(agentsmdID string, version string) error {
	return s.store.DeleteAgentsMD(agentsmdID, version)
}
