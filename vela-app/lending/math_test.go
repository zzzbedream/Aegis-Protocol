package lending

import (
	"math/big"
	"math/rand"
	"testing"

	"github.com/HorizenOfficial/vela-common-go/wasm/types"
)

func toBig(x types.Uint256) *big.Int { return new(big.Int).SetBytes(x.Bytes()) }

var max256 = new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 256), big.NewInt(1))

func randU256(r *rand.Rand) types.Uint256 {
	// Mix magnitudes so that small, medium and full-width values are all exercised.
	var x types.Uint256
	words := r.Intn(4) + 1
	for i := 0; i < words; i++ {
		x[i] = r.Uint64()
	}
	return x
}

func TestMulDivMatchesBigInt(t *testing.T) {
	r := rand.New(rand.NewSource(42))
	for i := 0; i < 20000; i++ {
		a, b, d := randU256(r), randU256(r), randU256(r)
		if d.IsZero() {
			continue
		}
		prod := new(big.Int).Mul(toBig(a), toBig(b))
		wantQ, wantR := new(big.Int).QuoRem(prod, toBig(d), new(big.Int))

		got, err := MulDiv(a, b, d)
		if wantQ.Cmp(max256) > 0 {
			if err != ErrOverflow {
				t.Fatalf("expected overflow for %v*%v/%v, got %v err=%v", toBig(a), toBig(b), toBig(d), toBig(got), err)
			}
			continue
		}
		if err != nil || toBig(got).Cmp(wantQ) != 0 {
			t.Fatalf("MulDiv(%v,%v,%v)=%v err=%v, want %v", toBig(a), toBig(b), toBig(d), toBig(got), err, wantQ)
		}

		up, err := MulDivUp(a, b, d)
		wantUp := new(big.Int).Set(wantQ)
		if wantR.Sign() != 0 {
			wantUp.Add(wantUp, big.NewInt(1))
		}
		if wantUp.Cmp(max256) > 0 {
			if err != ErrOverflow {
				t.Fatalf("expected overflow rounding up")
			}
			continue
		}
		if err != nil || toBig(up).Cmp(wantUp) != 0 {
			t.Fatalf("MulDivUp mismatch: got %v want %v", toBig(up), wantUp)
		}
	}
}

func TestMulDivEdgeCases(t *testing.T) {
	maxU := types.Uint256{^uint64(0), ^uint64(0), ^uint64(0), ^uint64(0)}
	if _, err := MulDiv(U(1), U(1), types.Uint256{}); err != ErrDivisionByZero {
		t.Fatalf("expected division by zero, got %v", err)
	}
	got, err := MulDiv(maxU, maxU, maxU)
	if err != nil || got != maxU {
		t.Fatalf("max*max/max should equal max, got %v err %v", toBig(got), err)
	}
	if _, err := MulDiv(maxU, U(2), U(1)); err != ErrOverflow {
		t.Fatalf("expected overflow, got %v", err)
	}
}

func TestPow10(t *testing.T) {
	for n := uint8(0); n <= 77; n++ {
		got, err := Pow10(n)
		want := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(n)), nil)
		if err != nil || toBig(got).Cmp(want) != 0 {
			t.Fatalf("Pow10(%d)=%v err=%v", n, toBig(got), err)
		}
	}
	if _, err := Pow10(78); err != ErrOverflow {
		t.Fatalf("Pow10(78) must overflow")
	}
}
