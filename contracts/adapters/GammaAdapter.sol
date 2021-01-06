// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {OptionType, IProtocolAdapter} from "./IProtocolAdapter.sol";
import {InstrumentStorageV1} from "../storage/InstrumentStorage.sol";
import {
    OtokenFactory,
    OtokenInterface
} from "../interfaces/OtokenInterface.sol";

contract GammaAdapter is IProtocolAdapter, InstrumentStorageV1 {
    using SafeMath for uint256;

    address public immutable oTokenFactory;
    address private immutable _weth;

    constructor(address _oTokenFactory, address weth) public {
        oTokenFactory = _oTokenFactory;
        _weth = weth;
    }

    function protocolName() external pure override returns (string memory) {
        return "OPYN_GAMMA";
    }

    function nonFungible() external pure override returns (bool) {
        return false;
    }

    /**
     * @notice Check if an options contract exist based on the passed parameters.
     * @param underlying is the underlying asset of the options. E.g. For ETH $800 CALL, ETH is the underlying.
     * @param strikeAsset is the asset used to denote the asset paid out when exercising the option. E.g. For ETH $800 CALL, USDC is the underlying.
     * @param expiry is the expiry of the option contract. Users can only exercise after expiry in Europeans.
     * @param strikePrice is the strike price of an optio contract. E.g. For ETH $800 CALL, 800*10**18 is the USDC.
     * @param optionType is the type of option, can only be OptionType.Call or OptionType.Put
     */
    function optionsExist(
        address underlying,
        address strikeAsset,
        uint256 expiry,
        uint256 strikePrice,
        OptionType optionType
    ) external view override returns (bool) {
        return false;
    }

    /**
     * @notice Get the options contract's address based on the passed parameters
     * @param underlying is the underlying asset of the options. E.g. For ETH $800 CALL, ETH is the underlying.
     * @param strikeAsset is the asset used to denote the asset paid out when exercising the option. E.g. For ETH $800 CALL, USDC is the underlying.
     * @param expiry is the expiry of the option contract. Users can only exercise after expiry in Europeans.
     * @param strikePrice is the strike price of an optio contract. E.g. For ETH $800 CALL, 800*10**18 is the USDC.
     * @param optionType is the type of option, can only be OptionType.Call or OptionType.Put
     */
    function getOptionsAddress(
        address underlying,
        address strikeAsset,
        uint256 expiry,
        uint256 strikePrice,
        OptionType optionType
    ) external view override returns (address) {
        return address(0);
    }

    /**
     * @notice Gets the premium to buy `purchaseAmount` of the option contract in ETH terms.
     * @param underlying is the underlying asset of the options. E.g. For ETH $800 CALL, ETH is the underlying.
     * @param strikeAsset is the asset used to denote the asset paid out when exercising the option. E.g. For ETH $800 CALL, USDC is the underlying.
     * @param expiry is the expiry of the option contract. Users can only exercise after expiry in Europeans.
     * @param strikePrice is the strike price of an optio contract. E.g. For ETH $800 CALL, 800*10**18 is the USDC.
     * @param optionType is the type of option, can only be OptionType.Call or OptionType.Put
     */
    function premium(
        address underlying,
        address strikeAsset,
        uint256 expiry,
        uint256 strikePrice,
        OptionType optionType,
        uint256 purchaseAmount
    ) external view override returns (uint256 cost) {
        return 0;
    }

    /**
     * @notice Amount of profit made from exercising an option contract (current price - strike price). 0 if exercising out-the-money.
     * @param options is the address of the options contract
     * @param optionID is the ID of the option position in non fungible protocols like Hegic.
     * @param amount is the amount of tokens or options contract to exercise. Only relevant for fungle protocols like Opyn
     */
    function exerciseProfit(
        address options,
        uint256 optionID,
        uint256 amount
    ) external view override returns (uint256 profit) {
        return 0;
    }

    /**
     * @notice Purchases the options contract.
     * @param underlying is the underlying asset of the options. E.g. For ETH $800 CALL, ETH is the underlying.
     * @param strikeAsset is the asset used to denote the asset paid out when exercising the option. E.g. For ETH $800 CALL, USDC is the underlying.
     * @param expiry is the expiry of the option contract. Users can only exercise after expiry in Europeans.
     * @param strikePrice is the strike price of an optio contract. E.g. For ETH $800 CALL, 800*10**18 is the USDC.
     * @param optionType is the type of option, can only be OptionType.Call or OptionType.Put
     * @param amount is the purchase amount in Wad units (10**18)
     */
    function purchase(
        address underlying,
        address strikeAsset,
        uint256 expiry,
        uint256 strikePrice,
        OptionType optionType,
        uint256 amount
    ) external payable override returns (uint256 optionID) {}

    /**
     * @notice Exercises the options contract.
     * @param options is the address of the options contract
     * @param optionID is the ID of the option position in non fungible protocols like Hegic.
     * @param amount is the amount of tokens or options contract to exercise. Only relevant for fungle protocols like Opyn
     * @param recipient is the account that receives the exercised profits. This is needed since the adapter holds all the positions and the msg.sender is an instrument contract.
     */
    function exercise(
        address options,
        uint256 optionID,
        uint256 amount,
        address recipient
    ) external payable override {}

    /**
     * @notice Function to lookup oToken addresses. oToken addresses are keyed by an ABI-encoded byte string
     * @param oToken is the oToken address
     * @param underlying is the underlying asset of the options. E.g. For ETH $800 CALL, ETH is the underlying.
     * @param strikeAsset is the asset used to denote the asset paid out when exercising the option. E.g. For ETH $800 CALL, USDC is the underlying.
     * @param expiry is the expiry of the option contract. Users can only exercise after expiry in Europeans.
     * @param strikePrice is the strike price of an optio contract. E.g. For ETH $800 CALL, 800*10**18 is the USDC.
     * @param optionType is the type of option, can only be OptionType.Call or OptionType.Put
     */
    function lookupOToken(
        address underlying,
        address strikeAsset,
        uint256 expiry,
        uint256 strikePrice,
        OptionType optionType
    ) public view returns (address oToken) {
        bytes memory optionTerms =
            abi.encode(
                underlying,
                strikeAsset,
                expiry,
                strikePrice,
                optionType
            );
        return optionTermsToOToken[optionTerms];
    }

    function setAllOtokens(address oTokenFactoryAddr) external onlyOwner {
        OtokenFactory factory = OtokenFactory(oTokenFactoryAddr);

        for (uint256 i = 0; i < factory.getOtokensLength(); i++) {
            address oToken = factory.oTokens(i);
            setOTokenWithTerms(oToken);
        }
    }

    /**
     * @notice Sets an oToken with the terms. `strikePrice` and `optionType` are manually set. The rest are populated automatically with the oToken's parameters.
     * @param oToken is the oToken address
     */
    function setOTokenWithTerms(address oToken) public onlyOwner {
        OtokenInterface oTokenContract = OtokenInterface(oToken);

        uint256 scaledStrikePrice = oTokenContract.strikePrice() * 10**10;
        bytes memory optionTerms =
            abi.encode(
                oTokenContract.underlyingAsset(),
                oTokenContract.strikeAsset(),
                oTokenContract.expiryTimestamp(),
                scaledStrikePrice,
                oTokenContract.isPut() ? OptionType.Put : OptionType.Call
            );
        optionTermsToOToken[optionTerms] = oToken;
    }
}
