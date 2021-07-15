pragma solidity >=0.7.2;

import {
    ERC20Upgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract MockRibbonV2Vault is ERC20Upgradeable {
    address public asset;

    constructor(address token) {
        asset = token;
    }

    function initialize() external initializer {
        string memory _tokenName = "MockV2";
        string memory _tokenSymbol = "V2";
        __ERC20_init(_tokenName, _tokenSymbol);
    }

    function depositFor(uint256 amount, address creditor) external {
        require(amount > 0, "!amount");
        require(creditor != address(0));

        // skip actual deposit logic here

        IERC20(asset).transferFrom(msg.sender, address(this), amount);
    }
}
