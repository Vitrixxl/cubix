package main

import (
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Google sign-in: the web app's Google button yields an ID token, a JWT Google signs; it is checked here with Google's
// public keys, for this app's client ID (CUBIX_GOOGLE_CLIENT_ID, public too). No secret is involved.

const googleCerts = "https://www.googleapis.com/oauth2/v3/certs"

// googleKeys: Google's keys by id, until their Cache-Control max-age; fetched again at most once a minute for an id
// they lack.
var googleKeys struct {
	sync.Mutex
	keys           map[string]*rsa.PublicKey
	until, fetched time.Time
}

var errGoogle = apiErr(401, "Google sign-in failed. Please try again.")

func googleKey(kid string) (*rsa.PublicKey, error) {
	googleKeys.Lock()
	defer googleKeys.Unlock()
	now := time.Now()
	if key := googleKeys.keys[kid]; key != nil && now.Before(googleKeys.until) {
		return key, nil
	}
	if now.Sub(googleKeys.fetched) < time.Minute && now.Before(googleKeys.until) {
		return nil, errGoogle
	}
	client := http.Client{Timeout: 10 * time.Second}
	res, err := client.Get(googleCerts)
	if err != nil {
		return nil, apiErr(503, "Google cannot be reached. Please try again.")
	}
	defer res.Body.Close()
	var set struct {
		Keys []struct{ Kid, N, E string }
	}
	if res.StatusCode != 200 || json.NewDecoder(res.Body).Decode(&set) != nil {
		return nil, apiErr(503, "Google cannot be reached. Please try again.")
	}
	keys := map[string]*rsa.PublicKey{}
	for _, k := range set.Keys {
		n, err1 := base64.RawURLEncoding.DecodeString(k.N)
		e, err2 := base64.RawURLEncoding.DecodeString(k.E)
		if err1 == nil && err2 == nil {
			keys[k.Kid] = &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(new(big.Int).SetBytes(e).Int64())}
		}
	}
	age := time.Hour
	for _, part := range strings.Split(res.Header.Get("Cache-Control"), ",") {
		if v, ok := strings.CutPrefix(strings.TrimSpace(part), "max-age="); ok {
			if s, err := strconv.Atoi(v); err == nil {
				age = time.Duration(s) * time.Second
			}
		}
	}
	googleKeys.keys, googleKeys.fetched, googleKeys.until = keys, now, now.Add(age)
	if key := keys[kid]; key != nil {
		return key, nil
	}
	return nil, errGoogle
}

// GoogleClaims: what an ID token says of its account.
type GoogleClaims struct {
	Iss, Aud, Sub, Name string
	Exp                 float64
}

// googleVerify: the claims of an RS256 ID token Google signed for `client`, unexpired.
func googleVerify(token, client string) (*GoogleClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 || client == "" {
		return nil, errGoogle
	}
	var header struct{ Alg, Kid string }
	var claims GoogleClaims
	head, err1 := base64.RawURLEncoding.DecodeString(parts[0])
	body, err2 := base64.RawURLEncoding.DecodeString(parts[1])
	sig, err3 := base64.RawURLEncoding.DecodeString(parts[2])
	if errors.Join(err1, err2, err3) != nil || json.Unmarshal(head, &header) != nil || json.Unmarshal(body, &claims) != nil || header.Alg != "RS256" {
		return nil, errGoogle
	}
	key, err := googleKey(header.Kid)
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if rsa.VerifyPKCS1v15(key, crypto.SHA256, digest[:], sig) != nil {
		return nil, errGoogle
	}
	if claims.Iss != "accounts.google.com" && claims.Iss != "https://accounts.google.com" || claims.Aud != client ||
		claims.Sub == "" || float64(time.Now().Unix()) >= claims.Exp {
		return nil, errGoogle
	}
	return &claims, nil
}
