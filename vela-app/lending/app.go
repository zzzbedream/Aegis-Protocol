package lending

import (
	"encoding/json"
	"errors"
	"sort"

	"github.com/HorizenOfficial/vela-common-go/wasm/types"
)

// Error messages are returned to the host and end up in the signed, PUBLIC stateUpdate
// (errorMsg). They must therefore never contain addresses, balances or amounts.
var (
	errState        = errors.New("invalid application state")
	errConfig       = errors.New("invalid market configuration")
	errPayload      = errors.New("invalid request payload")
	errToken        = errors.New("token not supported")
	errAmount       = errors.New("invalid amount")
	errBalance      = errors.New("insufficient balance")
	errLiquidity    = errors.New("insufficient pool liquidity")
	errPrice        = errors.New("price unavailable")
	errUnhealthy    = errors.New("operation would exceed borrow capacity")
	errNoTarget     = errors.New("no liquidatable position")
	errStalePrice   = errors.New("price update is not newer than current prices")
	errUnknownOp    = errors.New("unsupported request type")
	errMissingField = errors.New("missing required field")
)

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

// NewState validates cfg and returns the initial state.
func NewState(appID uint64, cfg Config) (*State, error) {
	if err := validateConfig(cfg); err != nil {
		return nil, err
	}
	return &State{
		AppID:       appID,
		Config:      cfg,
		Prices:      map[string]*PricePoint{},
		BorrowIndex: Wad,
		Accounts:    map[string]*Account{},
	}, nil
}

func validateConfig(cfg Config) error {
	if cfg.Debt.Address.IsZero() || cfg.Debt.Decimals > 36 {
		return errConfig
	}
	if len(cfg.Collaterals) == 0 || cfg.CloseFactorBps == 0 || cfg.CloseFactorBps > 10_000 {
		return errConfig
	}
	if cfg.BorrowAprBps > 100_000 { // hard cap: 1000% APR
		return errConfig
	}
	seen := map[string]bool{cfg.Debt.Address.Hex(): true}
	for _, c := range cfg.Collaterals {
		h := c.Address.Hex()
		if c.Address.IsZero() || seen[h] || c.Decimals > 36 {
			return errConfig
		}
		seen[h] = true
		// LTV < LT, and liquidating at the threshold (collateral * LT == debt) must leave
		// enough collateral to pay the bonus: LT * (1 + bonus) < 1.
		if c.LtvBps == 0 || c.LtvBps >= c.LiqThresholdBps || c.LiqThresholdBps >= 10_000 {
			return errConfig
		}
		if c.LiqThresholdBps*(10_000+c.LiqBonusBps) >= 10_000*10_000 {
			return errConfig
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func (s *State) collateralConfig(token types.Address) (*CollateralConfig, bool) {
	for i := range s.Config.Collaterals {
		if s.Config.Collaterals[i].Address == token {
			return &s.Config.Collaterals[i], true
		}
	}
	return nil, false
}

func (s *State) isDebtToken(token types.Address) bool { return token == s.Config.Debt.Address }

func (s *State) supported(token types.Address) bool {
	if s.isDebtToken(token) {
		return true
	}
	_, ok := s.collateralConfig(token)
	return ok
}

func (s *State) account(addr types.Address) *Account {
	h := addr.Hex()
	acc, ok := s.Accounts[h]
	if !ok {
		acc = &Account{Idle: map[string]*types.Uint256{}, Collateral: map[string]*types.Uint256{}}
		s.Accounts[h] = acc
	}
	if acc.Idle == nil {
		acc.Idle = map[string]*types.Uint256{}
	}
	if acc.Collateral == nil {
		acc.Collateral = map[string]*types.Uint256{}
	}
	return acc
}

func bal(m map[string]*types.Uint256, token types.Address) types.Uint256 {
	if v, ok := m[token.Hex()]; ok && v != nil {
		return *v
	}
	return types.Uint256{}
}

func setBal(m map[string]*types.Uint256, token types.Address, v types.Uint256) {
	if v.IsZero() {
		delete(m, token.Hex())
		return
	}
	vv := v
	m[token.Hex()] = &vv
}

func credit(m map[string]*types.Uint256, token types.Address, amt types.Uint256) error {
	n, err := Add(bal(m, token), amt)
	if err != nil {
		return err
	}
	setBal(m, token, n)
	return nil
}

func debit(m map[string]*types.Uint256, token types.Address, amt types.Uint256) error {
	n, err := Sub(bal(m, token), amt)
	if err != nil {
		return errBalance
	}
	setBal(m, token, n)
	return nil
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// value returns the USD value (18 decimals) of amount units of token.
func (s *State) value(token types.Address, decimals uint8, amount types.Uint256) (types.Uint256, error) {
	if amount.IsZero() {
		return types.Uint256{}, nil
	}
	p, ok := s.Prices[token.Hex()]
	if !ok || p == nil || p.Price.IsZero() {
		return types.Uint256{}, errPrice
	}
	scale, err := Pow10(decimals)
	if err != nil {
		return types.Uint256{}, err
	}
	return MulDiv(amount, p.Price, scale)
}

// fromValue converts a USD value (18 decimals) into token units, rounding down.
func (s *State) fromValue(token types.Address, decimals uint8, usd types.Uint256) (types.Uint256, error) {
	p, ok := s.Prices[token.Hex()]
	if !ok || p == nil || p.Price.IsZero() {
		return types.Uint256{}, errPrice
	}
	scale, err := Pow10(decimals)
	if err != nil {
		return types.Uint256{}, err
	}
	return MulDiv(usd, scale, p.Price)
}

// DebtOf returns the current debt of acc, rounded up (the borrower owes the rounding).
func (s *State) DebtOf(acc *Account) (types.Uint256, error) {
	if acc.ScaledDebt.IsZero() {
		return types.Uint256{}, nil
	}
	return MulDivUp(acc.ScaledDebt, s.BorrowIndex, Wad)
}

// TotalDebt returns the aggregate debt rounded down (conservative for lenders' assets).
func (s *State) TotalDebt() (types.Uint256, error) {
	return MulDiv(s.TotalScaledDebt, s.BorrowIndex, Wad)
}

// TotalAssets is cash plus outstanding debt.
func (s *State) TotalAssets() (types.Uint256, error) {
	d, err := s.TotalDebt()
	if err != nil {
		return types.Uint256{}, err
	}
	return Add(s.Cash, d)
}

// weightedCollateral returns Σ value(collateral_i) * weightBps_i / 10_000, where the
// weight is the LTV (borrow capacity) or the liquidation threshold (health factor).
func (s *State) weightedCollateral(acc *Account, useLtv bool) (types.Uint256, error) {
	var total types.Uint256
	for _, c := range s.Config.Collaterals {
		amt := bal(acc.Collateral, c.Address)
		if amt.IsZero() {
			continue
		}
		v, err := s.value(c.Address, c.Decimals, amt)
		if err != nil {
			return types.Uint256{}, err
		}
		w := c.LiqThresholdBps
		if useLtv {
			w = c.LtvBps
		}
		wv, err := MulDiv(v, U(w), BpsDenominator)
		if err != nil {
			return types.Uint256{}, err
		}
		if total, err = Add(total, wv); err != nil {
			return types.Uint256{}, err
		}
	}
	return total, nil
}

// MaxHealthFactor is returned for accounts without debt.
var MaxHealthFactor = types.Uint256{^uint64(0), ^uint64(0), ^uint64(0), ^uint64(0)}

// HealthFactor = Σ collateral_i * LT_i / debt, scaled by 1e18. < 1e18 means liquidatable.
func (s *State) HealthFactor(acc *Account) (types.Uint256, error) {
	debt, err := s.DebtOf(acc)
	if err != nil {
		return types.Uint256{}, err
	}
	if debt.IsZero() {
		return MaxHealthFactor, nil
	}
	debtUsd, err := s.value(s.Config.Debt.Address, s.Config.Debt.Decimals, debt)
	if err != nil {
		return types.Uint256{}, err
	}
	if debtUsd.IsZero() {
		// Debt so small that it is worth less than 1e-18 USD: treat as healthy.
		return MaxHealthFactor, nil
	}
	adj, err := s.weightedCollateral(acc, false)
	if err != nil {
		return types.Uint256{}, err
	}
	return MulDiv(adj, Wad, debtUsd)
}

// checkBorrowCapacity enforces debt <= Σ collateral_i * LTV_i.
func (s *State) checkBorrowCapacity(acc *Account) error {
	debt, err := s.DebtOf(acc)
	if err != nil {
		return err
	}
	if debt.IsZero() {
		return nil
	}
	debtUsd, err := s.value(s.Config.Debt.Address, s.Config.Debt.Decimals, debt)
	if err != nil {
		return err
	}
	capacity, err := s.weightedCollateral(acc, true)
	if err != nil {
		return err
	}
	if debtUsd.Cmp(capacity) > 0 {
		return errUnhealthy
	}
	return nil
}

func (s *State) userEvent(to types.Address, ev UserEvent) (types.PlainEvent, error) {
	s.Nonce++
	ev.Nonce = s.Nonce
	data, err := json.Marshal(ev)
	if err != nil {
		return types.PlainEvent{}, err
	}
	// EventSubType is left unset: when the user registered a subtype seed at ASSOCIATEKEY
	// time the executor overrides it with an HMAC-derived opaque value.
	return types.PlainEvent{UserID: to, Data: data}, nil
}

// ---------------------------------------------------------------------------
// Deposit (called by the executor when a request carries assets)
// ---------------------------------------------------------------------------

// Deposit credits the sender's idle balance. Posting collateral, supplying or repaying
// is a separate, encrypted instruction so the public deposit reveals only "X sent Y".
func (s *State) Deposit(sender, token types.Address, amount types.Uint256) ([]types.PlainEvent, error) {
	if !s.supported(token) {
		return nil, errToken
	}
	if amount.IsZero() {
		return nil, nil
	}
	acc := s.account(sender)
	prev := bal(acc.Idle, token)
	if err := credit(acc.Idle, token, amount); err != nil {
		setBal(acc.Idle, token, prev)
		return nil, err
	}
	a := amount
	ev, err := s.userEvent(sender, UserEvent{Type: "deposit", Token: token, Amount: &a})
	if err != nil {
		return nil, err
	}
	return []types.PlainEvent{ev}, nil
}

// ---------------------------------------------------------------------------
// Process (PROCESS request, payload decrypted by the executor)
// ---------------------------------------------------------------------------

// Output collects everything a request produces besides the new state.
type Output struct {
	Events      []types.PlainEvent
	AppEvents   []types.AppEvent
	Withdrawals []types.Withdrawal
}

func requireAmount(a *types.Uint256) (types.Uint256, error) {
	if a == nil {
		return types.Uint256{}, errMissingField
	}
	if a.IsZero() {
		return types.Uint256{}, errAmount
	}
	return *a, nil
}

// Process executes one decrypted instruction on behalf of sender. It is atomic: on error
// the state is restored, so a failed request never leaves a partially applied mutation.
func (s *State) Process(sender types.Address, req Request) (*Output, error) {
	snapshot, err := json.Marshal(s)
	if err != nil {
		return nil, errState
	}
	out, err := s.process(sender, req)
	if err != nil {
		var restored State
		if uerr := json.Unmarshal(snapshot, &restored); uerr != nil {
			return nil, errState
		}
		*s = restored
		return nil, err
	}
	return out, nil
}

func (s *State) process(sender types.Address, req Request) (*Output, error) {
	switch req.Type {
	case "supply":
		return s.supply(sender, req)
	case "redeem":
		return s.redeem(sender, req)
	case "add_collateral":
		return s.addCollateral(sender, req)
	case "remove_collateral":
		return s.removeCollateral(sender, req)
	case "borrow":
		return s.borrow(sender, req)
	case "repay":
		return s.repay(sender, req)
	case "withdraw":
		return s.withdraw(sender, req)
	case "liquidate":
		return s.liquidate(sender, req)
	case "poke":
		return s.poke()
	default:
		return nil, errUnknownOp
	}
}

func (s *State) single(sender types.Address, ev UserEvent) (*Output, error) {
	e, err := s.userEvent(sender, ev)
	if err != nil {
		return nil, err
	}
	return &Output{Events: []types.PlainEvent{e}}, nil
}

func (s *State) supply(sender types.Address, req Request) (*Output, error) {
	amt, err := requireAmount(req.Amount)
	if err != nil {
		return nil, err
	}
	debtTok := s.Config.Debt.Address
	acc := s.account(sender)
	if err := debit(acc.Idle, debtTok, amt); err != nil {
		return nil, err
	}
	var shares types.Uint256
	if s.TotalShares.IsZero() {
		shares = amt
	} else {
		// Round total debt UP here so the depositor gets fewer (never more) shares.
		debtUp, err := MulDivUp(s.TotalScaledDebt, s.BorrowIndex, Wad)
		if err != nil {
			return nil, err
		}
		assets, err := Add(s.Cash, debtUp)
		if err != nil {
			return nil, err
		}
		if shares, err = MulDiv(amt, s.TotalShares, assets); err != nil {
			return nil, err
		}
	}
	if shares.IsZero() {
		return nil, errAmount
	}
	if s.Cash, err = Add(s.Cash, amt); err != nil {
		return nil, err
	}
	if s.TotalShares, err = Add(s.TotalShares, shares); err != nil {
		return nil, err
	}
	if acc.Shares, err = Add(acc.Shares, shares); err != nil {
		return nil, err
	}
	return s.single(sender, UserEvent{Type: "supplied", Token: debtTok, Amount: &amt})
}

func (s *State) redeem(sender types.Address, req Request) (*Output, error) {
	shares, err := requireAmount(req.Shares)
	if err != nil {
		return nil, err
	}
	acc := s.account(sender)
	if acc.Shares.Cmp(shares) < 0 {
		return nil, errBalance
	}
	assets, err := s.TotalAssets()
	if err != nil {
		return nil, err
	}
	out, err := MulDiv(shares, assets, s.TotalShares)
	if err != nil {
		return nil, err
	}
	if out.IsZero() {
		return nil, errAmount
	}
	if s.Cash.Cmp(out) < 0 {
		return nil, errLiquidity
	}
	s.Cash, _ = Sub(s.Cash, out)
	s.TotalShares, _ = Sub(s.TotalShares, shares)
	acc.Shares, _ = Sub(acc.Shares, shares)
	if err := credit(acc.Idle, s.Config.Debt.Address, out); err != nil {
		return nil, err
	}
	return s.single(sender, UserEvent{Type: "redeemed", Token: s.Config.Debt.Address, Amount: &out})
}

func (s *State) addCollateral(sender types.Address, req Request) (*Output, error) {
	amt, err := requireAmount(req.Amount)
	if err != nil {
		return nil, err
	}
	if _, ok := s.collateralConfig(req.Token); !ok {
		return nil, errToken
	}
	acc := s.account(sender)
	if err := debit(acc.Idle, req.Token, amt); err != nil {
		return nil, err
	}
	if err := credit(acc.Collateral, req.Token, amt); err != nil {
		return nil, err
	}
	return s.single(sender, UserEvent{Type: "collateral_added", Token: req.Token, Amount: &amt})
}

func (s *State) removeCollateral(sender types.Address, req Request) (*Output, error) {
	amt, err := requireAmount(req.Amount)
	if err != nil {
		return nil, err
	}
	if _, ok := s.collateralConfig(req.Token); !ok {
		return nil, errToken
	}
	acc := s.account(sender)
	if err := debit(acc.Collateral, req.Token, amt); err != nil {
		return nil, err
	}
	if err := s.checkBorrowCapacity(acc); err != nil {
		return nil, err
	}
	if err := credit(acc.Idle, req.Token, amt); err != nil {
		return nil, err
	}
	return s.single(sender, UserEvent{Type: "collateral_removed", Token: req.Token, Amount: &amt})
}

func (s *State) borrow(sender types.Address, req Request) (*Output, error) {
	amt, err := requireAmount(req.Amount)
	if err != nil {
		return nil, err
	}
	if s.Cash.Cmp(amt) < 0 {
		return nil, errLiquidity
	}
	acc := s.account(sender)
	// Round scaled debt UP: the borrower never owes less than borrowed.
	scaled, err := MulDivUp(amt, Wad, s.BorrowIndex)
	if err != nil {
		return nil, err
	}
	if acc.ScaledDebt, err = Add(acc.ScaledDebt, scaled); err != nil {
		return nil, err
	}
	if err := s.checkBorrowCapacity(acc); err != nil {
		return nil, err
	}
	if s.TotalScaledDebt, err = Add(s.TotalScaledDebt, scaled); err != nil {
		return nil, err
	}
	s.Cash, _ = Sub(s.Cash, amt)
	if err := credit(acc.Idle, s.Config.Debt.Address, amt); err != nil {
		return nil, err
	}
	return s.single(sender, UserEvent{Type: "borrowed", Token: s.Config.Debt.Address, Amount: &amt})
}

// reduceDebt removes up to amount of acc's debt and returns the amount actually repaid.
func (s *State) reduceDebt(acc *Account, amount types.Uint256) (types.Uint256, error) {
	debt, err := s.DebtOf(acc)
	if err != nil {
		return types.Uint256{}, err
	}
	if debt.IsZero() {
		return types.Uint256{}, errAmount
	}
	var scaled types.Uint256
	if amount.Cmp(debt) >= 0 {
		amount = debt
		scaled = acc.ScaledDebt
	} else {
		// Round the scaled reduction DOWN so rounding never favours the borrower.
		if scaled, err = MulDiv(amount, Wad, s.BorrowIndex); err != nil {
			return types.Uint256{}, err
		}
	}
	acc.ScaledDebt, _ = Sub(acc.ScaledDebt, scaled)
	// TotalScaledDebt == Σ ScaledDebt (tested invariant), so this cannot underflow.
	if s.TotalScaledDebt, err = Sub(s.TotalScaledDebt, scaled); err != nil {
		return types.Uint256{}, errState
	}
	if s.Cash, err = Add(s.Cash, amount); err != nil {
		return types.Uint256{}, err
	}
	return amount, nil
}

func (s *State) repay(sender types.Address, req Request) (*Output, error) {
	amt, err := requireAmount(req.Amount)
	if err != nil {
		return nil, err
	}
	acc := s.account(sender)
	debt, err := s.DebtOf(acc)
	if err != nil {
		return nil, err
	}
	// Repaying more than owed only settles the debt; the caller needs idle funds for
	// the amount actually repaid, not for the requested ceiling.
	amt = Min(amt, debt)
	if bal(acc.Idle, s.Config.Debt.Address).Cmp(amt) < 0 {
		return nil, errBalance
	}
	repaid, err := s.reduceDebt(acc, amt)
	if err != nil {
		return nil, err
	}
	if err := debit(acc.Idle, s.Config.Debt.Address, repaid); err != nil {
		return nil, err
	}
	return s.single(sender, UserEvent{Type: "repaid", Token: s.Config.Debt.Address, Amount: &repaid})
}

func (s *State) withdraw(sender types.Address, req Request) (*Output, error) {
	amt, err := requireAmount(req.Amount)
	if err != nil {
		return nil, err
	}
	if req.To.IsZero() {
		return nil, errMissingField
	}
	if !s.supported(req.Token) {
		return nil, errToken
	}
	if err := debit(s.account(sender).Idle, req.Token, amt); err != nil {
		return nil, err
	}
	out, err := s.single(sender, UserEvent{Type: "withdrawal", Token: req.Token, Amount: &amt, To: req.To})
	if err != nil {
		return nil, err
	}
	a := amt
	out.Withdrawals = []types.Withdrawal{{TokenAddress: req.Token, DestinationAddress: req.To, Amount: &a}}
	return out, nil
}

// ---------------------------------------------------------------------------
// Blind liquidation
// ---------------------------------------------------------------------------

// liquidationTarget deterministically picks the account with the lowest health factor
// below 1.0 that holds the requested collateral. The liquidator never names the borrower.
func (s *State) liquidationTarget(collateral types.Address, exclude string) (string, error) {
	best := ""
	var bestHF types.Uint256
	for _, k := range sortedKeys(s.Accounts) { // sorted: map iteration order is not deterministic
		if k == exclude {
			continue
		}
		acc := s.Accounts[k]
		if acc.ScaledDebt.IsZero() || bal(acc.Collateral, collateral).IsZero() {
			continue
		}
		hf, err := s.HealthFactor(acc)
		if err != nil {
			return "", err
		}
		if hf.Cmp(Wad) >= 0 {
			continue
		}
		if best == "" || hf.Cmp(bestHF) < 0 {
			best, bestHF = k, hf
		}
	}
	if best == "" {
		return "", errNoTarget
	}
	return best, nil
}

func (s *State) liquidate(sender types.Address, req Request) (*Output, error) {
	maxRepay, err := requireAmount(req.MaxRepay)
	if err != nil {
		return nil, err
	}
	cc, ok := s.collateralConfig(req.Token)
	if !ok {
		return nil, errToken
	}
	debtTok := s.Config.Debt.Address
	liq := s.account(sender)
	targetKey, err := s.liquidationTarget(req.Token, sender.Hex())
	if err != nil {
		return nil, err
	}
	borrower := s.Accounts[targetKey]

	debt, err := s.DebtOf(borrower)
	if err != nil {
		return nil, err
	}
	closeAmt, err := MulDiv(debt, U(s.Config.CloseFactorBps), BpsDenominator)
	if err != nil {
		return nil, err
	}
	if closeAmt.IsZero() {
		closeAmt = debt // dust positions can be closed entirely
	}
	repay := Min(Min(maxRepay, closeAmt), bal(liq.Idle, debtTok))
	if repay.IsZero() {
		return nil, errBalance
	}

	// seize = value(repay) * (1 + bonus) / price(collateral), capped at the position's collateral.
	repayUsd, err := s.value(debtTok, s.Config.Debt.Decimals, repay)
	if err != nil {
		return nil, err
	}
	seizeUsd, err := MulDiv(repayUsd, U(10_000+cc.LiqBonusBps), BpsDenominator)
	if err != nil {
		return nil, err
	}
	seize, err := s.fromValue(req.Token, cc.Decimals, seizeUsd)
	if err != nil {
		return nil, err
	}
	available := bal(borrower.Collateral, req.Token)
	if seize.Cmp(available) > 0 {
		// Not enough of this collateral: seize all of it and shrink the repayment accordingly.
		seize = available
		availUsd, err := s.value(req.Token, cc.Decimals, available)
		if err != nil {
			return nil, err
		}
		repayUsdCapped, err := MulDiv(availUsd, BpsDenominator, U(10_000+cc.LiqBonusBps))
		if err != nil {
			return nil, err
		}
		if repay, err = s.fromValue(debtTok, s.Config.Debt.Decimals, repayUsdCapped); err != nil {
			return nil, err
		}
		if repay.IsZero() {
			return nil, errAmount
		}
	}
	if seize.IsZero() {
		return nil, errAmount
	}

	repaid, err := s.reduceDebt(borrower, repay)
	if err != nil {
		return nil, err
	}
	if err := debit(liq.Idle, debtTok, repaid); err != nil {
		return nil, err
	}
	if err := debit(borrower.Collateral, req.Token, seize); err != nil {
		return nil, err
	}
	if err := credit(liq.Idle, req.Token, seize); err != nil {
		return nil, err
	}

	// If the borrower has no collateral left but still owes, write the remainder off as
	// bad debt: it stops accruing and is absorbed by lenders via TotalAssets.
	if len(borrower.Collateral) == 0 && !borrower.ScaledDebt.IsZero() {
		remaining, err := s.DebtOf(borrower)
		if err != nil {
			return nil, err
		}
		if s.TotalScaledDebt, err = Sub(s.TotalScaledDebt, borrower.ScaledDebt); err != nil {
			return nil, errState
		}
		borrower.ScaledDebt = types.Uint256{}
		if s.BadDebt, err = Add(s.BadDebt, remaining); err != nil {
			return nil, err
		}
	}

	var borrowerAddr types.Address
	if err := borrowerAddr.UnmarshalJSON([]byte(`"` + targetKey + `"`)); err != nil {
		return nil, errState
	}
	sz, rp := seize, repaid
	liqEv, err := s.userEvent(sender, UserEvent{Type: "liquidation_executed", Token: req.Token, Seized: &sz, Repaid: &rp})
	if err != nil {
		return nil, err
	}
	sz2, rp2 := seize, repaid
	borEv, err := s.userEvent(borrowerAddr, UserEvent{Type: "position_liquidated", Token: req.Token, Seized: &sz2, Repaid: &rp2})
	if err != nil {
		return nil, err
	}
	// No AppEvent is emitted: nothing public links the liquidation to the borrower.
	return &Output{Events: []types.PlainEvent{liqEv, borEv}}, nil
}

// ---------------------------------------------------------------------------
// Poke: ask the trigger for fresh prices and publish aggregate solvency data
// ---------------------------------------------------------------------------

// Report computes the public solvency aggregates.
func (s *State) Report() (*SolvencyReport, error) {
	totalDebt, err := s.TotalDebt()
	if err != nil {
		return nil, err
	}
	totalAssets, err := Add(s.Cash, totalDebt)
	if err != nil {
		return nil, err
	}
	r := &SolvencyReport{
		TotalAssets:        totalAssets,
		Cash:               s.Cash,
		TotalDebt:          totalDebt,
		TotalShares:        s.TotalShares,
		BadDebt:            s.BadDebt,
		CollateralTotals:   map[string]types.Uint256{},
		BorrowIndex:        s.BorrowIndex,
		LastPriceTimestamp: s.LastPriceTimestamp,
	}
	for _, c := range s.Config.Collaterals {
		r.CollateralTotals[c.Address.Hex()] = types.Uint256{}
	}
	for _, k := range sortedKeys(s.Accounts) {
		acc := s.Accounts[k]
		for _, c := range s.Config.Collaterals {
			if t, err := Add(r.CollateralTotals[c.Address.Hex()], bal(acc.Collateral, c.Address)); err == nil {
				r.CollateralTotals[c.Address.Hex()] = t
			} else {
				return nil, err
			}
		}
		if acc.ScaledDebt.IsZero() {
			continue
		}
		hf, err := s.HealthFactor(acc)
		if err == errPrice {
			continue // cannot be assessed before the first price update
		} else if err != nil {
			return nil, err
		}
		if hf.Cmp(Wad) < 0 {
			r.LiquidatableCount++
			d, err := s.DebtOf(acc)
			if err != nil {
				return nil, err
			}
			if r.LiquidatableDebt, err = Add(r.LiquidatableDebt, d); err != nil {
				return nil, err
			}
		}
	}
	return r, nil
}

func (s *State) poke() (*Output, error) {
	r, err := s.Report()
	if err != nil {
		return nil, err
	}
	data, err := json.Marshal(r)
	if err != nil {
		return nil, err
	}
	return &Output{AppEvents: []types.AppEvent{
		{EventSubType: SubtypePriceRequest},
		{EventSubType: SubtypeSolvency, Data: data},
	}}, nil
}

// ---------------------------------------------------------------------------
// Trusted price update (TRUSTPROCESS from the price trigger contract)
// ---------------------------------------------------------------------------

// ApplyPriceUpdate accrues interest up to upd.Timestamp and stores the new prices.
// It MUST NOT emit AppEvents: a TRUSTPROCESS that emits AppEvents would make the
// trigger enqueue another TRUSTPROCESS (see vela-starterkit docs/4_trigger-contract-app.md).
func (s *State) ApplyPriceUpdate(upd *PriceUpdate) error {
	if upd.Timestamp <= s.LastPriceTimestamp {
		return errStalePrice
	}
	for i, tok := range upd.Tokens {
		if !s.supported(tok) {
			return errToken
		}
		// Reject duplicated tokens within one update.
		for j := 0; j < i; j++ {
			if upd.Tokens[j] == tok {
				return ErrBadPricePayload
			}
		}
	}
	if s.LastPriceTimestamp != 0 && !s.TotalScaledDebt.IsZero() && s.Config.BorrowAprBps != 0 {
		dt := upd.Timestamp - s.LastPriceTimestamp
		// index += index * apr * dt / (10_000 * secondsPerYear)   (simple interest per interval)
		num, err := MulDiv(U(s.Config.BorrowAprBps), U(dt), U(1))
		if err != nil {
			return err
		}
		growth, err := MulDiv(s.BorrowIndex, num, U(10_000*SecondsPerYear))
		if err != nil {
			return err
		}
		if s.BorrowIndex, err = Add(s.BorrowIndex, growth); err != nil {
			return err
		}
	}
	for i, tok := range upd.Tokens {
		s.Prices[tok.Hex()] = &PricePoint{Price: upd.Prices[i], Timestamp: upd.Timestamp}
	}
	s.LastPriceTimestamp = upd.Timestamp
	return nil
}

// ---------------------------------------------------------------------------
// Compliance report (DEANONYMIZATION, authority-gated)
// ---------------------------------------------------------------------------

// PositionReport is one account in the compliance report.
type PositionReport struct {
	Address      string                    `json:"address"`
	Idle         map[string]*types.Uint256 `json:"idle"`
	Collateral   map[string]*types.Uint256 `json:"collateral"`
	Debt         types.Uint256             `json:"debt"`
	Shares       types.Uint256             `json:"shares"`
	HealthFactor *types.Uint256            `json:"healthFactor,omitempty"`
}

// ComplianceReport lists every position. It is only produced for DEANONYMIZATION requests,
// which the ProcessorEndpoint restricts to addresses allowed by the AuthorityRegistry, and
// the executor encrypts it to the requesting authority's P-521 key.
func (s *State) ComplianceReport() ([]byte, error) {
	out := struct {
		Solvency  *SolvencyReport  `json:"solvency"`
		Positions []PositionReport `json:"positions"`
	}{}
	r, err := s.Report()
	if err != nil {
		return nil, err
	}
	out.Solvency = r
	for _, k := range sortedKeys(s.Accounts) {
		acc := s.Accounts[k]
		d, err := s.DebtOf(acc)
		if err != nil {
			return nil, err
		}
		p := PositionReport{Address: k, Idle: acc.Idle, Collateral: acc.Collateral, Debt: d, Shares: acc.Shares}
		if hf, err := s.HealthFactor(acc); err == nil {
			p.HealthFactor = &hf
		}
		out.Positions = append(out.Positions, p)
	}
	return json.Marshal(out)
}
