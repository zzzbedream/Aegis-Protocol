package wasmtest

import (
	"encoding/hex"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	velacrypto "github.com/HorizenOfficial/vela/pkg/crypto"
)

// The browser encrypts instructions with @horizen/vela-common-ts and decrypts its events with
// it; the enclave does the opposite with vela/pkg/crypto. This test runs both directions with
// the real libraries (Node for JS, Go for the executor side).
func TestP521InteropWithBrowserLibrary(t *testing.T) {
	script, _ := filepath.Abs(filepath.Join("..", "..", "frontend", "tests", "interop", "p521.mjs"))
	if _, err := os.Stat(filepath.Join("..", "..", "frontend", "node_modules", "@horizen", "vela-common-ts")); err != nil {
		t.Skip("frontend dependencies not installed (run `npm ci` in frontend/)")
	}
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node not installed")
	}
	node := func(args ...string) string {
		t.Helper()
		cmd := exec.Command("node", append([]string{script}, args...)...)
		cmd.Dir = filepath.Dir(script)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("node %v: %v\n%s", args[0], err, out)
		}
		return strings.TrimSpace(string(out))
	}

	teePriv, err := velacrypto.GeneratePrivateKeyP521()
	if err != nil {
		t.Fatal(err)
	}
	teePubHex := velacrypto.ExportPublicKeyP521ToHex(teePriv.PublicKey())
	if !strings.HasPrefix(teePubHex, "0x") {
		teePubHex = "0x" + teePubHex
	}

	// Browser -> enclave: an instruction exactly as the frontend builds it.
	instruction := `{"type":"liquidate","token":"0x00000000000000000000000000000000000000a1","maxRepay":"0x2540be400"}`
	var enc struct{ UserPub, UserPriv, Cipher string }
	if err := json.Unmarshal([]byte(node("encrypt", teePubHex, instruction)), &enc); err != nil {
		t.Fatal(err)
	}
	userPub, err := velacrypto.ImportPublicKeyP521FromHex(enc.UserPub)
	if err != nil {
		t.Fatalf("Go cannot import the browser's public key: %v", err)
	}
	cipher, err := hex.DecodeString(strings.TrimPrefix(enc.Cipher, "0x"))
	if err != nil {
		t.Fatal(err)
	}
	plain, err := velacrypto.Decrypt(userPub, teePriv, cipher)
	if err != nil {
		t.Fatalf("executor-side Decrypt failed on a browser ciphertext: %v", err)
	}
	if string(plain) != instruction {
		t.Fatalf("decrypted %q", plain)
	}

	// Enclave -> browser: an encrypted user event.
	event := `{"type":"position_liquidated","seized":"0x10","nonce":3}`
	evCipher, err := velacrypto.Encrypt(teePriv, userPub, []byte(event))
	if err != nil {
		t.Fatal(err)
	}
	if got := node("decrypt", enc.UserPriv, teePubHex, "0x"+hex.EncodeToString(evCipher)); got != event {
		t.Fatalf("browser decrypted %q, want %q", got, event)
	}
}
