package config

import "testing"

func TestEnvBool(t *testing.T) {
	cases := map[string]bool{
		"":      false,
		"true":  true,
		"1":     true,
		"on":    true,
		"yes":   true,
		"false": false,
		"0":     false,
		"off":   false,
		"no":    false,
		"abc":   false,
	}
	for in, want := range cases {
		if got := envBool(in); got != want {
			t.Fatalf("envBool(%q)=%v, want=%v", in, got, want)
		}
	}
}
