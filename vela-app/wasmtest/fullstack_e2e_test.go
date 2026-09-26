package wasmtest

// End-to-end test on Horizen's own full-stack harness (github.com/HorizenOfficial/vela
// v0.2.0, pkg/testutil/fullstack): a go-ethereum simulated chain with the real
// ProcessorEndpoint/TokenAllowlist/TeeAuthenticator contracts, the real Manager, the real
// Executor (keys, ECDH/AES encryption, secp256k1-signed stateUpdates) and the real WASM
// runtime. It is the production path minus network and Nitro attestation.
//
// Needs the Foundry artifacts of ../trigger (run `forge build` there first); skipped otherwise.

import (
	"bytes"
	"context"
	"encoding/json"
	"math/big"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	velacommon "github.com/HorizenOfficial/vela-common-go/common"
	"github.com/HorizenOfficial/vela/pkg/authorityservice/deployartifact"
	"github.com/HorizenOfficial/vela/pkg/blockchain/contracts/mockerc20"
	"github.com/HorizenOfficial/vela/pkg/common"
	commontestutil "github.com/HorizenOfficial/vela/pkg/common/testutil"
	"github.com/HorizenOfficial/vela/pkg/testutil"
	"github.com/HorizenOfficial/vela/pkg/testutil/fullstack"
	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind/v2"
	ethCommon "github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

const e2eTimeout = 60 * time.Second

type forgeArtifact struct {
	ABI      json.RawMessage `json:"abi"`
	Bytecode struct {
		Object string `json:"object"`
	} `json:"bytecode"`
}

func loadArtifact(t *testing.T, rel string) (abi.ABI, []byte) {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "trigger", "out", rel))
	if err != nil {
		t.Skipf("Foundry artifact %s missing (run `forge build` in vela-app/trigger): %v", rel, err)
	}
	var a forgeArtifact
	if err := json.Unmarshal(raw, &a); err != nil {
		t.Fatal(err)
	}
	parsed, err := abi.JSON(bytes.NewReader(a.ABI))
	if err != nil {
		t.Fatal(err)
	}
	return parsed, ethCommon.FromHex(a.Bytecode.Object)
}

type e2e struct {
	t      *testing.T
	suite  *fullstack.FullStackSystemTestSuite
	ch     *testutil.CryptoHelper
	appID  common.ApplicationIdType
	client bind.ContractBackend
}

func (x *e2e) deploy(parsed abi.ABI, code []byte, args ...any) (ethCommon.Address, *bind.BoundContract) {
	x.t.Helper()
	input, err := parsed.Pack("", args...)
	if err != nil {
		x.t.Fatal(err)
	}
	sim := x.suite.GetSimTestHelper()
	addr, tx, err := bind.DeployContract(sim.Deployer, code, x.client, input)
	if err != nil {
		x.t.Fatal(err)
	}
	sim.WaitMined(tx)
	return addr, bind.NewBoundContract(addr, parsed, x.client, x.client, x.client)
}

func (x *e2e) transact(c *bind.BoundContract, opts *bind.TransactOpts, parsed abi.ABI, method string, args ...any) {
	x.t.Helper()
	data, err := parsed.Pack(method, args...)
	if err != nil {
		x.t.Fatal(err)
	}
	tx, err := bind.Transact(c, opts, data)
	if err != nil {
		x.t.Fatalf("%s: %v", method, err)
	}
	x.suite.GetSimTestHelper().WaitMined(tx)
}

func (x *e2e) account() ethCommon.Address {
	x.t.Helper()
	addr, secp, err := x.suite.CreateFundedAccount()
	if err != nil {
		x.t.Fatal(err)
	}
	x.ch.RegisterUserSigningKey(addr, secp)
	if _, err := x.ch.GenerateUserKey(addr); err != nil {
		x.t.Fatal(err)
	}
	return addr
}

// associate registers the account's P-521 key on the executor (ASSOCIATEKEY).
func (x *e2e) associate(addr ethCommon.Address) {
	x.t.Helper()
	key, _ := x.ch.GetUserKey(addr)
	execPub, err := x.suite.GetExecutorCommunicationKey()
	if err != nil {
		x.t.Fatal(err)
	}
	req, err := x.ch.CreateAssociateKeyRequest(x.appID, commontestutil.GenerateRandomRequestID(), addr, key.PublicKey(), execPub)
	if err != nil {
		x.t.Fatal(err)
	}
	req.MaxFeeValue = common.NewBig(10_000)
	if err := x.suite.SubmitRequest(req); err != nil {
		x.t.Fatal(err)
	}
	if err := x.suite.AssertRequestCompleted(req.RequestID, e2eTimeout); err != nil {
		x.t.Fatal(err)
	}
}

// process submits an encrypted PROCESS request, optionally carrying an ERC-20 deposit.
func (x *e2e) process(sender ethCommon.Address, payload string, token ethCommon.Address, amount *big.Int) (common.RequestIdType, error) {
	x.t.Helper()
	execPub, err := x.suite.GetExecutorCommunicationKey()
	if err != nil {
		x.t.Fatal(err)
	}
	req, err := x.ch.CreateProcessRequest(x.appID, commontestutil.GenerateRandomRequestID(), sender, []byte(payload), execPub)
	if err != nil {
		x.t.Fatal(err)
	}
	req.MaxFeeValue = common.NewBig(10_000)
	req.TokenAddress = velacommon.ETH_TOKEN
	req.AssetAmount = common.NewBig(0)
	if amount != nil {
		req.TokenAddress = token
		req.AssetAmount = common.ToBig(amount)
	}
	// Submit directly: the harness' SubmitRequest expects exactly one log per tx, but an
	// ERC-20 deposit also emits the token's Transfer event.
	sim := x.suite.GetSimTestHelper()
	opts, err := x.suite.GetTransactOpts(sender)
	if err != nil {
		x.t.Fatal(err)
	}
	tx := sim.SubmitRequestFromUser(x.appID, common.Process, req.Payload, req.TokenAddress, req.AssetAmount.ToInt(), req.MaxFeeValue.ToInt(), opts)
	sim.WaitMined(tx)
	receipt, err := sim.GetTxReceipt(tx)
	if err != nil {
		x.t.Fatal(err)
	}
	submitted := crypto.Keccak256Hash([]byte("RequestSubmitted(uint64,bytes32,address,address)"))
	for _, l := range receipt.Logs {
		if l.Address == sim.ProcessorContractAddress && len(l.Topics) == 4 && l.Topics[0] == submitted {
			var id common.RequestIdType
			copy(id[:], l.Topics[2].Bytes())
			return id, x.suite.AssertRequestCompleted(id, e2eTimeout)
		}
	}
	x.t.Fatal("RequestSubmitted event not found")
	return common.RequestIdType{}, nil
}

func (x *e2e) mustProcess(sender ethCommon.Address, payload string, token ethCommon.Address, amount *big.Int) common.RequestIdType {
	x.t.Helper()
	id, err := x.process(sender, payload, token, amount)
	if err != nil {
		x.t.Fatalf("request %s failed: %v", payload, err)
	}
	return id
}

// waitTrustProcesses waits until the manager has pulled n TRUSTPROCESS requests.
func (x *e2e) waitTrustProcesses(n int) {
	x.t.Helper()
	deadline := time.Now().Add(e2eTimeout)
	for x.suite.TrustProcessCount() < n {
		if time.Now().After(deadline) {
			x.t.Fatalf("timeout waiting for TRUSTPROCESS #%d", n)
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func hexLower(a ethCommon.Address) string { return strings.ToLower(a.Hex()) }

// logsMention reports whether any log in [from, to] contains addr in a topic or in data.
func (x *e2e) logsMention(from, to uint64, addr ethCommon.Address) bool {
	x.t.Helper()
	logs, err := x.suite.GetSimTestHelper().Client().FilterLogs(context.Background(), ethereum.FilterQuery{
		FromBlock: new(big.Int).SetUint64(from), ToBlock: new(big.Int).SetUint64(to),
	})
	if err != nil {
		x.t.Fatal(err)
	}
	if len(logs) == 0 {
		x.t.Fatalf("no logs in blocks %d..%d", from, to)
	}
	for _, l := range logs {
		for _, topic := range l.Topics {
			if bytes.Contains(topic.Bytes(), addr.Bytes()) {
				return true
			}
		}
		if bytes.Contains(l.Data, addr.Bytes()) {
			return true
		}
	}
	return false
}

func TestFullStackBlindLiquidationWithStorkTrigger(t *testing.T) {
	storkABI, storkCode := loadArtifact(t, "AegisPriceTrigger.t.sol/MockStork.json")
	trigABI, trigCode := loadArtifact(t, "AegisPriceTrigger.sol/AegisPriceTrigger.json")
	wasm := buildWasm(t)

	suite := fullstack.NewWasmRuntimeSuite(t)
	defer func() { _ = suite.Cleanup() }()
	sim := suite.GetSimTestHelper()
	x := &e2e{t: t, suite: suite, ch: testutil.NewCryptoHelper(), client: sim.Client()}
	ctx := context.Background()

	// --- Tokens: USDC (6 dec) via the harness helper, ZEN (18 dec) via the same binding.
	usdcAddr := sim.DeployMockERC20("USD Coin", "USDC", 6)
	erc20 := mockerc20.NewMockERC20()
	deployRes, err := bind.LinkAndDeploy(&bind.DeploymentParams{
		Contracts: []*bind.MetaData{&mockerc20.MockERC20MetaData},
		Inputs:    map[string][]byte{mockerc20.MockERC20MetaData.ID: erc20.PackConstructor("Horizen", "ZEN", 18)},
	}, bind.DefaultDeployer(sim.Deployer, sim.Client()))
	if err != nil {
		t.Fatal(err)
	}
	zenAddr := deployRes.Addresses[mockerc20.MockERC20MetaData.ID]
	sim.WaitMined(deployRes.Txs[mockerc20.MockERC20MetaData.ID])
	zen := erc20.Instance(sim.Client(), zenAddr)
	sim.WaitMined(sim.AddAllowedToken(usdcAddr))
	sim.WaitMined(sim.AddAllowedToken(zenAddr))

	// --- Oracle + trigger.
	usdcFeed := crypto.Keccak256Hash([]byte("USDCUSD"))
	zenFeed := crypto.Keccak256Hash([]byte("ZENUSD"))
	storkAddr, stork := x.deploy(storkABI, storkCode)
	setPrice := func(feed ethCommon.Hash, usd *big.Int) {
		head, err := sim.Client().HeaderByNumber(ctx, nil)
		if err != nil {
			t.Fatal(err)
		}
		x.transact(stork, sim.Deployer, storkABI, "set", [32]byte(feed), head.Time, usd)
	}
	setPrice(usdcFeed, e(1, 18))
	setPrice(zenFeed, e(10, 18))
	trigger, _ := x.deploy(trigABI, trigCode,
		sim.ProcessorContractAddress, storkAddr,
		[]ethCommon.Address{usdcAddr, zenAddr},
		[][32]byte{usdcFeed, zenFeed},
		[]uint8{18, 18},
		big.NewInt(3600),
	)

	// --- Start manager/executor and deploy the guest wired to the trigger.
	if err := suite.StartExecutor(); err != nil {
		t.Fatal(err)
	}
	if err := suite.StartManager(); err != nil {
		t.Fatal(err)
	}
	params, _ := json.Marshal(map[string]any{
		"debt": map[string]any{"address": hexLower(usdcAddr), "decimals": 6},
		"collaterals": []map[string]any{{
			"address": hexLower(zenAddr), "decimals": 18,
			"ltvBps": 7500, "liqThresholdBps": 8000, "liqBonusBps": 500,
		}},
		"borrowAprBps": 800, "closeFactorBps": 5000,
	})
	store, err := deployartifact.NewStore(suite.GetArtifactsPath())
	if err != nil {
		t.Fatal(err)
	}
	saved, err := store.SaveWASM(bytes.NewReader(wasm))
	if err != nil {
		t.Fatal(err)
	}
	descriptor, _ := json.Marshal(common.DeployDescriptor{
		Mode: common.DeployModeArtifactRef, ArtifactID: saved.ArtifactID, WasmSHA256: saved.WasmSHA256, ConstructorParams: params,
	})
	deployReq := &common.Request{
		RequestType: common.Deploy, Payload: descriptor, Sender: suite.GetDeployerAddress(),
		Timestamp: common.ToBig(big.NewInt(time.Now().Unix())), TokenAddress: velacommon.ETH_TOKEN,
		AssetAmount: common.NewBig(0), MaxFeeValue: common.NewBig(10_000),
	}
	if err := suite.SubmitDeployRequestWithTrigger(deployReq, trigger); err != nil {
		t.Fatal(err)
	}
	if err := suite.AssertRequestCompleted(deployReq.RequestID, e2eTimeout); err != nil {
		t.Fatalf("deploy failed: %v", err)
	}
	x.appID = deployReq.ApplicationID

	// --- Actors (each registers a P-521 key to submit/receive encrypted data).
	lender, alice, liqr := x.account(), x.account(), x.account()
	for _, a := range []ethCommon.Address{lender, alice, liqr} {
		x.associate(a)
	}
	fund := func(tok *bind.BoundContract, to ethCommon.Address, amt *big.Int) {
		tx, err := bind.Transact(tok, sim.Deployer, erc20.PackMint(to, amt))
		if err != nil {
			t.Fatal(err)
		}
		sim.WaitMined(tx)
		opts, err := suite.GetTransactOpts(to)
		if err != nil {
			t.Fatal(err)
		}
		// Approve more than minted: a failed request refunds into pendingClaims, not into
		// the allowance, so retries would otherwise run short.
		tx, err = bind.Transact(tok, opts, erc20.PackApprove(sim.ProcessorContractAddress, new(big.Int).Mul(amt, big.NewInt(2))))
		if err != nil {
			t.Fatal(err)
		}
		sim.WaitMined(tx)
	}
	usdc := erc20.Instance(sim.Client(), usdcAddr)
	fund(usdc, lender, e(100_000, 6))
	fund(zen, alice, e(1_000, 18))
	fund(usdc, liqr, e(10_001, 6)) // 1 USDC for the rejected attempt on a healthy market

	// 1. Prices enter through the trigger: poke → AEGIS.PRICE_REQUEST → TRUSTPROCESS.
	x.mustProcess(lender, `{"type":"poke"}`, ethCommon.Address{}, nil)
	x.waitTrustProcesses(1)
	if _, _, err := suite.WaitForTrustProcessRequest(e2eTimeout); err != nil {
		t.Fatalf("price update rejected by the guest: %v", err)
	}

	// 2. Lender supplies, borrower posts collateral and borrows (deposit + instruction in one request).
	x.mustProcess(lender, `{"type":"supply","amount":"`+hexAmt(e(100_000, 6))+`"}`, usdcAddr, e(100_000, 6))
	depFrom, _ := sim.Client().BlockNumber(ctx)
	x.mustProcess(alice, `{"type":"add_collateral","token":"`+hexLower(zenAddr)+`","amount":"`+hexAmt(e(1_000, 18))+`"}`, zenAddr, e(1_000, 18))
	depTo, _ := sim.Client().BlockNumber(ctx)
	// Positive control for the privacy scan below: alice's own deposit is public by design.
	if !x.logsMention(depFrom+1, depTo, alice) {
		t.Fatal("log scan failed to find the depositor in her own deposit (scan is broken)")
	}
	if _, err := x.process(alice, `{"type":"borrow","amount":"`+hexAmt(e(7_501, 6))+`"}`, ethCommon.Address{}, nil); err == nil {
		t.Fatal("borrow above LTV must fail")
	}
	x.mustProcess(alice, `{"type":"borrow","amount":"`+hexAmt(e(7_000, 6))+`"}`, ethCommon.Address{}, nil)
	x.mustProcess(alice, `{"type":"withdraw","token":"`+hexLower(usdcAddr)+`","amount":"`+hexAmt(e(7_000, 6))+`","to":"`+hexLower(alice)+`"}`, ethCommon.Address{}, nil)
	if got := sim.GetPendingClaims(usdcAddr, alice); got.Cmp(e(7_000, 6)) != 0 {
		t.Fatalf("borrowed USDC not claimable: %v", got)
	}

	// Healthy position: a liquidation attempt must fail.
	if _, err := x.process(liqr, `{"type":"liquidate","token":"`+hexLower(zenAddr)+`","maxRepay":"`+hexAmt(e(1, 6))+`"}`, usdcAddr, e(1, 6)); err == nil {
		t.Fatal("liquidating a healthy market must fail")
	}

	// 3. ZEN drops to $8 → alice's HF = 8000*0.8/7000 ≈ 0.91.
	setPrice(usdcFeed, e(1, 18))
	setPrice(zenFeed, e(8, 18))
	x.mustProcess(lender, `{"type":"poke"}`, ethCommon.Address{}, nil)
	x.waitTrustProcesses(2)

	// 4. Blind liquidation. Record the block range to audit every log it produces.
	startBlock, err := sim.Client().BlockNumber(ctx)
	if err != nil {
		t.Fatal(err)
	}
	liqID := x.mustProcess(liqr, `{"type":"liquidate","token":"`+hexLower(zenAddr)+`","maxRepay":"`+hexAmt(e(10_000, 6))+`"}`, usdcAddr, e(10_000, 6))
	x.mustProcess(liqr, `{"type":"withdraw","token":"`+hexLower(zenAddr)+`","amount":"`+hexAmt(e(459, 18))+`","to":"`+hexLower(liqr)+`"}`, ethCommon.Address{}, nil)
	endBlock, _ := sim.Client().BlockNumber(ctx)

	// Seized ≈ repay(≈3,500 USDC) * 1.05 / $8 ≈ 459.4 ZEN; 459 ZEN withdrawn and claimable.
	if got := sim.GetPendingClaims(zenAddr, liqr); got.Cmp(e(459, 18)) != 0 {
		t.Fatalf("seized collateral not claimable by the liquidator: %v", got)
	}
	sim.WaitMined(sim.Claim(zenAddr, liqr))
	zenBal, err := bind.Call(zen, &bind.CallOpts{}, erc20.PackBalanceOf(liqr), erc20.UnpackBalanceOf)
	if err != nil {
		t.Fatal(err)
	}
	if zenBal.Cmp(e(459, 18)) != 0 {
		t.Fatalf("liquidator ZEN balance after claim = %v, want 459e18", zenBal)
	}

	// 5. Privacy at chain level: no log emitted between the liquidation request and the
	//    liquidator's withdrawal mentions the borrower's address (topics or data).
	if x.logsMention(startBlock+1, endBlock, alice) {
		t.Fatal("borrower address leaked in a log of the liquidation or the liquidator's withdrawal")
	}
	upd, err := suite.GetRequestUpdatePayload(liqID)
	if err != nil {
		t.Fatal(err)
	}
	if len(upd.AppEvents) != 0 || len(upd.Withdrawals) != 0 {
		t.Fatal("the liquidation must publish no app events and no withdrawals")
	}

	// Exactly two TRUSTPROCESS requests: the trigger loop terminated each time.
	if n := suite.TrustProcessCount(); n != 2 {
		t.Fatalf("expected 2 TRUSTPROCESS requests, got %d", n)
	}
	if _, err := suite.WaitForFailedTrustProcessRequest(2 * time.Second); err == nil {
		t.Fatal("a TRUSTPROCESS request failed")
	}
	suite.AssertNoStateUpdateErrors(t)
}
