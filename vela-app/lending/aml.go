package lending

import (
	"errors"

	"github.com/HorizenOfficial/vela-common-go/wasm/types"
	"github.com/decred/dcrd/dcrec/secp256k1/v4/ecdsa"
	"golang.org/x/crypto/sha3"
)

// PureFi v5 (github.com/purefiprotocol/sdk-solidity-v5, PureFiVerifier._validatePayload):
//
//	payload = abi.encode(uint64 timestamp, bytes signature, bytes package)
//	digest  = keccak256(abi.encodePacked(uint64 timestamp, package))   // no EIP-191 prefix
//	signer  = ecrecover(digest, signature)  must hold ISSUER_ROLE
//	package = abi.encode(uint8 type, uint256 session, uint256 rule, address from, address to, ...)
//
// The on-chain verifier additionally enforces block.timestamp <= timestamp + graceTime and
// one-time use of `session`. The guest has no clock, so freshness is checked against the
// latest trusted price timestamp (a lower bound of "now"); see ADR-001 §6.

var errAml = errors.New("compliance check failed")

// MaxAmlPayload bounds the size of a PureFi payload accepted by the guest.
const MaxAmlPayload = 2048

// AmlConfig enables PureFi screening. It is disabled when Issuers is empty.
type AmlConfig struct {
	Issuers []types.Address `json:"issuers"`
	RuleID  types.Uint256   `json:"ruleId"`
	// GraceSeconds mirrors PureFiVerifier.graceTime (600 s on the reference deployment).
	GraceSeconds uint64 `json:"graceSeconds"`
	// ValiditySeconds is how long a successful screening authorises the account.
	ValiditySeconds uint64 `json:"validitySeconds"`
}

func (c AmlConfig) enabled() bool { return len(c.Issuers) > 0 }

// PureFiPackage is the decoded subset of a PureFi v5 payload used by the guest.
type PureFiPackage struct {
	Timestamp uint64
	Type      uint8
	Session   types.Uint256
	Rule      types.Uint256
	From      types.Address
	To        types.Address
	Signer    types.Address
}

func readBytesAt(b []byte, headOff uint64) ([]byte, bool) {
	w, ok := word(b, headOff)
	if !ok {
		return nil, false
	}
	off, ok := wordAsUint64(w)
	if !ok {
		return nil, false
	}
	lw, ok := word(b, off)
	if !ok {
		return nil, false
	}
	n, ok := wordAsUint64(lw)
	if !ok || n > MaxAmlPayload {
		return nil, false
	}
	start := off + 32
	if uint64(len(b)) < start || uint64(len(b))-start < n {
		return nil, false
	}
	return b[start : start+n], true
}

func addressWord(w []byte) (types.Address, bool) {
	for _, c := range w[:12] {
		if c != 0 {
			return types.Address{}, false
		}
	}
	return types.BytesToAddress(w[12:]), true
}

// DecodePureFiPayload parses a PureFi v5 payload and recovers the issuer address.
// It does NOT decide whether the issuer, rule, session or timing are acceptable.
func DecodePureFiPayload(b []byte) (*PureFiPackage, error) {
	if len(b) > MaxAmlPayload {
		return nil, errAml
	}
	tsw, ok := word(b, 0)
	if !ok {
		return nil, errAml
	}
	ts, ok := wordAsUint64(tsw)
	if !ok {
		return nil, errAml
	}
	sig, ok := readBytesAt(b, 32)
	if !ok || len(sig) != 65 {
		return nil, errAml
	}
	pkg, ok := readBytesAt(b, 64)
	if !ok || len(pkg) < 160 {
		return nil, errAml
	}
	p := &PureFiPackage{Timestamp: ts}
	typeWord, _ := word(pkg, 0)
	t, ok := wordAsUint64(typeWord)
	if !ok || t > 255 {
		return nil, errAml
	}
	p.Type = uint8(t)
	sw, _ := word(pkg, 32)
	p.Session.SetBytes(sw)
	rw, _ := word(pkg, 64)
	p.Rule.SetBytes(rw)
	fw, _ := word(pkg, 96)
	if p.From, ok = addressWord(fw); !ok {
		return nil, errAml
	}
	tw, _ := word(pkg, 128)
	if p.To, ok = addressWord(tw); !ok {
		return nil, errAml
	}

	// digest = keccak256(abi.encodePacked(uint64 timestamp, package))
	h := sha3.NewLegacyKeccak256()
	var ts8 [8]byte
	for i := 0; i < 8; i++ {
		ts8[7-i] = byte(ts >> (8 * i))
	}
	h.Write(ts8[:])
	h.Write(pkg)
	digest := h.Sum(nil)

	signer, ok := recoverAddress(digest, sig)
	if !ok {
		return nil, errAml
	}
	p.Signer = signer
	return p, nil
}

// secp256k1n / 2, the EIP-2 upper bound for s (OpenZeppelin ECDSA.tryRecover rejects above it).
var secp256k1HalfN = [32]byte{
	0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
	0x5d, 0x57, 0x6e, 0x73, 0x57, 0xa4, 0x50, 0x1d, 0xdf, 0xe9, 0x2f, 0x46, 0x68, 0x1b, 0x20, 0xa0,
}

// recoverAddress mirrors OpenZeppelin ECDSA.tryRecover for a 65-byte r||s||v signature.
func recoverAddress(digest, sig []byte) (types.Address, bool) {
	v := sig[64]
	if v != 27 && v != 28 {
		return types.Address{}, false
	}
	var sHigh bool
	for i := 0; i < 32; i++ {
		if sig[32+i] != secp256k1HalfN[i] {
			sHigh = sig[32+i] > secp256k1HalfN[i]
			break
		}
	}
	if sHigh {
		return types.Address{}, false
	}
	compact := make([]byte, 65)
	compact[0] = v
	copy(compact[1:], sig[:64])
	pub, _, err := ecdsa.RecoverCompact(compact, digest)
	if err != nil {
		return types.Address{}, false
	}
	h := sha3.NewLegacyKeccak256()
	h.Write(pub.SerializeUncompressed()[1:])
	return types.BytesToAddress(h.Sum(nil)[12:]), true
}

// verifyAml checks a PureFi payload for sender and returns the session to burn.
func (s *State) verifyAml(sender types.Address, payload []byte) (*PureFiPackage, error) {
	p, err := DecodePureFiPayload(payload)
	if err != nil {
		return nil, err
	}
	authorised := false
	for _, iss := range s.Config.Aml.Issuers {
		if iss == p.Signer {
			authorised = true
			break
		}
	}
	if !authorised || p.Rule != s.Config.Aml.RuleID {
		return nil, errAml
	}
	// Types 2 and 3 are exempt from caller binding on-chain; the guest requires binding.
	if p.Type == 2 || p.Type == 3 || (p.From != sender && p.To != sender) {
		return nil, errAml
	}
	// Freshness: the guest's only clock is the latest trusted price timestamp.
	if s.LastPriceTimestamp == 0 || p.Timestamp+s.Config.Aml.GraceSeconds < s.LastPriceTimestamp {
		return nil, errAml
	}
	if _, used := s.AmlSessions[p.Session.ToHex()]; used {
		return nil, errAml
	}
	return p, nil
}

// requireAml enforces a valid screening for sender when AML is enabled.
func (s *State) requireAml(sender types.Address) error {
	if !s.Config.Aml.enabled() {
		return nil
	}
	acc, ok := s.Accounts[sender.Hex()]
	if !ok || acc.AmlValidUntil == 0 || acc.AmlValidUntil < s.LastPriceTimestamp {
		return errAml
	}
	return nil
}

func (s *State) screen(sender types.Address, req Request) (*Output, error) {
	if !s.Config.Aml.enabled() {
		return nil, errUnknownOp
	}
	if req.Payload == "" {
		return nil, errMissingField
	}
	raw, err := decodeHex(req.Payload)
	if err != nil {
		return nil, errAml
	}
	p, err := s.verifyAml(sender, raw)
	if err != nil {
		return nil, err
	}
	if s.AmlSessions == nil {
		s.AmlSessions = map[string]uint64{}
	}
	s.AmlSessions[p.Session.ToHex()] = p.Timestamp
	s.account(sender).AmlValidUntil = p.Timestamp + s.Config.Aml.ValiditySeconds
	return s.single(sender, UserEvent{Type: "screening_accepted"})
}

// pruneAmlSessions drops burnt sessions that can no longer pass the freshness check.
func (s *State) pruneAmlSessions() {
	for k, ts := range s.AmlSessions {
		if ts+s.Config.Aml.GraceSeconds < s.LastPriceTimestamp {
			delete(s.AmlSessions, k)
		}
	}
}

func decodeHex(h string) ([]byte, error) {
	if len(h) >= 2 && h[0] == '0' && (h[1] == 'x' || h[1] == 'X') {
		h = h[2:]
	}
	if len(h)%2 != 0 || len(h)/2 > MaxAmlPayload {
		return nil, errAml
	}
	out := make([]byte, len(h)/2)
	for i := 0; i < len(out); i++ {
		hi, ok1 := nib(h[2*i])
		lo, ok2 := nib(h[2*i+1])
		if !ok1 || !ok2 {
			return nil, errAml
		}
		out[i] = hi<<4 | lo
	}
	return out, nil
}

func nib(c byte) (byte, bool) {
	switch {
	case c >= '0' && c <= '9':
		return c - '0', true
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10, true
	case c >= 'A' && c <= 'F':
		return c - 'A' + 10, true
	}
	return 0, false
}
