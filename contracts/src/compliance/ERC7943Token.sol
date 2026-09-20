// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IERC7943.sol";

/**
 * @title ERC7943Token
 * @notice Reference Implementation of ERC-7943 Compliant Institutional RWA Token
 */
contract ERC7943Token is IERC7943 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    address public owner;

    // ERC20 balances and allowances
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // Partition mappings: partition => holder => balance
    mapping(bytes32 => mapping(address => uint256)) private _partitionBalances;
    mapping(bytes32 => uint256) private _partitionSupplies;
    mapping(address => bytes32[]) private _holderPartitions;
    mapping(address => mapping(bytes32 => bool)) private _hasPartition;

    // Documents: name => (uri, docHash, timestamp)
    struct Document {
        string uri;
        bytes32 docHash;
        uint256 timestamp;
    }
    mapping(bytes32 => Document) private _documents;

    // Default partition constant
    bytes32 public constant DEFAULT_PARTITION = keccak256("ERC7943.DEFAULT.PARTITION");
    bytes32 public constant COLLATERAL_PARTITION = keccak256("AEGIS.COLLATERAL.PARTITION");

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    modifier onlyOwner() {
        require(msg.sender == owner, "ERC7943: caller is not owner");
        _;
    }

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        owner = msg.sender;
    }

    function mint(address to, uint256 amount, bytes32 partition) external onlyOwner {
        require(to != address(0), "ERC7943: mint to zero address");
        totalSupply += amount;
        balanceOf[to] += amount;
        _partitionBalances[partition][to] += amount;
        _partitionSupplies[partition] += amount;

        if (!_hasPartition[to][partition]) {
            _holderPartitions[to].push(partition);
            _hasPartition[to][partition] = true;
        }

        emit Transfer(address(0), to, amount);
        emit TransferByPartition(partition, msg.sender, address(0), to, amount, "", "");
    }

    function balanceOfByPartition(bytes32 partition, address tokenHolder) external view override returns (uint256) {
        return _partitionBalances[partition][tokenHolder];
    }

    function partitionsOf(address tokenHolder) external view override returns (bytes32[] memory) {
        return _holderPartitions[tokenHolder];
    }

    function totalPartitionSupply(bytes32 partition) external view override returns (uint256) {
        return _partitionSupplies[partition];
    }

    function canTransfer(
        address to,
        uint256 value,
        bytes memory /* data */
    ) public view override returns (bool, bytes1, bytes32) {
        if (to == address(0)) return (false, 0x57, bytes32("Invalid Receiver"));
        if (balanceOf[msg.sender] < value) return (false, 0x52, bytes32("Insufficient Balance"));
        return (true, 0x51, bytes32("Transfer Allowed"));
    }

    function canTransferByPartition(
        bytes32 partition,
        address to,
        uint256 value,
        bytes memory /* data */
    ) public view override returns (bool, bytes1, bytes32) {
        if (to == address(0)) return (false, 0x57, bytes32("Invalid Receiver"));
        if (_partitionBalances[partition][msg.sender] < value) return (false, 0x52, bytes32("Insufficient Partition Balance"));
        return (true, 0x51, bytes32("Partition Transfer Allowed"));
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return transferByPartition(DEFAULT_PARTITION, to, amount, "") == DEFAULT_PARTITION;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "ERC7943: allowance exceeded");
        allowance[from][msg.sender] -= amount;
        _transferInternal(DEFAULT_PARTITION, from, to, amount, "");
        return true;
    }

    function transferByPartition(
        bytes32 partition,
        address to,
        uint256 value,
        bytes memory data
    ) public override returns (bytes32) {
        (bool allowed,,) = canTransferByPartition(partition, to, value, data);
        require(allowed, "ERC7943: transfer not allowed");
        _transferInternal(partition, msg.sender, to, value, data);
        return partition;
    }

    function transferFromByPartition(
        bytes32 partition,
        address from,
        address to,
        uint256 value,
        bytes memory data
    ) external override returns (bytes32) {
        require(
            msg.sender == from || allowance[from][msg.sender] >= value,
            "ERC7943: caller unauthorized or allowance exceeded"
        );
        if (msg.sender != from) {
            allowance[from][msg.sender] -= value;
        }

        require(_partitionBalances[partition][from] >= value, "ERC7943: insufficient partition balance");
        _transferInternal(partition, from, to, value, data);
        return partition;
    }

    function _transferInternal(
        bytes32 partition,
        address from,
        address to,
        uint256 value,
        bytes memory data
    ) internal {
        require(to != address(0), "ERC7943: transfer to zero address");
        require(balanceOf[from] >= value, "ERC7943: balance exceeded");
        require(_partitionBalances[partition][from] >= value, "ERC7943: partition balance exceeded");

        balanceOf[from] -= value;
        balanceOf[to] += value;
        _partitionBalances[partition][from] -= value;
        _partitionBalances[partition][to] += value;

        if (!_hasPartition[to][partition]) {
            _holderPartitions[to].push(partition);
            _hasPartition[to][partition] = true;
        }

        emit Transfer(from, to, value);
        emit TransferByPartition(partition, msg.sender, from, to, value, data, "");
    }

    function setDocument(bytes32 nameHash, string calldata uri, bytes32 documentHash) external override onlyOwner {
        _documents[nameHash] = Document(uri, documentHash, block.timestamp);
        emit DocumentUpdated(nameHash, uri, documentHash);
    }

    function getDocument(bytes32 nameHash) external view override returns (string memory, bytes32, uint256) {
        Document memory doc = _documents[nameHash];
        return (doc.uri, doc.docHash, doc.timestamp);
    }
}
