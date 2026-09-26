package lending

import (
	"strings"
	"testing"

	"github.com/HorizenOfficial/vela-common-go/wasm/types"
)

// Vectors produced independently with Foundry `cast` (v1.5.1), following the PureFi v5
// SDK tests (test/PureFiVerifier.t.sol):
//
//	pkg     = cast abi-encode "f(uint8,uint256,uint256,address,address)" <type> <session> 431050 <from> 0x0
//	digest  = cast keccak (uint64 ts || pkg)
//	sig     = cast wallet sign --no-hash --private-key 0x…a11ce1 digest
//	payload = cast abi-encode "f(uint64,bytes,bytes)" 1700000000 sig pkg
const (
	vecIssuer = "0xfC888BD3C689851E38b641dDb895415EB9f7F7d5"
	vecTs     = 1_700_000_000
	vecType1  = "0x000000000000000000000000000000000000000000000000000000006553f100000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000041d57df677f7c1735cf153cce2b05249dac58defe83a644dd532ac3f06ba3c374b13415f4bdb274d3da5a204decddb0e9885b5781e5dc09a96bb357d359e853a341c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000030900000000000000000000000000000000000000000000000000000000000693ca00000000000000000000000020000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000"
	vecType2  = "0x000000000000000000000000000000000000000000000000000000006553f100000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000e000000000000000000000000000000000000000000000000000000000000000419dbc5ac6f884d07d68503dcb216a0d4ed2cffac36c83c5845579d762a824bb857c008c24367a55fb4eddbe1dacd4705064405dcd0cb4eb5ddc1ec835d23c81311b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000030a00000000000000000000000000000000000000000000000000000000000693ca00000000000000000000000020000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000"
)

func TestDecodePureFiPayloadMatchesCast(t *testing.T) {
	raw, err := decodeHex(vecType1)
	if err != nil {
		t.Fatal(err)
	}
	p, err := DecodePureFiPayload(raw)
	if err != nil {
		t.Fatal(err)
	}
	if p.Signer != mustAddr(vecIssuer) {
		t.Fatalf("recovered %s, want %s", p.Signer.Hex(), vecIssuer)
	}
	if p.Timestamp != vecTs || p.Type != 1 || p.Session != U(777) || p.Rule != U(431050) || p.From != alice {
		t.Fatalf("decoded fields mismatch: %+v", p)
	}
	// Any change to the signed bytes must change the recovered signer.
	tampered := append([]byte{}, raw...)
	tampered[len(tampered)-40] ^= 0x01 // inside the package
	if p2, err := DecodePureFiPayload(tampered); err == nil && p2.Signer == p.Signer {
		t.Fatal("tampered package still recovers the issuer")
	}
}

func amlMarket(t *testing.T) *State {
	t.Helper()
	cfg := testConfig()
	cfg.Aml = AmlConfig{Issuers: []types.Address{mustAddr(vecIssuer)}, RuleID: U(431050), GraceSeconds: 600, ValiditySeconds: 30 * 86_400}
	s, err := NewState(1, cfg)
	if err != nil {
		t.Fatal(err)
	}
	setPrices(t, s, vecTs+60, map[types.Address]types.Uint256{usdc: usd(100), zen: usd(1000), weth: usd(300000)})
	return s
}

func TestAmlGate(t *testing.T) {
	s := amlMarket(t)
	deposit(t, s, alice, zen, units(10, 18)) // deposits cannot be blocked in-guest (already in custody)
	if _, err := s.Process(alice, Request{Type: "add_collateral", Token: zen, Amount: ptr(units(10, 18))}); err != errAml {
		t.Fatalf("unscreened account must be blocked, got %v", err)
	}
	// Exit paths stay open without screening, so funds are never trapped.
	ok(t)(s.Process(alice, Request{Type: "withdraw", Token: zen, Amount: ptr(units(1, 18)), To: sink}))

	// Bound to another sender → rejected.
	if _, err := s.Process(bob, Request{Type: "screen", Payload: vecType1}); err != errAml {
		t.Fatalf("package for alice must not screen bob, got %v", err)
	}
	// Types 2/3 carry no caller binding → rejected by the guest.
	if _, err := s.Process(alice, Request{Type: "screen", Payload: vecType2}); err != errAml {
		t.Fatalf("type 2 package must be rejected, got %v", err)
	}
	ok(t)(s.Process(alice, Request{Type: "screen", Payload: vecType1}))
	ok(t)(s.Process(alice, Request{Type: "add_collateral", Token: zen, Amount: ptr(units(9, 18))}))

	// Replay of the same session is rejected.
	if _, err := s.Process(alice, Request{Type: "screen", Payload: vecType1}); err != errAml {
		t.Fatalf("session replay must be rejected, got %v", err)
	}
}

func TestAmlFreshnessAndExpiry(t *testing.T) {
	s := amlMarket(t)
	// Clock (latest trusted price) moves beyond timestamp + grace → package too old.
	setPrices(t, s, vecTs+601, map[types.Address]types.Uint256{usdc: usd(100), zen: usd(1000)})
	if _, err := s.Process(alice, Request{Type: "screen", Payload: vecType1}); err != errAml {
		t.Fatalf("stale package must be rejected, got %v", err)
	}

	s = amlMarket(t)
	ok(t)(s.Process(alice, Request{Type: "screen", Payload: vecType1}))
	// After the validity window the account must re-screen.
	setPrices(t, s, vecTs+30*86_400+1, map[types.Address]types.Uint256{usdc: usd(100), zen: usd(1000)})
	deposit(t, s, alice, zen, units(1, 18))
	if _, err := s.Process(alice, Request{Type: "add_collateral", Token: zen, Amount: ptr(units(1, 18))}); err != errAml {
		t.Fatalf("expired screening must block, got %v", err)
	}
	if len(s.AmlSessions) != 0 {
		t.Fatalf("stale sessions should be pruned")
	}
}

func TestAmlWrongIssuerOrRule(t *testing.T) {
	cfg := testConfig()
	cfg.Aml = AmlConfig{Issuers: []types.Address{sink}, RuleID: U(431050), GraceSeconds: 600, ValiditySeconds: 1}
	s, _ := NewState(1, cfg)
	setPrices(t, s, vecTs, map[types.Address]types.Uint256{usdc: usd(100), zen: usd(1000), weth: usd(300000)})
	if _, err := s.Process(alice, Request{Type: "screen", Payload: vecType1}); err != errAml {
		t.Fatalf("unknown issuer must be rejected, got %v", err)
	}
	cfg.Aml.Issuers = []types.Address{mustAddr(vecIssuer)}
	cfg.Aml.RuleID = U(1)
	s, _ = NewState(1, cfg)
	setPrices(t, s, vecTs, map[types.Address]types.Uint256{usdc: usd(100), zen: usd(1000), weth: usd(300000)})
	if _, err := s.Process(alice, Request{Type: "screen", Payload: vecType1}); err != errAml {
		t.Fatalf("wrong rule must be rejected, got %v", err)
	}
	for _, bad := range []string{"", "0x", "0xzz", strings.Repeat("00", 40)} {
		if _, err := s.Process(alice, Request{Type: "screen", Payload: bad}); err == nil {
			t.Fatalf("malformed payload %q accepted", bad)
		}
	}
}

func TestReserveFactorAndCollection(t *testing.T) {
	treasury := mustAddr("0x6000000000000000000000000000000000000006")
	cfg := testConfig()
	cfg.ReserveFactorBps = 1_000 // 10% of interest
	cfg.Treasury = treasury
	s, err := NewState(1, cfg)
	if err != nil {
		t.Fatal(err)
	}
	setPrices(t, s, 1_000, map[types.Address]types.Uint256{usdc: usd(100), zen: usd(1000), weth: usd(300000)})
	seed(t, s)
	ok(t)(s.Process(alice, Request{Type: "borrow", Amount: ptr(units(1_000, 6))}))
	setPrices(t, s, 1_000+SecondsPerYear, map[types.Address]types.Uint256{usdc: usd(100), zen: usd(1000)})
	// 8% of 1,000 = 80 interest; 10% of it = 8 to reserves; lenders get 72.
	if s.Reserves != units(8, 6) {
		t.Fatalf("reserves %s, want 8e6", s.Reserves.String())
	}
	assets, _ := s.TotalAssets()
	if assets != units(100_072, 6) {
		t.Fatalf("lender assets %s, want 100072e6", assets.String())
	}
	if _, err := s.Process(alice, Request{Type: "collect_reserves", Amount: ptr(units(1, 6))}); err != errUnknownOp {
		t.Fatalf("only the treasury can collect, got %v", err)
	}
	ok(t)(s.Process(treasury, Request{Type: "collect_reserves", Amount: ptr(units(8, 6))}))
	if bal(s.Accounts[treasury.Hex()].Idle, usdc) != units(8, 6) || !s.Reserves.IsZero() {
		t.Fatalf("reserves not moved to treasury")
	}
	checkInvariants(t, s, nil)
}

func TestConfigValidationReservesAndAml(t *testing.T) {
	c := testConfig()
	c.ReserveFactorBps = 100 // treasury missing
	if _, err := NewState(1, c); err == nil {
		t.Fatal("reserve factor without treasury accepted")
	}
	c = testConfig()
	c.Aml = AmlConfig{Issuers: []types.Address{mustAddr(vecIssuer)}} // grace/validity missing
	if _, err := NewState(1, c); err == nil {
		t.Fatal("AML without grace/validity accepted")
	}
}
