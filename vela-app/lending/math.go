package lending

import (
	"errors"
	"math/bits"

	"github.com/HorizenOfficial/vela-common-go/wasm/types"
)

// types.Uint256 (vela-common-go v0.2.0) only offers Add/Sub/Mul64. The credit engine
// needs exact a*b/d with a 512-bit intermediate so that values never saturate (the
// legacy Rust engine used saturating u128 math and mis-flagged healthy positions as
// liquidatable). math/big is not relied upon because TinyGo support for it is not
// guaranteed by the Vela docs.

var (
	ErrOverflow       = errors.New("arithmetic overflow")
	ErrDivisionByZero = errors.New("division by zero")
	ErrUnderflow      = errors.New("arithmetic underflow")
)

// Wad is 1e18, the fixed-point unit for prices, indexes and health factors.
var Wad = u(1_000_000_000_000_000_000)

// BpsDenominator is 10_000 (100.00%).
var BpsDenominator = u(10_000)

func u(v uint64) types.Uint256 { return types.Uint256{v, 0, 0, 0} }

// U returns a Uint256 holding v.
func U(v uint64) types.Uint256 { return u(v) }

// Pow10 returns 10^n for n <= 77.
func Pow10(n uint8) (types.Uint256, error) {
	if n > 77 {
		return types.Uint256{}, ErrOverflow
	}
	r := u(1)
	for i := uint8(0); i < n; i++ {
		if r.Mul64Overflow(10) {
			return types.Uint256{}, ErrOverflow
		}
	}
	return r, nil
}

// Add returns a+b or ErrOverflow.
func Add(a, b types.Uint256) (types.Uint256, error) {
	var z types.Uint256
	if z.AddOverflow(a, b) {
		return types.Uint256{}, ErrOverflow
	}
	return z, nil
}

// Sub returns a-b or ErrUnderflow.
func Sub(a, b types.Uint256) (types.Uint256, error) {
	var z types.Uint256
	if z.SubOverflow(a, b) {
		return types.Uint256{}, ErrUnderflow
	}
	return z, nil
}

// Min returns the smaller of a and b.
func Min(a, b types.Uint256) types.Uint256 {
	if a.Cmp(b) <= 0 {
		return a
	}
	return b
}

// mul512 returns the full 512-bit product of a and b as 8 little-endian words.
func mul512(a, b types.Uint256) [8]uint64 {
	var p [8]uint64
	for i := 0; i < 4; i++ {
		var carry uint64
		for j := 0; j < 4; j++ {
			hi, lo := bits.Mul64(a[i], b[j])
			var c uint64
			lo, c = bits.Add64(lo, p[i+j], 0)
			hi += c
			lo, c = bits.Add64(lo, carry, 0)
			hi += c
			p[i+j] = lo
			carry = hi
		}
		p[i+4] = carry
	}
	return p
}

// MulDiv returns floor(a*b/d) computed exactly with a 512-bit intermediate.
// It fails with ErrOverflow if the quotient does not fit in 256 bits.
func MulDiv(a, b, d types.Uint256) (types.Uint256, error) {
	q, _, err := mulDivRem(a, b, d)
	return q, err
}

// MulDivUp returns ceil(a*b/d).
func MulDivUp(a, b, d types.Uint256) (types.Uint256, error) {
	q, rem, err := mulDivRem(a, b, d)
	if err != nil {
		return types.Uint256{}, err
	}
	if !rem {
		return q, nil
	}
	return Add(q, u(1))
}

// mulDivRem performs binary long division of the 512-bit product by d.
// It reports whether the remainder is non-zero.
func mulDivRem(a, b, d types.Uint256) (types.Uint256, bool, error) {
	if d.IsZero() {
		return types.Uint256{}, false, ErrDivisionByZero
	}
	n := mul512(a, b)
	// Fast path: product fits in 256 bits and divisor fits in 64 bits is not needed;
	// the generic loop is simple and bounded (512 iterations).
	var rem [5]uint64 // 320 bits: enough to hold (rem << 1) | bit when rem < d < 2^256
	var q [8]uint64
	for i := 511; i >= 0; i-- {
		// rem = rem << 1 | bit_i(n)
		var carry uint64
		for w := 0; w < 5; w++ {
			nc := rem[w] >> 63
			rem[w] = rem[w]<<1 | carry
			carry = nc
		}
		rem[0] |= (n[i/64] >> (uint(i) % 64)) & 1
		if geq320(rem, d) {
			sub320(&rem, d)
			q[i/64] |= 1 << (uint(i) % 64)
		}
	}
	if q[4]|q[5]|q[6]|q[7] != 0 {
		return types.Uint256{}, false, ErrOverflow
	}
	nonZeroRem := rem[0]|rem[1]|rem[2]|rem[3]|rem[4] != 0
	return types.Uint256{q[0], q[1], q[2], q[3]}, nonZeroRem, nil
}

func geq320(r [5]uint64, d types.Uint256) bool {
	if r[4] != 0 {
		return true
	}
	for w := 3; w >= 0; w-- {
		if r[w] != d[w] {
			return r[w] > d[w]
		}
	}
	return true
}

func sub320(r *[5]uint64, d types.Uint256) {
	var borrow uint64
	for w := 0; w < 4; w++ {
		r[w], borrow = bits.Sub64(r[w], d[w], borrow)
	}
	r[4] -= borrow
}
