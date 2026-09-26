package lending

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/HorizenOfficial/vela-common-go/wasm/types"
)

// Contract with frontend/src/vela/instructions.js: the fixture is produced by the JS builder
// and asserted byte-for-byte by frontend/tests/unit/instructions.test.mjs. Here the guest must
// decode every entry and execute it successfully on a funded market.
func TestFrontendInstructionFixture(t *testing.T) {
	raw, err := os.ReadFile("testdata/frontend_instructions.json")
	if err != nil {
		t.Fatal(err)
	}
	var fx map[string]string
	if err := json.Unmarshal(raw, &fx); err != nil {
		t.Fatal(err)
	}
	decode := func(name string) Request {
		var r Request
		if err := json.Unmarshal([]byte(fx[name]), &r); err != nil {
			t.Fatalf("%s: guest cannot decode frontend payload: %v", name, err)
		}
		if r.Type != name {
			t.Fatalf("%s: decoded type %q", name, r.Type)
		}
		return r
	}

	s := newMarket(t)
	deposit(t, s, lender, usdc, units(100_000, 6))
	ok(t)(s.Process(lender, decode("supply")))
	deposit(t, s, alice, zen, units(1_000, 18))
	ok(t)(s.Process(alice, decode("add_collateral")))
	ok(t)(s.Process(alice, decode("borrow")))
	ok(t)(s.Process(alice, decode("repay")))
	deposit(t, s, alice, zen, units(2, 18))
	out := ok(t)(s.Process(alice, decode("withdraw")))
	if *out.Withdrawals[0].Amount != units(125, 16) || out.Withdrawals[0].DestinationAddress != sink {
		t.Fatalf("withdraw decoded wrongly: %+v", out.Withdrawals[0])
	}
	ok(t)(s.Process(bob, decode("poke")))
	setPrices(t, s, 2_000, map[types.Address]types.Uint256{zen: usd(800)})
	deposit(t, s, liqr, usdc, units(10_000, 6))
	ok(t)(s.Process(liqr, decode("liquidate")))
}
