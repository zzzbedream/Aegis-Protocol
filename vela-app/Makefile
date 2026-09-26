APP  := aegis_lending
OUT  := build/$(APP).wasm
PROD := production_build/$(APP).wasm
SRC  := $(shell find . -path ./wasmtest -prune -o -name '*.go' -print)

.PHONY: build production_build test test-wasm clean

build: $(OUT)

production_build: $(PROD)

$(OUT): $(SRC)
	@mkdir -p $(@D)
	tinygo build -o $@ -target=wasi .

$(PROD): $(SRC)
	@mkdir -p $(@D)
	tinygo build -o $@ -opt=s -no-debug -target=wasi .

# Pure-Go unit tests of the credit engine (no TinyGo needed).
test:
	go test ./...

# Runs the compiled WASM inside Horizen's Vela WasmtimeRuntime (needs TinyGo + cgo).
test-wasm: build
	cd wasmtest && go test -count=1 ./...

clean:
	rm -rf build production_build
