package main

import (
	"encoding/base64"
	"testing"
)

func TestBase64urlMatchesTheStandardAlphabetWithoutPadding(t *testing.T) {
	for input, want := range map[string]string{"": "", "f": "Zg", "fo": "Zm8", "foo": "Zm9v", "\xfb\xff": "-_8"} {
		if got := base64.RawURLEncoding.EncodeToString([]byte(input)); got != want {
			t.Errorf("%q: %q, want %q", input, got, want)
		}
	}
	if got := releaseHexBytes("fbff"); string(got) != "\xfb\xff" {
		t.Errorf("hex bytes: %x", got)
	}
}
