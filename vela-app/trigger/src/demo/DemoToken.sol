// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title DemoToken
/// @notice TESTNET ONLY. Plain ERC-20 (no fee-on-transfer, no rebasing, as Vela's allowlist requires)
///         with a rate-limited public faucet so anyone can try the Aegis demo, and an owner mint for
///         seeding demo accounts. Worthless by design.
contract DemoToken is ERC20, Ownable {
    uint256 public constant FAUCET_COOLDOWN = 1 days;

    uint8 private immutable _decimals;
    uint256 public immutable faucetAmount;
    mapping(address => uint256) public nextFaucetAt;

    error FaucetCooldown(uint256 availableAt);

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 faucetAmount_, address owner_)
        ERC20(name_, symbol_)
        Ownable(owner_)
    {
        _decimals = decimals_;
        faucetAmount = faucetAmount_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function faucet() external {
        uint256 availableAt = nextFaucetAt[msg.sender];
        if (block.timestamp < availableAt) revert FaucetCooldown(availableAt);
        nextFaucetAt[msg.sender] = block.timestamp + FAUCET_COOLDOWN;
        _mint(msg.sender, faucetAmount);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
