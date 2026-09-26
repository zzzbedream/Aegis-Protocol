package lending

import (
	"encoding/json"

	"github.com/HorizenOfficial/vela-common-go/wasm/types"
	"github.com/HorizenOfficial/vela-common-go/wasm/utils"
)

// Entry points called from main.go. They translate between the JSON strings handed over
// by the Vela executor and the typed State, and never leak private data in errors.

// RequestTypeDeanonymize mirrors common.Deanonymize in the Vela host (value 2).
const RequestTypeDeanonymize = 2

func loadState(stateJSON string) (*State, error) {
	var s State
	if err := json.Unmarshal([]byte(stateJSON), &s); err != nil {
		return nil, errState
	}
	if s.Accounts == nil {
		s.Accounts = map[string]*Account{}
	}
	if s.Prices == nil {
		s.Prices = map[string]*PricePoint{}
	}
	if s.BorrowIndex.IsZero() {
		return nil, errState
	}
	return &s, nil
}

// Deploy builds the initial state from the JSON market configuration.
func Deploy(appID int64, paramsJSON string) types.DeployResult {
	var cfg Config
	if err := json.Unmarshal([]byte(paramsJSON), &cfg); err != nil {
		return types.DeployResult{Error: errConfig.Error()}
	}
	s, err := NewState(uint64(appID), cfg)
	if err != nil {
		return types.DeployResult{Error: err.Error()}
	}
	b, err := json.Marshal(s)
	if err != nil {
		return types.DeployResult{Error: errState.Error()}
	}
	return types.DeployResult{State: b, Fuel: types.NewUint256(FuelDeploy)}
}

// LoadModule is called by the Vela WasmtimeRuntime every time it (re)loads the module
// into its cache (getOrLoadModule, e.g. after an executor restart or LRU eviction) and the
// returned state is discarded. It MUST succeed: an error here would make every subsequent
// deposit/request of the app fail. Deploy-time initialisation happens in Deploy.
func LoadModule(appID int64) types.LoadModuleResult {
	return types.LoadModuleResult{State: []byte(`{"appId":` + utoa(uint64(appID)) + `}`), Fuel: types.NewUint256(FuelDeploy)}
}

func utoa(v uint64) string {
	if v == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for v > 0 {
		i--
		b[i] = byte('0' + v%10)
		v /= 10
	}
	return string(b[i:])
}

// DepositFunds handles assets attached to a request.
func DepositFunds(sender, token *types.Address, value *types.Uint256, stateJSON string) types.DepositResult {
	if sender == nil || token == nil || value == nil {
		return types.DepositResult{Error: errPayload.Error()}
	}
	s, err := loadState(stateJSON)
	if err != nil {
		return types.DepositResult{Error: err.Error()}
	}
	events, err := s.Deposit(*sender, *token, *value)
	if err != nil {
		return types.DepositResult{Error: err.Error()}
	}
	b, err := json.Marshal(s)
	if err != nil {
		return types.DepositResult{Error: errState.Error()}
	}
	return types.DepositResult{State: b, Events: events, Fuel: types.NewUint256(FuelDeposit)}
}

// ProcessRequest handles PROCESS and DEANONYMIZATION requests. DEANONYMIZATION is gated
// on-chain by the AuthorityRegistry; the executor encrypts the report to the authority.
func ProcessRequest(sender *types.Address, requestType int32, payloadJSON, stateJSON string) types.ProcessResult {
	if sender == nil {
		return types.ProcessResult{Error: errPayload.Error()}
	}
	s, err := loadState(stateJSON)
	if err != nil {
		return types.ProcessResult{Error: err.Error()}
	}
	if requestType == RequestTypeDeanonymize {
		report, err := s.ComplianceReport()
		if err != nil {
			return types.ProcessResult{Error: err.Error()}
		}
		// State is returned unchanged: a report must not mutate the ledger.
		return types.ProcessResult{State: []byte(stateJSON), Report: report, Fuel: types.NewUint256(FuelProcess)}
	}
	var req Request
	if err := json.Unmarshal([]byte(payloadJSON), &req); err != nil {
		return types.ProcessResult{Error: errPayload.Error()}
	}
	out, err := s.Process(*sender, req)
	if err != nil {
		utils.LogDebug("process_request rejected: type=%s err=%v", req.Type, err)
		return types.ProcessResult{Error: err.Error()}
	}
	b, err := json.Marshal(s)
	if err != nil {
		return types.ProcessResult{Error: errState.Error()}
	}
	return types.ProcessResult{
		State:       b,
		Events:      out.Events,
		AppEvents:   out.AppEvents,
		Withdrawals: out.Withdrawals,
		Fuel:        types.NewUint256(FuelProcess),
	}
}

// TrustedRequest handles TRUSTPROCESS payloads produced by the price trigger contract.
// Its authenticity is enforced on-chain (only the app's registered trigger can enqueue it).
func TrustedRequest(payload []byte, stateJSON string) types.ProcessResult {
	s, err := loadState(stateJSON)
	if err != nil {
		return types.ProcessResult{Error: err.Error()}
	}
	upd, err := DecodePriceUpdate(payload)
	if err != nil {
		return types.ProcessResult{Error: err.Error()}
	}
	if err := s.ApplyPriceUpdate(upd); err != nil {
		return types.ProcessResult{Error: err.Error()}
	}
	b, err := json.Marshal(s)
	if err != nil {
		return types.ProcessResult{Error: errState.Error()}
	}
	return types.ProcessResult{State: b, Fuel: types.NewUint256(FuelTrusted)}
}
