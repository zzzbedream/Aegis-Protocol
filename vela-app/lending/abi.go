package lending

import (
	"errors"

	"github.com/HorizenOfficial/vela-common-go/wasm/types"
)

// MaxPriceUpdates bounds the number of entries accepted in one trusted price update.
const MaxPriceUpdates = 32

var ErrBadPricePayload = errors.New("malformed price payload")

// PriceUpdate is the decoded TRUSTPROCESS payload produced by the price trigger contract:
//
//	abi.encode(uint256 timestamp, address[] tokens, uint256[] prices)
//
// prices are USD with 18 decimals per whole token. go-ethereum is not available under
// TinyGo, so the ABI is decoded by hand with strict bounds checks.
type PriceUpdate struct {
	Timestamp uint64
	Tokens    []types.Address
	Prices    []types.Uint256
}

func word(b []byte, off uint64) ([]byte, bool) {
	if off > uint64(len(b)) || uint64(len(b))-off < 32 {
		return nil, false
	}
	return b[off : off+32], true
}

// wordAsUint64 reads a 32-byte big-endian word that must fit in 64 bits.
func wordAsUint64(w []byte) (uint64, bool) {
	for _, c := range w[:24] {
		if c != 0 {
			return 0, false
		}
	}
	var v uint64
	for _, c := range w[24:] {
		v = v<<8 | uint64(c)
	}
	return v, true
}

func readDynArray(b []byte, headOff uint64) (length uint64, dataOff uint64, ok bool) {
	w, ok := word(b, headOff)
	if !ok {
		return 0, 0, false
	}
	off, ok := wordAsUint64(w)
	if !ok {
		return 0, 0, false
	}
	lw, ok := word(b, off)
	if !ok {
		return 0, 0, false
	}
	length, ok = wordAsUint64(lw)
	if !ok || length > MaxPriceUpdates {
		return 0, 0, false
	}
	dataOff = off + 32
	if uint64(len(b)) < dataOff || (uint64(len(b))-dataOff)/32 < length {
		return 0, 0, false
	}
	return length, dataOff, true
}

// DecodePriceUpdate decodes and validates a trusted price payload.
func DecodePriceUpdate(b []byte) (*PriceUpdate, error) {
	tsw, ok := word(b, 0)
	if !ok {
		return nil, ErrBadPricePayload
	}
	ts, ok := wordAsUint64(tsw)
	if !ok || ts == 0 {
		return nil, ErrBadPricePayload
	}
	nTok, tokOff, ok := readDynArray(b, 32)
	if !ok {
		return nil, ErrBadPricePayload
	}
	nPx, pxOff, ok := readDynArray(b, 64)
	if !ok || nPx != nTok || nTok == 0 {
		return nil, ErrBadPricePayload
	}
	upd := &PriceUpdate{Timestamp: ts}
	for i := uint64(0); i < nTok; i++ {
		w, _ := word(b, tokOff+32*i)
		for _, c := range w[:12] {
			if c != 0 {
				return nil, ErrBadPricePayload
			}
		}
		upd.Tokens = append(upd.Tokens, types.BytesToAddress(w[12:]))
		pw, _ := word(b, pxOff+32*i)
		var p types.Uint256
		p.SetBytes(pw)
		if p.IsZero() {
			return nil, ErrBadPricePayload
		}
		upd.Prices = append(upd.Prices, p)
	}
	return upd, nil
}

// EncodePriceUpdate is the inverse of DecodePriceUpdate. It is used by tests and
// documents the exact layout the trigger contract must produce.
func EncodePriceUpdate(u *PriceUpdate) []byte {
	n := uint64(len(u.Tokens))
	out := make([]byte, 0, 96+2*(32+32*n))
	out = append(out, u64Word(u.Timestamp)...)
	out = append(out, u64Word(96)...)         // offset of tokens
	out = append(out, u64Word(96+32+32*n)...) // offset of prices
	out = append(out, u64Word(n)...)
	for _, t := range u.Tokens {
		var w [32]byte
		copy(w[12:], t[:])
		out = append(out, w[:]...)
	}
	out = append(out, u64Word(n)...)
	for _, p := range u.Prices {
		out = append(out, p.Bytes()...)
	}
	return out
}

func u64Word(v uint64) []byte {
	var w [32]byte
	for i := 0; i < 8; i++ {
		w[31-i] = byte(v >> (8 * i))
	}
	return w[:]
}
