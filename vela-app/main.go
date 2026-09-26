// Command aegis_lending is the Aegis confidential credit market, compiled with TinyGo to a
// WASI module and executed by Horizen Vela inside an AWS Nitro Enclave.
package main

import (
	"github.com/HorizenOfficial/vela-common-go/wasm/types"
	"github.com/HorizenOfficial/vela-common-go/wasm/utils"
	"github.com/zzzbedream/Aegis-Protocol/vela-app/lending"
)

//export deploy
func deploy(appId int64, paramsPtr *byte, paramsLen int32) *byte {
	return types.SerializeAndWriteResult(lending.Deploy(appId, utils.PtrToString(paramsPtr, paramsLen)))
}

//export load_module
func load_module(appId int64) *byte {
	return types.SerializeAndWriteResult(lending.LoadModule(appId))
}

//export deposit
func deposit(appId int64, senderPtr *byte, senderLen int32, tokenPtr *byte, tokenLen int32, valuePtr *byte, valueLen int32, statePtr *byte, stateLen int32) *byte {
	_ = appId
	sender := types.PtrToAddress(senderPtr, senderLen)
	token := types.PtrToAddress(tokenPtr, tokenLen)
	value := types.PtrToUint256(valuePtr, valueLen)
	return types.SerializeAndWriteResult(lending.DepositFunds(sender, token, value, utils.PtrToString(statePtr, stateLen)))
}

//export process_request
func process_request(appId int64, senderPtr *byte, senderLen int32, requestType int32, payloadPtr *byte, payloadLen int32, statePtr *byte, stateLen int32) *byte {
	_ = appId
	sender := types.PtrToAddress(senderPtr, senderLen)
	return types.SerializeAndWriteResult(lending.ProcessRequest(sender, requestType, utils.PtrToString(payloadPtr, payloadLen), utils.PtrToString(statePtr, stateLen)))
}

//export trusted_request
func trusted_request(appId int64, payloadPtr *byte, payloadLen int32, statePtr *byte, stateLen int32) *byte {
	_ = appId
	payload := []byte(utils.PtrToString(payloadPtr, payloadLen))
	return types.SerializeAndWriteResult(lending.TrustedRequest(payload, utils.PtrToString(statePtr, stateLen)))
}

func main() {}
