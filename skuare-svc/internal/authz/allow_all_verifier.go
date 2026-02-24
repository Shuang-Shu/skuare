package authz

type WriteAuthorizer interface {
	Verify(method string, path string, body []byte, keyID string, timestamp string, nonce string, signatureB64 string) error
}

type AllowAllVerifier struct{}

func NewAllowAllVerifier() *AllowAllVerifier {
	return &AllowAllVerifier{}
}

func (v *AllowAllVerifier) Verify(string, string, []byte, string, string, string, string) error {
	return nil
}
