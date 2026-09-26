// Package wasmtest runs the TinyGo-compiled aegis_lending.wasm inside Horizen's own
// Vela WasmtimeRuntime (github.com/HorizenOfficial/vela v0.2.0), i.e. the same host code
// the executor uses inside the Nitro enclave, minus the enclave and the chain.
package wasmtest

import (
	"context"
	"encoding/json"
	"math/big"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/HorizenOfficial/vela-common-go/wasm/types"
	"github.com/HorizenOfficial/vela/pkg/common"
	"github.com/HorizenOfficial/vela/pkg/logger"
	"github.com/HorizenOfficial/vela/pkg/wasm"
	ethCommon "github.com/ethereum/go-ethereum/common"
	"github.com/zzzbedream/Aegis-Protocol/vela-app/lending"
)

var (
	usdc   = ethCommon.HexToAddress("0x00000000000000000000000000000000000000c1")
	zen    = ethCommon.HexToAddress("0x00000000000000000000000000000000000000a1")
	lender = ethCommon.HexToAddress("0x1000000000000000000000000000000000000001")
	alice  = ethCommon.HexToAddress("0x2000000000000000000000000000000000000002")
	liqr   = ethCommon.HexToAddress("0x4000000000000000000000000000000000000004")
	sink   = ethCommon.HexToAddress("0x5000000000000000000000000000000000000005")
)

func buildWasm(t *testing.T) []byte {
	t.Helper()
	if _, err := exec.LookPath("tinygo"); err != nil {
		t.Skip("tinygo not installed; run `make test-wasm` in an environment with TinyGo >= 0.39")
	}
	cmd := exec.Command("make", "build")
	cmd.Dir = ".."
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("tinygo build failed: %v\n%s", err, out)
	}
	b, err := os.ReadFile(filepath.Join("..", "build", "aegis_lending.wasm"))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func newRuntime() *wasm.WasmtimeRuntime {
	return wasm.NewWasmtimeRuntime(logger.NewLogger(&logger.Config{Kind: "zerolog", Console: false}), 0)
}

func e(n int64, dec int) *big.Int {
	return new(big.Int).Mul(big.NewInt(n), new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(dec)), nil))
}

func hexAmt(v *big.Int) string { return "0x" + v.Text(16) }

func toU256(v *big.Int) types.Uint256 {
	var u types.Uint256
	u.SetBytes(v.Bytes())
	return u
}

func vAddr(a ethCommon.Address) types.Address { return types.BytesToAddress(a.Bytes()) }

type harness struct {
	t     *testing.T
	rt    *wasm.WasmtimeRuntime
	app   common.ApplicationIdType
	code  []byte
	state []byte
}

func (h *harness) deposit(sender, token ethCommon.Address, amt *big.Int) {
	h.t.Helper()
	st, _, _, _, failure := h.rt.Deposit(context.Background(), h.app, sender, token, amt, h.state, h.code)
	if failure != nil {
		h.t.Fatalf("deposit failed: %v", failure)
	}
	h.state = st
}

func (h *harness) process(sender ethCommon.Address, payload string) ([]common.PlainEvent, []common.AppEvent, []common.Withdrawal, error) {
	h.t.Helper()
	st, ev, appEv, wd, _, _, failure := h.rt.ProcessRequest(context.Background(), h.app, sender, common.Process, []byte(payload), h.state, h.code)
	if failure != nil {
		return nil, nil, nil, failure
	}
	h.state = st
	return ev, appEv, wd, nil
}

func (h *harness) mustProcess(sender ethCommon.Address, payload string) ([]common.PlainEvent, []common.AppEvent, []common.Withdrawal) {
	h.t.Helper()
	ev, appEv, wd, err := h.process(sender, payload)
	if err != nil {
		h.t.Fatalf("process %s failed: %v", payload, err)
	}
	return ev, appEv, wd
}

func (h *harness) prices(ts uint64, zenCents int64) {
	h.t.Helper()
	upd := &lending.PriceUpdate{
		Timestamp: ts,
		Tokens:    []types.Address{vAddr(usdc), vAddr(zen)},
		Prices:    []types.Uint256{toU256(e(1, 18)), toU256(new(big.Int).Div(e(zenCents, 18), big.NewInt(100)))},
	}
	st, _, appEv, _, _, _, failure := h.rt.ProcessRequest(context.Background(), h.app, ethCommon.Address{}, common.TrustProcess, lending.EncodePriceUpdate(upd), h.state, h.code)
	if failure != nil {
		h.t.Fatalf("trusted price update failed: %v", failure)
	}
	if len(appEv) != 0 {
		h.t.Fatalf("TRUSTPROCESS must not emit app events (trigger loop rule)")
	}
	h.state = st
}

func (h *harness) ledger() *lending.State {
	h.t.Helper()
	var s lending.State
	if err := json.Unmarshal(h.state, &s); err != nil {
		h.t.Fatal(err)
	}
	return &s
}

func deployMarket(t *testing.T) *harness {
	t.Helper()
	code := buildWasm(t)
	rt := newRuntime()
	t.Cleanup(func() { _ = rt.Close() })
	cfg := map[string]any{
		"debt": map[string]any{"address": strings.ToLower(usdc.Hex()), "decimals": 6},
		"collaterals": []map[string]any{{
			"address": strings.ToLower(zen.Hex()), "decimals": 18,
			"ltvBps": 7500, "liqThresholdBps": 8000, "liqBonusBps": 500,
		}},
		"borrowAprBps": 800, "closeFactorBps": 5000,
	}
	params, _ := json.Marshal(cfg)
	app := common.NewApplicationId(1)
	state, fuel, err := rt.Deploy(context.Background(), app, params, code)
	if err != nil {
		t.Fatalf("deploy failed: %v", err)
	}
	if fuel.Cmp(big.NewInt(lending.FuelDeploy)) != 0 {
		t.Fatalf("unexpected deploy fuel %v", fuel)
	}
	return &harness{t: t, rt: rt, app: app, code: code, state: state}
}

func TestWasmDeployRejectsInvalidConfig(t *testing.T) {
	code := buildWasm(t)
	rt := newRuntime()
	defer rt.Close()
	if _, _, err := rt.Deploy(context.Background(), common.NewApplicationId(9), []byte(`{"debt":{}}`), code); err == nil {
		t.Fatal("invalid market config must be rejected at deploy")
	}
}

func TestWasmEndToEndBlindLiquidation(t *testing.T) {
	h := deployMarket(t)
	h.prices(1_000, 1000) // ZEN = $10.00

	h.deposit(lender, usdc, e(100_000, 6))
	h.mustProcess(lender, `{"type":"supply","amount":"`+hexAmt(e(100_000, 6))+`"}`)

	h.deposit(alice, zen, e(1_000, 18))
	h.mustProcess(alice, `{"type":"add_collateral","token":"`+strings.ToLower(zen.Hex())+`","amount":"`+hexAmt(e(1_000, 18))+`"}`)

	// Borrow beyond LTV fails and the error does not leak amounts.
	_, _, _, err := h.process(alice, `{"type":"borrow","amount":"`+hexAmt(e(7_501, 6))+`"}`)
	if err == nil || strings.Contains(err.Error(), "7501") || strings.Contains(err.Error(), strings.TrimPrefix(hexAmt(e(7_501, 6)), "0x")) {
		t.Fatalf("expected a non-leaking borrow-capacity error, got %v", err)
	}
	h.mustProcess(alice, `{"type":"borrow","amount":"`+hexAmt(e(7_000, 6))+`"}`)

	// Regression of the legacy saturating HF bug at realistic size: HF = 8000/7000 = 1.142857...
	s := h.ledger()
	hf, err := s.HealthFactor(s.Accounts[vAddr(alice).Hex()])
	if err != nil || hf.Cmp(lending.Wad) <= 0 {
		t.Fatalf("healthy position reported HF=%v err=%v", hf.String(), err)
	}

	// Poke publishes the price request + aggregate solvency data.
	_, appEv, _ := h.mustProcess(sink, `{"type":"poke"}`)
	if len(appEv) != 2 {
		t.Fatalf("poke must emit 2 app events, got %d", len(appEv))
	}

	// ZEN drops to $8 → HF < 1. The liquidator repays without naming the borrower.
	h.prices(2_000, 800)
	h.deposit(liqr, usdc, e(10_000, 6))
	ev, appEv, wd := h.mustProcess(liqr, `{"type":"liquidate","token":"`+strings.ToLower(zen.Hex())+`","maxRepay":"`+hexAmt(e(10_000, 6))+`"}`)
	if len(appEv) != 0 || len(wd) != 0 {
		t.Fatalf("liquidation must not publish app events or withdrawals")
	}
	if len(ev) != 2 || ev[0].UserID != liqr || ev[1].UserID != alice {
		t.Fatalf("expected encrypted events for liquidator and borrower")
	}

	// The liquidator withdraws the seized ZEN; this is the only public trace.
	s = h.ledger()
	seized := s.Accounts[vAddr(liqr).Hex()].Idle[vAddr(zen).Hex()]
	if seized == nil || seized.IsZero() {
		t.Fatal("liquidator did not receive collateral")
	}
	_, _, wd = h.mustProcess(liqr, `{"type":"withdraw","token":"`+strings.ToLower(zen.Hex())+`","amount":"`+seized.ToHex()+`","to":"`+strings.ToLower(sink.Hex())+`"}`)
	if len(wd) != 1 || wd[0].DestinationAddress != sink {
		t.Fatalf("unexpected withdrawal %+v", wd)
	}

	// Authority-gated compliance report (DEANONYMIZATION) lists the positions.
	_, _, _, _, report, _, failure := h.rt.ProcessRequest(context.Background(), h.app, sink, common.Deanonymize, []byte("{}"), h.state, h.code)
	if failure != nil {
		t.Fatalf("deanonymization failed: %v", failure)
	}
	if !strings.Contains(strings.ToLower(string(report)), strings.ToLower(strings.TrimPrefix(alice.Hex(), "0x"))) {
		t.Fatal("compliance report must include the borrower")
	}
}

func TestWasmRejectsStalePriceUpdate(t *testing.T) {
	h := deployMarket(t)
	h.prices(5_000, 1000)
	upd := &lending.PriceUpdate{Timestamp: 5_000, Tokens: []types.Address{vAddr(zen)}, Prices: []types.Uint256{toU256(e(1, 18))}}
	_, _, _, _, _, _, failure := h.rt.ProcessRequest(context.Background(), h.app, ethCommon.Address{}, common.TrustProcess, lending.EncodePriceUpdate(upd), h.state, h.code)
	if failure == nil {
		t.Fatal("replayed/stale price update must be rejected")
	}
}

// The Vela runtime calls load_module whenever it (re)loads a module into its cache, e.g.
// after an executor restart, and aborts the request if load_module reports an error.
// Simulate the restart with a fresh runtime that never saw the deploy.
func TestWasmSurvivesExecutorRestart(t *testing.T) {
	h := deployMarket(t)
	h.prices(1_000, 1000)
	h.deposit(lender, usdc, e(1_000, 6))

	restarted := newRuntime()
	defer restarted.Close()
	h.rt = restarted
	h.mustProcess(lender, `{"type":"supply","amount":"`+hexAmt(e(1_000, 6))+`"}`)
	if s := h.ledger(); s.TotalShares.IsZero() {
		t.Fatal("request after restart was not applied")
	}
}

// PureFi v5 payload for alice, signed by 0xfC888BD3… (generated with Foundry cast; see
// lending/aml_test.go). Exercises keccak + secp256k1 recovery compiled by TinyGo.
const pureFiAlice = "0x000000000000000000000000000000000000000000000000000000006553f100000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000041d57df677f7c1735cf153cce2b05249dac58defe83a644dd532ac3f06ba3c374b13415f4bdb274d3da5a204decddb0e9885b5781e5dc09a96bb357d359e853a341c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000030900000000000000000000000000000000000000000000000000000000000693ca00000000000000000000000020000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000"

func TestWasmPureFiScreening(t *testing.T) {
	code := buildWasm(t)
	rt := newRuntime()
	defer rt.Close()
	cfg := map[string]any{
		"debt": map[string]any{"address": strings.ToLower(usdc.Hex()), "decimals": 6},
		"collaterals": []map[string]any{{
			"address": strings.ToLower(zen.Hex()), "decimals": 18,
			"ltvBps": 7500, "liqThresholdBps": 8000, "liqBonusBps": 500,
		}},
		"borrowAprBps": 800, "closeFactorBps": 5000,
		"aml": map[string]any{
			"issuers": []string{"0xfc888bd3c689851e38b641ddb895415eb9f7f7d5"},
			"ruleId":  "0x693ca", "graceSeconds": 600, "validitySeconds": 2592000,
		},
	}
	params, _ := json.Marshal(cfg)
	app := common.NewApplicationId(3)
	state, _, err := rt.Deploy(context.Background(), app, params, code)
	if err != nil {
		t.Fatalf("deploy failed: %v", err)
	}
	h := &harness{t: t, rt: rt, app: app, code: code, state: state}
	h.prices(1_700_000_060, 1000)
	h.deposit(alice, zen, e(10, 18))
	addCol := `{"type":"add_collateral","token":"` + strings.ToLower(zen.Hex()) + `","amount":"` + hexAmt(e(10, 18)) + `"}`
	if _, _, _, err := h.process(alice, addCol); err == nil {
		t.Fatal("unscreened account must be blocked")
	}
	h.mustProcess(alice, `{"type":"screen","payload":"`+pureFiAlice+`"}`)
	h.mustProcess(alice, addCol)
}
