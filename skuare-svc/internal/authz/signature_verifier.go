package authz

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	HeaderKeyID     = "X-Skuare-Key-Id"
	HeaderTimestamp = "X-Skuare-Timestamp"
	HeaderNonce     = "X-Skuare-Nonce"
	HeaderSignature = "X-Skuare-Signature"
)

type SignatureVerifier struct {
	reg      *PublicKeyRegistry
	maxSkew  time.Duration
	now      func() time.Time
	mu       sync.Mutex
	nonceTTL map[string]time.Time
}

func NewSignatureVerifier(reg *PublicKeyRegistry) *SignatureVerifier {
	return NewSignatureVerifierWithMaxSkew(reg, 5*time.Minute)
}

func NewSignatureVerifierWithMaxSkew(reg *PublicKeyRegistry, maxSkew time.Duration) *SignatureVerifier {
	if maxSkew <= 0 {
		maxSkew = 5 * time.Minute
	}
	return &SignatureVerifier{
		reg:      reg,
		maxSkew:  maxSkew,
		now:      time.Now,
		nonceTTL: make(map[string]time.Time),
	}
}

func CanonicalMessage(method string, path string, body []byte, timestamp string, nonce string) []byte {
	sum := sha256.Sum256(body)
	bodyHash := hex.EncodeToString(sum[:])
	msg := strings.Join([]string{
		strings.ToUpper(strings.TrimSpace(method)),
		path,
		bodyHash,
		strings.TrimSpace(timestamp),
		strings.TrimSpace(nonce),
	}, "\n")
	return []byte(msg)
}

func (v *SignatureVerifier) Verify(method string, path string, body []byte, keyID string, timestamp string, nonce string, signatureB64 string) error {
	if v.reg == nil {
		return ErrForbidden
	}
	pub, ok := v.reg.GetPublicKey(keyID)
	if !ok || len(pub) != ed25519.PublicKeySize {
		return ErrForbidden
	}

	ts, err := strconv.ParseInt(strings.TrimSpace(timestamp), 10, 64)
	if err != nil {
		return ErrForbidden
	}
	now := v.now().UTC()
	reqTime := time.Unix(ts, 0).UTC()
	diff := now.Sub(reqTime)
	if diff < 0 {
		diff = -diff
	}
	if diff > v.maxSkew {
		return ErrForbidden
	}

	nonce = strings.TrimSpace(nonce)
	if nonce == "" {
		return ErrForbidden
	}
	if !v.claimNonce(keyID, nonce, now.Add(v.maxSkew)) {
		return ErrForbidden
	}

	sig, err := base64.StdEncoding.DecodeString(strings.TrimSpace(signatureB64))
	if err != nil {
		return ErrForbidden
	}
	msg := CanonicalMessage(method, path, body, timestamp, nonce)
	if !ed25519.Verify(pub, msg, sig) {
		return ErrForbidden
	}
	return nil
}

func (v *SignatureVerifier) claimNonce(keyID string, nonce string, expiresAt time.Time) bool {
	v.mu.Lock()
	defer v.mu.Unlock()
	now := v.now().UTC()
	for k, exp := range v.nonceTTL {
		if !exp.After(now) {
			delete(v.nonceTTL, k)
		}
	}
	k := keyID + ":" + nonce
	if exp, ok := v.nonceTTL[k]; ok && exp.After(now) {
		return false
	}
	v.nonceTTL[k] = expiresAt
	return true
}
