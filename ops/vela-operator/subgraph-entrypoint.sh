#!/bin/sh
# Remote-chain variant of HorizenOfficial/vela v0.2.0 dockerfiles/subgraph-deployer/entrypoint.sh
# (BUSL 1.1, evaluation/testing). Only difference: startBlock comes from SUBGRAPH_START_BLOCK (the
# block where the Vela contracts were deployed) instead of 0, so graph-node does not index the whole
# public chain. Runs inside the official horizen/cce-subgraph-deployer image (its WORKDIR holds
# subgraph.yaml and the graph CLI).
set -e

DEPLOY_FILE="${DEPLOY_DATA_DIR:-/deploy-data}/deployed_addresses.env"
GRAPH_NODE_URL="${GRAPH_NODE_URL:-http://subgraph-node:8020}"
IPFS_URL="${IPFS_URL:-http://subgraph-ipfs:5001}"
SUBGRAPH_NAME="${SUBGRAPH_NAME:-hcce}"

if [ ! -f "${DEPLOY_FILE}" ]; then
    echo "subgraph-deployer: ERROR - ${DEPLOY_FILE} not found (see ops/README.md)."
    exit 1
fi
. "${DEPLOY_FILE}"
if [ -z "${CHAIN_PROCESSOR_ADDRESS}" ] || [ -z "${CHAIN_TOKEN_ALLOWLIST_ADDRESS}" ]; then
    echo "subgraph-deployer: ERROR - CHAIN_PROCESSOR_ADDRESS / CHAIN_TOKEN_ALLOWLIST_ADDRESS missing."
    exit 1
fi
case "${SUBGRAPH_START_BLOCK}" in
    ''|*[!0-9]*) echo "subgraph-deployer: ERROR - SUBGRAPH_START_BLOCK must be a block number."; exit 1 ;;
esac

echo "subgraph-deployer: waiting for Graph Node at ${GRAPH_NODE_URL}..."
i=0
until curl -sf -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"subgraph_create","id":1,"params":{"name":"__healthcheck__"}}' \
    "${GRAPH_NODE_URL}" > /dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -ge 60 ]; then echo "subgraph-deployer: ERROR - Graph Node not ready."; exit 1; fi
    sleep 2
done

sed -e "s/network: horizen-testnet/network: local/" \
    -e "s/address: \"0x<processor_address>\"/address: \"${CHAIN_PROCESSOR_ADDRESS}\"/" \
    -e "s/address: \"0x<token_allowlist_address>\"/address: \"${CHAIN_TOKEN_ALLOWLIST_ADDRESS}\"/" \
    -e "s/startBlock: [0-9]*/startBlock: ${SUBGRAPH_START_BLOCK}/" \
    subgraph.yaml > subgraph-remote.yaml
cat subgraph-remote.yaml

npx graph codegen subgraph-remote.yaml
npx graph create --node "${GRAPH_NODE_URL}" "${SUBGRAPH_NAME}" || true
npx graph deploy --node "${GRAPH_NODE_URL}" --ipfs "${IPFS_URL}" --version-label v0.0.1 \
    "${SUBGRAPH_NAME}" subgraph-remote.yaml

echo "subgraph-deployer: done."
