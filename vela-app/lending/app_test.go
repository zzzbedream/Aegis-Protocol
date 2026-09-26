package lending

import (
	"bytes"
	"encoding/json"
	"math/big"
	"math/rand"
	"strings"
	"testing"

	"github.com/HorizenOfficial/vela-common-go/wasm/types"
)

var (
	usdc   = mustAddr("0x00000000000000000000000000000000000000c1")
	zen    = mustAddr("0x00000000000000000000000000000000000000a1")
	weth   = mustAddr("0x00000000000000000000000000000000000000a2")
	lender = mustAddr("0x1000000000000000000000000000000000000001")
	alice  = mustAddr("0x2000000000000000000000000000000000000002")
	bob    = mustAddr("0x3000000000000000000000000000000000000003")
	liqr   = mustAddr("0x4000000000000000000000000000000000000004")
	sink   = mustAddr("0x5000000000000000000000000000000000000005")
)

func mustAddr(h string) types.Address {
	a, err := types.HexToAddress(h)
	if err != nil {
		panic(err)
	}
	return a
}

// units returns n * 10^dec as Uint256.
func units(n uint64, dec uint8) types.Uint256 {
	p, err := Pow10(dec)
	if err != nil {
		panic(err)
	}
	r, err := MulDiv(U(n), p, U(1))
	if err != nil {
		panic(err)
	}
	return r
}

func ptr(v types.Uint256) *types.Uint256 { return &v }

// usd returns a price of dollars/100 expressed with 18 decimals (usd(1050) = $10.50).
func usd(cents uint64) types.Uint256 {
	r, _ := MulDiv(U(cents), Wad, U(100))
	return r
}

func testConfig() Config {
	return Config{
		Debt: DebtConfig{Address: usdc, Decimals: 6},
		Collaterals: []CollateralConfig{
			{Address: zen, Decimals: 18, LtvBps: 7500, LiqThresholdBps: 8000, LiqBonusBps: 500},
			{Address: weth, Decimals: 18, LtvBps: 8000, LiqThresholdBps: 8500, LiqBonusBps: 500},
		},
		BorrowAprBps:   800,
		CloseFactorBps: 5000,
	}
}

func newMarket(t *testing.T) *State {
	t.Helper()
	s, err := NewState(1, testConfig())
	if err != nil {
		t.Fatal(err)
	}
	setPrices(t, s, 1_000, map[types.Address]types.Uint256{usdc: usd(100), zen: usd(1000), weth: usd(300000)})
	return s
}

// setPrices pushes a complete price update; tokens missing from px keep their last price.
func setPrices(t *testing.T, s *State, ts uint64, px map[types.Address]types.Uint256) {
	t.Helper()
	upd := &PriceUpdate{Timestamp: ts}
	for _, tok := range []types.Address{usdc, zen, weth} {
		p, ok := px[tok]
		if !ok {
			prev, had := s.Prices[tok.Hex()]
			if !had {
				t.Fatalf("no price for %s", tok.Hex())
			}
			p = prev.Price
		}
		upd.Tokens = append(upd.Tokens, tok)
		upd.Prices = append(upd.Prices, p)
	}
	dec, err := DecodePriceUpdate(EncodePriceUpdate(upd))
	if err != nil {
		t.Fatal(err)
	}
	if err := s.ApplyPriceUpdate(dec); err != nil {
		t.Fatal(err)
	}
}

// ok(t)(s.Process(...)) fails the test on error and returns the output.
func ok(t *testing.T) func(*Output, error) *Output {
	t.Helper()
	return func(out *Output, err error) *Output {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		return out
	}
}

func deposit(t *testing.T, s *State, who, tok types.Address, amt types.Uint256) {
	t.Helper()
	if _, err := s.Deposit(who, tok, amt); err != nil {
		t.Fatal(err)
	}
}

// seed: lender supplies 100k USDC; alice posts 1,000 ZEN.
func seed(t *testing.T, s *State) {
	deposit(t, s, lender, usdc, units(100_000, 6))
	ok(t)(s.Process(lender, Request{Type: "supply", Amount: ptr(units(100_000, 6))}))
	deposit(t, s, alice, zen, units(1_000, 18))
	ok(t)(s.Process(alice, Request{Type: "add_collateral", Token: zen, Amount: ptr(units(1_000, 18))}))
}

// Regression for the legacy Rust engine (tee-enclave/src/engine/liquidation.rs), whose
// saturating u128 math returned HF=0.068 for this healthy position and made it liquidatable.
func TestHealthFactorRegressionNoSaturation(t *testing.T) {
	s := newMarket(t)
	seed(t, s)
	ok(t)(s.Process(alice, Request{Type: "borrow", Amount: ptr(units(5_000, 6))}))
	hf, err := s.HealthFactor(s.Accounts[alice.Hex()])
	if err != nil {
		t.Fatal(err)
	}
	// $10,000 * 80% / $5,000 = 1.6
	want, _ := MulDiv(U(16), Wad, U(10))
	if hf != want {
		t.Fatalf("HF = %s, want %s", hf.String(), want.String())
	}
}

func TestHealthFactorLargeValues(t *testing.T) {
	s := newMarket(t)
	// 10^9 ZEN at $10 against $1e9 debt must not overflow: HF = 1e10*0.8/1e9 = 8.
	deposit(t, s, lender, usdc, units(2_000_000_000, 6))
	ok(t)(s.Process(lender, Request{Type: "supply", Amount: ptr(units(2_000_000_000, 6))}))
	deposit(t, s, alice, zen, units(1_000_000_000, 18))
	ok(t)(s.Process(alice, Request{Type: "add_collateral", Token: zen, Amount: ptr(units(1_000_000_000, 18))}))
	ok(t)(s.Process(alice, Request{Type: "borrow", Amount: ptr(units(1_000_000_000, 6))}))
	hf, err := s.HealthFactor(s.Accounts[alice.Hex()])
	if err != nil {
		t.Fatal(err)
	}
	want, _ := MulDiv(U(8), Wad, U(1))
	if hf != want {
		t.Fatalf("HF = %s, want %s", hf.String(), want.String())
	}
}

func TestBorrowCapacityEnforced(t *testing.T) {
	s := newMarket(t)
	seed(t, s)
	// capacity = $10,000 * 75% = $7,500
	if _, err := s.Process(alice, Request{Type: "borrow", Amount: ptr(units(7_501, 6))}); err != errUnhealthy {
		t.Fatalf("expected errUnhealthy, got %v", err)
	}
	ok(t)(s.Process(alice, Request{Type: "borrow", Amount: ptr(units(7_500, 6))}))
	if _, err := s.Process(alice, Request{Type: "remove_collateral", Token: zen, Amount: ptr(units(1, 18))}); err != errUnhealthy {
		t.Fatalf("expected errUnhealthy on remove, got %v", err)
	}
}

func TestBorrowRequiresLiquidity(t *testing.T) {
	s := newMarket(t)
	deposit(t, s, alice, zen, units(1_000, 18))
	ok(t)(s.Process(alice, Request{Type: "add_collateral", Token: zen, Amount: ptr(units(1_000, 18))}))
	if _, err := s.Process(alice, Request{Type: "borrow", Amount: ptr(units(1, 6))}); err != errLiquidity {
		t.Fatalf("expected errLiquidity, got %v", err)
	}
}

func TestBlindLiquidationPicksWorstPositionWithoutNamingIt(t *testing.T) {
	s := newMarket(t)
	seed(t, s)
	deposit(t, s, bob, zen, units(1_000, 18))
	ok(t)(s.Process(bob, Request{Type: "add_collateral", Token: zen, Amount: ptr(units(1_000, 18))}))
	ok(t)(s.Process(alice, Request{Type: "borrow", Amount: ptr(units(7_000, 6))})) // riskier
	ok(t)(s.Process(bob, Request{Type: "borrow", Amount: ptr(units(6_000, 6))}))

	// Healthy market: nothing to liquidate.
	deposit(t, s, liqr, usdc, units(10_000, 6))
	if _, err := s.Process(liqr, Request{Type: "liquidate", Token: zen, MaxRepay: ptr(units(10_000, 6))}); err != errNoTarget {
		t.Fatalf("expected errNoTarget, got %v", err)
	}

	// ZEN drops to $8: alice HF = 8000*0.8/7000 = 0.914, bob HF = 0.8*8000/6000 = 1.067.
	setPrices(t, s, 2_000, map[types.Address]types.Uint256{usdc: usd(100), zen: usd(800)})
	bobBefore := *s.Accounts[bob.Hex()]
	aliceDebtBefore, _ := s.DebtOf(s.Accounts[alice.Hex()])

	out := ok(t)(s.Process(liqr, Request{Type: "liquidate", Token: zen, MaxRepay: ptr(units(10_000, 6))}))
	if len(out.AppEvents) != 0 || len(out.Withdrawals) != 0 {
		t.Fatalf("liquidation must not emit public app events or withdrawals")
	}
	if len(out.Events) != 2 || out.Events[0].UserID != liqr || out.Events[1].UserID != alice {
		t.Fatalf("expected encrypted events to liquidator then borrower, got %+v", out.Events)
	}
	if bytes.Contains(bytes.ToLower(out.Events[0].Data), []byte(strings.TrimPrefix(alice.Hex(), "0x"))) {
		t.Fatalf("liquidator event leaks borrower address")
	}
	// Bob untouched.
	if s.Accounts[bob.Hex()].ScaledDebt != bobBefore.ScaledDebt {
		t.Fatalf("healthier position must not be liquidated")
	}
	// Close factor 50%: repaid = debt/2; the index has accrued since the borrow, so compare
	// against the debt observed right before the liquidation.
	aliceDebtAfter, _ := s.DebtOf(s.Accounts[alice.Hex()])
	repaid, _ := Sub(aliceDebtBefore, aliceDebtAfter)
	half, _ := MulDiv(aliceDebtBefore, U(5000), BpsDenominator)
	if new(big.Int).Sub(toBig(repaid), toBig(half)).CmpAbs(big.NewInt(1)) > 0 {
		t.Fatalf("repaid %s, want ~%s", repaid.String(), half.String())
	}
	// Seized collateral = repaid * $1 * 1.05 / $8
	var ev UserEvent
	if err := json.Unmarshal(out.Events[0].Data, &ev); err != nil {
		t.Fatal(err)
	}
	repUsd, _ := MulDiv(*ev.Repaid, Wad, units(1, 6))
	wantSeize, _ := MulDiv(repUsd, U(10500), U(10000))
	wantSeize, _ = MulDiv(wantSeize, units(1, 18), usd(800))
	if *ev.Seized != wantSeize {
		t.Fatalf("seized %s want %s", ev.Seized.String(), wantSeize.String())
	}
	if bal(s.Accounts[liqr.Hex()].Idle, zen) != wantSeize {
		t.Fatalf("liquidator not credited with seized collateral")
	}
}

func TestLiquidatorCannotTargetItself(t *testing.T) {
	s := newMarket(t)
	seed(t, s)
	ok(t)(s.Process(alice, Request{Type: "borrow", Amount: ptr(units(7_000, 6))}))
	setPrices(t, s, 2_000, map[types.Address]types.Uint256{usdc: usd(100), zen: usd(800)})
	if _, err := s.Process(alice, Request{Type: "liquidate", Token: zen, MaxRepay: ptr(units(1, 6))}); err != errNoTarget {
		t.Fatalf("self-liquidation must be impossible, got %v", err)
	}
}

func TestBadDebtWriteOff(t *testing.T) {
	s := newMarket(t)
	seed(t, s)
	ok(t)(s.Process(alice, Request{Type: "borrow", Amount: ptr(units(7_000, 6))}))
	// ZEN crashes to $1: collateral $1,000 vs $7,000 debt.
	setPrices(t, s, 2_000, map[types.Address]types.Uint256{usdc: usd(100), zen: usd(100)})
	s.Config.CloseFactorBps = 10_000
	deposit(t, s, liqr, usdc, units(10_000, 6))
	ok(t)(s.Process(liqr, Request{Type: "liquidate", Token: zen, MaxRepay: ptr(units(10_000, 6))}))
	acc := s.Accounts[alice.Hex()]
	if len(acc.Collateral) != 0 || !acc.ScaledDebt.IsZero() {
		t.Fatalf("position should be closed with remaining debt written off")
	}
	if s.BadDebt.IsZero() {
		t.Fatalf("bad debt should be recorded")
	}
	checkInvariants(t, s, nil)
}

func TestInterestAccrualAndFullRepay(t *testing.T) {
	s := newMarket(t)
	seed(t, s)
	ok(t)(s.Process(alice, Request{Type: "borrow", Amount: ptr(units(1_000, 6))}))
	// One year later at 8% APR (simple, one interval): debt = 1,080 USDC.
	setPrices(t, s, 1_000+SecondsPerYear, map[types.Address]types.Uint256{usdc: usd(100), zen: usd(1000)})
	debt, _ := s.DebtOf(s.Accounts[alice.Hex()])
	if debt != units(1_080, 6) {
		t.Fatalf("debt after 1y = %s, want 1080e6", debt.String())
	}
	// Lenders' assets include the interest.
	assets, _ := s.TotalAssets()
	if assets.Cmp(units(100_080, 6)) < 0 || assets.Cmp(units(100_081, 6)) > 0 {
		t.Fatalf("total assets %s", assets.String())
	}
	deposit(t, s, alice, usdc, units(80, 6))
	ok(t)(s.Process(alice, Request{Type: "repay", Amount: ptr(units(5_000, 6))}))
	if !s.Accounts[alice.Hex()].ScaledDebt.IsZero() || !s.TotalScaledDebt.IsZero() {
		t.Fatalf("full repay must clear the debt")
	}
	// Lender redeems everything and earns the interest.
	ok(t)(s.Process(lender, Request{Type: "redeem", Shares: ptr(s.Accounts[lender.Hex()].Shares)}))
	if got := bal(s.Accounts[lender.Hex()].Idle, usdc); got != units(100_080, 6) {
		t.Fatalf("lender redeemed %s, want 100080e6", got.String())
	}
}

func TestWithdrawProducesWithdrawal(t *testing.T) {
	s := newMarket(t)
	deposit(t, s, alice, zen, units(5, 18))
	out := ok(t)(s.Process(alice, Request{Type: "withdraw", Token: zen, Amount: ptr(units(5, 18)), To: sink}))
	if len(out.Withdrawals) != 1 || out.Withdrawals[0].DestinationAddress != sink || *out.Withdrawals[0].Amount != units(5, 18) {
		t.Fatalf("unexpected withdrawals %+v", out.Withdrawals)
	}
	if _, err := s.Process(alice, Request{Type: "withdraw", Token: zen, Amount: ptr(units(1, 18)), To: sink}); err != errBalance {
		t.Fatalf("overdraw must fail, got %v", err)
	}
}

func TestPokePublishesAggregatesOnly(t *testing.T) {
	s := newMarket(t)
	seed(t, s)
	ok(t)(s.Process(alice, Request{Type: "borrow", Amount: ptr(units(7_000, 6))}))
	setPrices(t, s, 2_000, map[types.Address]types.Uint256{usdc: usd(100), zen: usd(800)})
	out := ok(t)(s.Process(bob, Request{Type: "poke"}))
	if len(out.AppEvents) != 2 || out.AppEvents[0].EventSubType != SubtypePriceRequest || out.AppEvents[1].EventSubType != SubtypeSolvency {
		t.Fatalf("unexpected app events")
	}
	data := strings.ToLower(string(out.AppEvents[1].Data))
	for _, a := range []types.Address{alice, lender} {
		if strings.Contains(data, strings.TrimPrefix(a.Hex(), "0x")) {
			t.Fatalf("solvency report leaks an account address")
		}
	}
	var r SolvencyReport
	if err := json.Unmarshal(out.AppEvents[1].Data, &r); err != nil {
		t.Fatal(err)
	}
	if r.LiquidatableCount != 1 {
		t.Fatalf("liquidatable count %d", r.LiquidatableCount)
	}
}

func TestPriceUpdateValidation(t *testing.T) {
	s := newMarket(t)
	if err := s.ApplyPriceUpdate(&PriceUpdate{Timestamp: 1_000, Tokens: []types.Address{zen}, Prices: []types.Uint256{usd(1)}}); err != errStalePrice {
		t.Fatalf("non-increasing timestamp must be rejected, got %v", err)
	}
	if err := s.ApplyPriceUpdate(&PriceUpdate{Timestamp: 5_000, Tokens: []types.Address{usdc, zen, sink}, Prices: []types.Uint256{usd(1), usd(1), usd(1)}}); err != errToken {
		t.Fatalf("unknown token must be rejected, got %v", err)
	}
	if err := s.ApplyPriceUpdate(&PriceUpdate{Timestamp: 5_000, Tokens: []types.Address{usdc, zen, zen}, Prices: []types.Uint256{usd(1), usd(1), usd(2)}}); err != ErrBadPricePayload {
		t.Fatalf("duplicated token must be rejected, got %v", err)
	}
	// Partial update (review: stale prices would look fresh under the global clock).
	if err := s.ApplyPriceUpdate(&PriceUpdate{Timestamp: 5_000, Tokens: []types.Address{usdc}, Prices: []types.Uint256{usd(1)}}); err != ErrBadPricePayload {
		t.Fatalf("partial update must be rejected, got %v", err)
	}
}

func TestDecodePriceUpdateRejectsMalformed(t *testing.T) {
	good := EncodePriceUpdate(&PriceUpdate{Timestamp: 7, Tokens: []types.Address{zen, usdc}, Prices: []types.Uint256{usd(1), usd(2)}})
	if _, err := DecodePriceUpdate(good); err != nil {
		t.Fatal(err)
	}
	cases := map[string][]byte{
		"empty":     {},
		"truncated": good[:len(good)-1],
		"zero-ts":   append(make([]byte, 32), good[32:]...),
	}
	badLen := append([]byte{}, good...)
	badLen[64+31] = 0x01 // prices offset points into the tokens array → length mismatch
	cases["bad-offset"] = badLen
	zeroPrice := EncodePriceUpdate(&PriceUpdate{Timestamp: 7, Tokens: []types.Address{zen}, Prices: []types.Uint256{{}}})
	cases["zero-price"] = zeroPrice
	for name, b := range cases {
		if _, err := DecodePriceUpdate(b); err == nil {
			t.Errorf("%s: expected error", name)
		}
	}
}

func TestConfigValidation(t *testing.T) {
	bad := []func(*Config){
		func(c *Config) { c.Collaterals[0].LtvBps = c.Collaterals[0].LiqThresholdBps },
		func(c *Config) { c.Collaterals[0].LiqThresholdBps = 9600; c.Collaterals[0].LiqBonusBps = 500 },
		func(c *Config) { c.Collaterals[1].Address = zen },
		func(c *Config) { c.Collaterals[0].Address = usdc },
		func(c *Config) { c.CloseFactorBps = 0 },
		func(c *Config) { c.Collaterals = nil },
		// review: a huge bonus used to wrap the uint64 product and pass validation
		func(c *Config) { c.Collaterals[0].LiqBonusBps = ^uint64(0) - 5_000 },
		func(c *Config) { c.Collaterals[0].LiqBonusBps = 5_001 },
	}
	for i, mut := range bad {
		c := testConfig()
		c.Collaterals = append([]CollateralConfig{}, c.Collaterals...)
		mut(&c)
		if _, err := NewState(1, c); err == nil {
			t.Errorf("case %d: invalid config accepted", i)
		}
	}
}

func TestErrorMessagesDoNotLeakData(t *testing.T) {
	for _, e := range []error{errState, errConfig, errPayload, errToken, errAmount, errBalance, errLiquidity,
		errPrice, errUnhealthy, errNoTarget, errStalePrice, errUnknownOp, errMissingField, ErrBadPricePayload, errAml} {
		if strings.ContainsAny(e.Error(), "0123456789") {
			t.Errorf("error %q contains digits", e.Error())
		}
	}
}

func TestDeterministicStateBytes(t *testing.T) {
	run := func() []byte {
		s := newMarket(t)
		seed(t, s)
		deposit(t, s, bob, weth, units(3, 18))
		ok(t)(s.Process(bob, Request{Type: "add_collateral", Token: weth, Amount: ptr(units(3, 18))}))
		ok(t)(s.Process(alice, Request{Type: "borrow", Amount: ptr(units(100, 6))}))
		ok(t)(s.Process(bob, Request{Type: "borrow", Amount: ptr(units(100, 6))}))
		b, err := json.Marshal(s)
		if err != nil {
			t.Fatal(err)
		}
		return b
	}
	if !bytes.Equal(run(), run()) {
		t.Fatalf("state serialization is not deterministic")
	}
}

// ---------------------------------------------------------------------------
// Invariants under random operation sequences
// ---------------------------------------------------------------------------

type flows map[string]*big.Int // token hex -> deposited - withdrawn

func checkInvariants(t *testing.T, s *State, f flows) {
	t.Helper()
	sumScaled, sumShares := new(big.Int), new(big.Int)
	custody := map[string]*big.Int{}
	add := func(tok string, v types.Uint256) {
		if custody[tok] == nil {
			custody[tok] = new(big.Int)
		}
		custody[tok].Add(custody[tok], toBig(v))
	}
	for _, acc := range s.Accounts {
		sumScaled.Add(sumScaled, toBig(acc.ScaledDebt))
		sumShares.Add(sumShares, toBig(acc.Shares))
		for tok, v := range acc.Idle {
			add(tok, *v)
		}
		for tok, v := range acc.Collateral {
			add(tok, *v)
		}
	}
	add(s.Config.Debt.Address.Hex(), s.Cash)
	if sumScaled.Cmp(toBig(s.TotalScaledDebt)) != 0 {
		t.Fatalf("Σ scaled debt %v != total %v", sumScaled, toBig(s.TotalScaledDebt))
	}
	if sumShares.Cmp(toBig(s.TotalShares)) != 0 {
		t.Fatalf("Σ shares %v != total %v", sumShares, toBig(s.TotalShares))
	}
	if f == nil {
		return
	}
	// Custody conservation: idle + collateral (+ pool cash for the debt token) must equal
	// net deposits minus withdrawals for every token. Borrow/repay only move tokens between
	// pool cash and idle balances; interest and bad debt change claims, not custody.
	for tok, net := range f {
		got := new(big.Int)
		if custody[tok] != nil {
			got.Set(custody[tok])
		}
		if got.Cmp(net) != 0 {
			t.Fatalf("custody mismatch for %s: ledger %v, net deposits %v", tok, got, net)
		}
	}
}

func TestInvariantsRandomOps(t *testing.T) {
	r := rand.New(rand.NewSource(7))
	users := []types.Address{lender, alice, bob, liqr}
	for round := 0; round < 40; round++ {
		s := newMarket(t)
		if round%2 == 1 { // exercise reserves in half of the rounds
			s.Config.ReserveFactorBps = 2_000
			s.Config.Treasury = sink
		}
		if round%3 == 0 { // and the utilization-based rate model in a third
			s.Config.RateModel = kink
		}
		f := flows{}
		addFlow := func(tok types.Address, v types.Uint256, sign int) {
			h := tok.Hex()
			if f[h] == nil {
				f[h] = new(big.Int)
			}
			if sign > 0 {
				f[h].Add(f[h], toBig(v))
			} else {
				f[h].Sub(f[h], toBig(v))
			}
		}
		ts := uint64(1_000)
		for step := 0; step < 300; step++ {
			u := users[r.Intn(len(users))]
			tok := []types.Address{usdc, zen, weth}[r.Intn(3)]
			amt := units(uint64(r.Intn(5_000)+1), 6)
			if tok != usdc {
				amt = units(uint64(r.Intn(50)+1), 17)
			}
			switch r.Intn(10) {
			case 0, 1:
				if _, err := s.Deposit(u, tok, amt); err == nil {
					addFlow(tok, amt, +1)
				}
			case 2:
				_, _ = s.Process(u, Request{Type: "supply", Amount: &amt})
			case 3:
				_, _ = s.Process(u, Request{Type: "add_collateral", Token: tok, Amount: &amt})
			case 4:
				_, _ = s.Process(u, Request{Type: "borrow", Amount: ptr(units(uint64(r.Intn(3_000)+1), 6))})
			case 5:
				_, _ = s.Process(u, Request{Type: "repay", Amount: &amt})
			case 6:
				if out, err := s.Process(u, Request{Type: "withdraw", Token: tok, Amount: &amt, To: sink}); err == nil {
					addFlow(tok, *out.Withdrawals[0].Amount, -1)
				}
			case 7:
				_, _ = s.Process(u, Request{Type: "liquidate", Token: tok, MaxRepay: &amt})
			case 8:
				if acc, ok := s.Accounts[u.Hex()]; ok && !acc.Shares.IsZero() {
					_, _ = s.Process(u, Request{Type: "redeem", Shares: ptr(acc.Shares)})
				}
				_, _ = s.Process(u, Request{Type: "remove_collateral", Token: tok, Amount: &amt})
				if !s.Reserves.IsZero() {
					_, _ = s.Process(sink, Request{Type: "collect_reserves", Amount: ptr(s.Reserves)})
				}
			case 9:
				ts += uint64(r.Intn(86_400) + 1)
				setPrices(t, s, ts, map[types.Address]types.Uint256{
					usdc: usd(uint64(95 + r.Intn(10))),
					zen:  usd(uint64(200 + r.Intn(1_500))),
					weth: usd(uint64(100_000 + r.Intn(300_000))),
				})
			}
			checkInvariants(t, s, f)
		}
	}
}

// Review finding: with BorrowIndex > 1.0 a 1-unit repayment rounds to zero scaled debt.
// It must be rejected instead of taking the funds without reducing the debt.
func TestDustRepaymentRejected(t *testing.T) {
	s := newMarket(t)
	seed(t, s)
	ok(t)(s.Process(alice, Request{Type: "borrow", Amount: ptr(units(1_000, 6))}))
	setPrices(t, s, 1_000+SecondsPerYear, map[types.Address]types.Uint256{})
	if s.BorrowIndex.Cmp(Wad) <= 0 {
		t.Fatal("index should have grown")
	}
	before := *s.Accounts[alice.Hex()]
	if _, err := s.Process(alice, Request{Type: "repay", Amount: ptr(U(1))}); err != errAmount {
		t.Fatalf("dust repayment must be rejected, got %v", err)
	}
	if s.Accounts[alice.Hex()].ScaledDebt != before.ScaledDebt || bal(s.Accounts[alice.Hex()].Idle, usdc) != bal(before.Idle, usdc) {
		t.Fatal("rejected repayment mutated the ledger")
	}
}

// Review finding: the same rounding in a liquidation would seize collateral for free.
func TestDustLiquidationRejected(t *testing.T) {
	s := newMarket(t)
	seed(t, s)
	ok(t)(s.Process(alice, Request{Type: "borrow", Amount: ptr(units(7_000, 6))}))
	setPrices(t, s, 1_000+SecondsPerYear, map[types.Address]types.Uint256{zen: usd(800)})
	deposit(t, s, liqr, usdc, U(1))
	if _, err := s.Process(liqr, Request{Type: "liquidate", Token: zen, MaxRepay: ptr(U(1))}); err == nil {
		t.Fatal("dust liquidation must be rejected")
	}
	if len(s.Accounts[liqr.Hex()].Idle) != 1 || !bal(s.Accounts[liqr.Hex()].Idle, zen).IsZero() {
		t.Fatal("liquidator received collateral for a dust repayment")
	}
}

// Payload emitted by AegisPriceTrigger (Solidity abi.encode) in
// trigger/test/AegisPriceTrigger.t.sol::test_PriceRequestProducesPayloadForGuest:
// timestamp 1_700_000_000, tokens [0xc1 (USDC), 0xa1 (ZEN)], prices [$1.00, $10.50].
const triggerVector = "0x000000000000000000000000000000000000000000000000000000006553f100000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000c100000000000000000000000000000000000000000000000000000000000000a100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000091b77e5e5d9a0000"

func TestDecodeTriggerVector(t *testing.T) {
	raw, err := decodeHex(triggerVector)
	if err != nil {
		t.Fatal(err)
	}
	upd, err := DecodePriceUpdate(raw)
	if err != nil {
		t.Fatal(err)
	}
	cfg := testConfig()
	cfg.Collaterals = cfg.Collaterals[:1] // USDC debt + ZEN collateral, as in the Solidity test
	s, err := NewState(1, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.ApplyPriceUpdate(upd); err != nil {
		t.Fatal(err)
	}
	if s.LastPriceTimestamp != 1_700_000_000 || s.Prices[usdc.Hex()].Price != usd(100) || s.Prices[zen.Hex()].Price != usd(1050) {
		t.Fatalf("unexpected prices: ts=%d usdc=%s zen=%s", s.LastPriceTimestamp, s.Prices[usdc.Hex()].Price.String(), s.Prices[zen.Hex()].Price.String())
	}
	// And the Go encoder produces the very same bytes as Solidity's abi.encode.
	if got := EncodePriceUpdate(upd); !bytes.Equal(got, raw) {
		t.Fatal("Go encoding differs from Solidity abi.encode")
	}
}
