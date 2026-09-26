package lending

import (
	"testing"

	"github.com/HorizenOfficial/vela-common-go/wasm/types"
)

var kink = RateModel{BaseAprBps: 200, Slope1Bps: 800, Slope2Bps: 6_000, KinkBps: 8_000}

func TestRateModelShape(t *testing.T) {
	if got := kink.AprAt(0); got != 200 {
		t.Fatalf("APR(0) = %d, want base 200", got)
	}
	if got := kink.AprAt(8_000); got != 1_000 {
		t.Fatalf("APR(kink) = %d, want base+slope1 = 1000", got)
	}
	if got := kink.AprAt(10_000); got != 7_000 {
		t.Fatalf("APR(100%%) = %d, want 7000", got)
	}
	// Continuity at the kink (both branches meet) and monotonicity everywhere.
	if kink.AprAt(8_000) != kink.BaseAprBps+kink.Slope1Bps {
		t.Fatal("discontinuity at the kink")
	}
	prev := uint64(0)
	for u := uint64(0); u <= 10_000; u++ {
		a := kink.AprAt(u)
		if a < prev {
			t.Fatalf("APR not monotonic at U=%d: %d < %d", u, a, prev)
		}
		prev = a
	}
	// The second slope is steeper: +1% utilization above the kink costs more than below it.
	below := kink.AprAt(7_100) - kink.AprAt(7_000)
	above := kink.AprAt(9_100) - kink.AprAt(9_000)
	if above <= below {
		t.Fatalf("slope above kink (%d) must exceed slope below (%d)", above, below)
	}
}

func rateMarket(t *testing.T) *State {
	t.Helper()
	cfg := testConfig()
	cfg.BorrowAprBps = 0
	cfg.RateModel = kink
	s, err := NewState(1, cfg)
	if err != nil {
		t.Fatal(err)
	}
	setPrices(t, s, 1_000, map[types.Address]types.Uint256{usdc: usd(100), zen: usd(1000), weth: usd(300000)})
	return s
}

func TestInterestFollowsUtilization(t *testing.T) {
	accrue := func(borrow uint64) (uint64, types.Uint256) {
		s := rateMarket(t)
		deposit(t, s, lender, usdc, units(10_000, 6))
		ok(t)(s.Process(lender, Request{Type: "supply", Amount: ptr(units(10_000, 6))}))
		deposit(t, s, alice, weth, units(10, 18)) // $30,000 collateral, LTV 80%
		ok(t)(s.Process(alice, Request{Type: "add_collateral", Token: weth, Amount: ptr(units(10, 18))}))
		ok(t)(s.Process(alice, Request{Type: "borrow", Amount: ptr(units(borrow, 6))}))
		u, _ := s.UtilizationBps()
		setPrices(t, s, 1_000+SecondsPerYear, map[types.Address]types.Uint256{})
		d, _ := s.DebtOf(s.Accounts[alice.Hex()])
		return u, d
	}
	// 50% utilization → APR = 200 + 800*5000/8000 = 700 bps → debt 5,000 * 1.07 = 5,350.
	u, d := accrue(5_000)
	if u != 5_000 || d != units(5_350, 6) {
		t.Fatalf("U=%d debt=%s, want 5000 and 5350e6", u, d.String())
	}
	// 90% utilization → APR = 1000 + 6000*1000/2000 = 4000 bps → debt 9,000 * 1.40 = 12,600.
	u, d = accrue(9_000)
	if u != 9_000 || d != units(12_600, 6) {
		t.Fatalf("U=%d debt=%s, want 9000 and 12600e6", u, d.String())
	}
}

func TestReportExposesRate(t *testing.T) {
	s := rateMarket(t)
	deposit(t, s, lender, usdc, units(1_000, 6))
	ok(t)(s.Process(lender, Request{Type: "supply", Amount: ptr(units(1_000, 6))}))
	r, err := s.Report()
	if err != nil {
		t.Fatal(err)
	}
	if r.UtilizationBps != 0 || r.BorrowAprBps != 200 {
		t.Fatalf("report U=%d APR=%d, want 0 and 200", r.UtilizationBps, r.BorrowAprBps)
	}
}

func TestRateModelValidation(t *testing.T) {
	for i, m := range []RateModel{
		{BaseAprBps: 100, Slope1Bps: 100, Slope2Bps: 100, KinkBps: 0},
		{BaseAprBps: 100, Slope1Bps: 100, Slope2Bps: 100, KinkBps: 10_000},
		{BaseAprBps: 60_000, Slope1Bps: 30_000, Slope2Bps: 20_000, KinkBps: 5_000}, // sum > cap
	} {
		cfg := testConfig()
		cfg.RateModel = m
		if _, err := NewState(1, cfg); err == nil {
			t.Errorf("case %d: invalid rate model accepted", i)
		}
	}
}
