// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockZEN
 * @notice Mock representation of Horizen ZEN token (LayerZero OFT / ERC-20)
 */
contract MockZEN {
    string public name = "Horizen";
    string public symbol = "ZEN";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    address public owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event SendToChain(uint16 indexed dstChainId, address indexed to, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "MockZEN: not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        _mint(msg.sender, 1_000_000 * 10**18); // 1 Million ZEN
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(balanceOf[from] >= amount, "MockZEN: insufficient balance");
        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "MockZEN: allowance exceeded");
        allowance[from][msg.sender] -= amount;
        return _transfer(from, to, amount);
    }

    // LayerZero OFT send mock
    function sendFrom(
        address from,
        uint16 dstChainId,
        bytes calldata toAddress,
        uint256 amount,
        address payable /* refundAddress */,
        address /* zroPaymentAddress */,
        bytes calldata /* adapterParams */
    ) external payable {
        require(balanceOf[from] >= amount, "MockZEN: insufficient balance");
        balanceOf[from] -= amount;
        totalSupply -= amount;
        address recipient = toAddress.length >= 20 ? address(bytes20(toAddress)) : address(0);
        emit SendToChain(dstChainId, recipient, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal returns (bool) {
        require(to != address(0), "MockZEN: transfer to zero address");
        require(balanceOf[from] >= amount, "MockZEN: insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function _mint(address to, uint256 amount) internal {
        require(to != address(0), "MockZEN: mint to zero address");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}
