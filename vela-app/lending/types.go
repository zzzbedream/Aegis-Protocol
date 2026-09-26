package lending

import (
	"github.com/HorizenOfficial/vela-common-go/wasm/types"
)

// SecondsPerYear is used to convert the configured APR into a per-second rate.
const SecondsPerYear = 31_536_000

// Fuel charged per entry point. Values follow the Vela reference app (vela-nova).
const (
	FuelDeploy  = 5
	FuelDeposit = 35
	FuelProcess = 50
	FuelTrusted = 20
)

// App-level (public, unencrypted) event subtypes. ASCII labels padded to bytes32 so that
// the trigger contract can compare them with bytes32("AEGIS.PRICE_REQUEST") in Solidity.
var (
	SubtypePriceRequest = asciiSubtype("AEGIS.PRICE_REQUEST")
	SubtypeSolvency     = asciiSubtype("AEGIS.SOLVENCY")
)

func asciiSubtype(s string) [32]byte {
	var b [32]byte
	copy(b[:], s)
	return b
}

// CollateralConfig describes one accepted collateral asset.
type CollateralConfig struct {
	Address types.Address `json:"address"`
	// Decimals of the ERC-20 token (price is quoted per whole token).
	Decimals uint8 `json:"decimals"`
	// LtvBps is the maximum borrow power (e.g. 7500 = 75%).
	LtvBps uint64 `json:"ltvBps"`
	// LiqThresholdBps is the health-factor weight (e.g. 8000 = 80%).
	LiqThresholdBps uint64 `json:"liqThresholdBps"`
	// LiqBonusBps is the discount granted to liquidators (e.g. 500 = 5%).
	LiqBonusBps uint64 `json:"liqBonusBps"`
}

// DebtConfig describes the single borrowable asset of the market.
type DebtConfig struct {
	Address  types.Address `json:"address"`
	Decimals uint8         `json:"decimals"`
}

// Config is the immutable market configuration set at deploy time.
type Config struct {
	Debt           DebtConfig         `json:"debt"`
	Collaterals    []CollateralConfig `json:"collaterals"`
	BorrowAprBps   uint64             `json:"borrowAprBps"`
	CloseFactorBps uint64             `json:"closeFactorBps"`
}

// PricePoint is a USD price with 18 decimals per whole token, as delivered by the trigger.
type PricePoint struct {
	Price     types.Uint256 `json:"price"`
	Timestamp uint64        `json:"timestamp"`
}

// Account is the confidential per-address ledger entry.
type Account struct {
	// Idle holds funds deposited through the ProcessorEndpoint that are not yet
	// supplied, posted as collateral or used to repay (token hex -> amount).
	Idle map[string]*types.Uint256 `json:"idle"`
	// Collateral posted (token hex -> amount).
	Collateral map[string]*types.Uint256 `json:"collateral"`
	// ScaledDebt is the debt divided by the borrow index at borrow time.
	ScaledDebt types.Uint256 `json:"scaledDebt"`
	// Shares of the lending pool held by this account.
	Shares types.Uint256 `json:"shares"`
}

// State is the full application state. It is encrypted at rest by the Vela executor.
type State struct {
	AppID  uint64 `json:"appId"`
	Config Config `json:"config"`

	Prices             map[string]*PricePoint `json:"prices"`
	LastPriceTimestamp uint64                 `json:"lastPriceTimestamp"`

	BorrowIndex     types.Uint256 `json:"borrowIndex"`
	TotalScaledDebt types.Uint256 `json:"totalScaledDebt"`
	TotalShares     types.Uint256 `json:"totalShares"`
	// Cash is the debt-token liquidity held by the pool (supplied + repaid - borrowed).
	Cash types.Uint256 `json:"cash"`
	// BadDebt accumulates debt written off after a borrower's collateral is exhausted.
	BadDebt types.Uint256 `json:"badDebt"`

	Accounts map[string]*Account `json:"accounts"`
	Nonce    uint64              `json:"nonce"`
}

// Request is the decrypted JSON payload of a PROCESS request.
type Request struct {
	Type   string         `json:"type"`
	Token  types.Address  `json:"token,omitempty"`
	Amount *types.Uint256 `json:"amount,omitempty"`
	Shares *types.Uint256 `json:"shares,omitempty"`
	To     types.Address  `json:"to,omitempty"`
	// MaxRepay bounds the debt a liquidator is willing to repay.
	MaxRepay *types.Uint256 `json:"maxRepay,omitempty"`
}

// UserEvent is the payload of an encrypted per-user event.
type UserEvent struct {
	Type   string         `json:"type"`
	Token  types.Address  `json:"token,omitempty"`
	Amount *types.Uint256 `json:"amount,omitempty"`
	// Seized/Repaid are only set on liquidation events.
	Seized *types.Uint256 `json:"seized,omitempty"`
	Repaid *types.Uint256 `json:"repaid,omitempty"`
	To     types.Address  `json:"to,omitempty"`
	Nonce  uint64         `json:"nonce"`
}

// SolvencyReport is published as a plaintext AppEvent. It contains aggregates only.
type SolvencyReport struct {
	TotalAssets        types.Uint256            `json:"totalAssets"`
	Cash               types.Uint256            `json:"cash"`
	TotalDebt          types.Uint256            `json:"totalDebt"`
	TotalShares        types.Uint256            `json:"totalShares"`
	BadDebt            types.Uint256            `json:"badDebt"`
	CollateralTotals   map[string]types.Uint256 `json:"collateralTotals"`
	LiquidatableCount  uint64                   `json:"liquidatableCount"`
	LiquidatableDebt   types.Uint256            `json:"liquidatableDebt"`
	BorrowIndex        types.Uint256            `json:"borrowIndex"`
	LastPriceTimestamp uint64                   `json:"lastPriceTimestamp"`
}
