package authz

import (
	"bufio"
	"crypto/ed25519"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strings"
)

type PublicKeyRegistry struct {
	keys map[string]ed25519.PublicKey
}

func LoadPublicKeyRegistry(path string) (*PublicKeyRegistry, error) {
	r := &PublicKeyRegistry{keys: make(map[string]ed25519.PublicKey)}
	f, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return r, nil
		}
		return nil, err
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid authorized key line: %s", line)
		}
		keyID := strings.TrimSpace(parts[0])
		pubB64 := strings.TrimSpace(parts[1])
		if keyID == "" || pubB64 == "" {
			return nil, fmt.Errorf("invalid authorized key line: %s", line)
		}
		pub, err := base64.StdEncoding.DecodeString(pubB64)
		if err != nil {
			return nil, fmt.Errorf("decode public key for %s failed: %w", keyID, err)
		}
		if len(pub) != ed25519.PublicKeySize {
			return nil, fmt.Errorf("invalid ed25519 public key size for %s", keyID)
		}
		r.keys[keyID] = ed25519.PublicKey(pub)
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	return r, nil
}

func (r *PublicKeyRegistry) GetPublicKey(keyID string) (ed25519.PublicKey, bool) {
	keyID = strings.TrimSpace(keyID)
	if keyID == "" {
		return nil, false
	}
	pub, ok := r.keys[keyID]
	return pub, ok
}
