const { accounts, contract, web3 } = require("@openzeppelin/test-environment");
const {
  BN,
  ether,
  constants,
  time,
  expectRevert,
  expectEvent,
  balance,
} = require("@openzeppelin/test-helpers");
const { assert } = require("chai");
const helper = require("../helper.js");
const MockGammaAdapter = contract.fromArtifact("MockGammaAdapter");
const MockGammaController = contract.fromArtifact("MockGammaController");
const GammaAdapter = contract.fromArtifact("GammaAdapter");
const GammaController = contract.fromArtifact("IController");
const IERC20 = contract.fromArtifact("IERC20");
const IWETH = contract.fromArtifact("IWETH");
const UniswapRouter = contract.fromArtifact("IUniswapV2Router01");
const ZERO_EX_API_RESPONSES = require("../fixtures/GammaAdapter.json");
const { wdiv } = require("../utils");

const GAMMA_CONTROLLER = "0x4ccc2339F87F6c59c6893E1A678c2266cA58dC72";
const MARGIN_POOL = "0x5934807cC0654d46755eBd2848840b616256C6Ef";
const GAMMA_ORACLE = "0xc497f40D1B7db6FA5017373f1a0Ec6d53126Da23";
const UNISWAP_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const ZERO_EX_EXCHANGE = "0x61935CbDd02287B511119DDb11Aeb42F1593b7Ef";
const OTOKEN_FACTORY = "0x7C06792Af1632E77cb27a558Dc0885338F4Bdf8E";
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WBTC_ADDRESS = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
const ETH_ADDRESS = constants.ZERO_ADDRESS;
const [admin, owner, user, recipient] = accounts;

const PUT_OPTION_TYPE = 1;
const CALL_OPTION_TYPE = 2;

describe("GammaAdapter", () => {
  let initSnapshotId;
  const gasPrice = web3.utils.toWei("10", "gwei");

  before(async function () {
    this.protocolName = "OPYN_GAMMA";
    this.nonFungible = false;

    this.gammaController = await GammaController.at(GAMMA_CONTROLLER);

    this.mockController = await MockGammaController.new(
      GAMMA_ORACLE,
      UNISWAP_ROUTER,
      WETH_ADDRESS
    );

    this.mockController.setPrice("110000000000");

    this.mockAdapter = await MockGammaAdapter.new(
      OTOKEN_FACTORY,
      this.mockController.address,
      WETH_ADDRESS,
      ZERO_EX_EXCHANGE,
      UNISWAP_ROUTER,
      {
        from: owner,
      }
    );

    this.adapter = await GammaAdapter.new(
      OTOKEN_FACTORY,
      GAMMA_CONTROLLER,
      WETH_ADDRESS,
      ZERO_EX_EXCHANGE,
      UNISWAP_ROUTER,
      {
        from: owner,
      }
    );

    const snapShot = await helper.takeSnapshot();
    initSnapshotId = snapShot["result"];
  });

  after(async () => {
    await helper.revertToSnapShot(initSnapshotId);
  });

  describe("#protocolName", () => {
    it("matches the protocol name", async function () {
      assert.equal(await this.adapter.protocolName(), this.protocolName);
    });
  });

  describe("#nonFungible", () => {
    it("matches the nonFungible bool", async function () {
      assert.equal(await this.adapter.nonFungible(), this.nonFungible);
    });
  });

  describe("#lookupOtoken", () => {
    it("looks up call oToken correctly", async function () {
      const oTokenAddress = "0x60ad22806B89DD17B2ecfe220c3712A2c86dfFFE";

      const actualOTokenAddress = await this.adapter.lookupOToken([
        constants.ZERO_ADDRESS,
        USDC_ADDRESS,
        constants.ZERO_ADDRESS,
        "1614326400",
        ether("800"),
        CALL_OPTION_TYPE,
      ]);
      assert.equal(actualOTokenAddress, oTokenAddress);
    });

    it("looks up put oToken correctly", async function () {
      const oTokenAddress = "0x006583fEea92C695A9dE02C3AC2d4cd321f2F341";

      const actualOTokenAddress = await this.adapter.lookupOToken([
        constants.ZERO_ADDRESS,
        USDC_ADDRESS,
        constants.ZERO_ADDRESS,
        "1610697600",
        ether("800"),
        PUT_OPTION_TYPE,
      ]);
      assert.equal(actualOTokenAddress, oTokenAddress);
    });
  });

  behavesLikeOTokens({
    name: "Call ITM",
    oTokenAddress: "0x3cF86d40988309AF3b90C14544E1BB0673BFd439",
    underlying: ETH_ADDRESS,
    strikeAsset: USDC_ADDRESS,
    collateralAsset: WETH_ADDRESS,
    strikePrice: ether("960"),
    expiry: "1614326400",
    optionType: CALL_OPTION_TYPE,
    purchaseAmount: ether("0.1"),
    shortAmount: ether("1"),
    exerciseProfit: new BN("12727272727272727"),
    premium: "50329523139774375",
  });

  behavesLikeOTokens({
    name: "Call OTM",
    oTokenAddress: "0x8fF78Af59a83Cb4570C54C0f23c5a9896a0Dc0b3",
    underlying: ETH_ADDRESS,
    strikeAsset: USDC_ADDRESS,
    collateralAsset: WETH_ADDRESS,
    strikePrice: ether("1480"),
    expiry: "1610697600",
    optionType: CALL_OPTION_TYPE,
    purchaseAmount: ether("0.1"),
    shortAmount: ether("1"),
    exerciseProfit: new BN("0"),
    premium: "18271767935676968",
  });

  behavesLikeOTokens({
    name: "Put OTM",
    oTokenAddress: "0x006583fEea92C695A9dE02C3AC2d4cd321f2F341",
    underlying: ETH_ADDRESS,
    strikeAsset: USDC_ADDRESS,
    collateralAsset: USDC_ADDRESS,
    strikePrice: ether("800"),
    expiry: "1610697600",
    optionType: PUT_OPTION_TYPE,
    purchaseAmount: ether("0.1"),
    shortAmount: new BN("1000000000"),
    exerciseProfit: new BN("0"),
    premium: "16125055430257410",
  });
});

function behavesLikeOTokens(params) {
  describe(`${params.name}`, () => {
    before(async function () {
      const {
        underlying,
        strikeAsset,
        collateralAsset,
        strikePrice,
        expiry,
        optionType,
        oTokenAddress,
        purchaseAmount,
        exerciseProfit,
        shortAmount,
        premium,
      } = params;

      this.oTokenAddress = oTokenAddress;
      this.underlying = underlying;
      this.strikeAsset = strikeAsset;
      this.collateralAsset = collateralAsset;
      this.strikePrice = strikePrice;
      this.expiry = expiry;
      this.optionType = optionType;
      this.purchaseAmount = purchaseAmount;
      this.exerciseProfit = exerciseProfit;
      this.premium = premium;
      this.shortAmount = shortAmount;
      this.apiResponse = ZERO_EX_API_RESPONSES[oTokenAddress];
      this.scaleDecimals = (n) => n.div(new BN("10").pow(new BN("10")));

      this.oToken = await IERC20.at(oTokenAddress);

      this.optionTerms = [
        this.underlying,
        this.strikeAsset,
        this.collateralAsset,
        this.expiry,
        this.strikePrice,
        this.optionType,
      ];

      this.zeroExOrder = [
        this.apiResponse.to,
        this.apiResponse.buyTokenAddress,
        this.apiResponse.sellTokenAddress,
        this.apiResponse.to,
        this.apiResponse.protocolFee,
        this.apiResponse.buyAmount,
        this.apiResponse.sellAmount,
        this.apiResponse.data,
      ];
    });

    describe("#premium", () => {
      it("has a premium of 0", async function () {
        assert.equal(
          await this.adapter.premium(this.optionTerms, this.purchaseAmount),
          "0"
        );
      });
    });

    describe("#exerciseProfit", () => {
      let snapshotId;

      beforeEach(async () => {
        const snapShot = await helper.takeSnapshot();
        snapshotId = snapShot["result"];
      });

      afterEach(async () => {
        await helper.revertToSnapShot(snapshotId);
      });

      it("gets exercise profit", async function () {
        await time.increaseTo(this.expiry + 1);

        assert.equal(
          (
            await this.adapter.exerciseProfit(
              this.oTokenAddress,
              0,
              this.purchaseAmount
            )
          ).toString(),
          this.exerciseProfit
        );
      });
    });

    describe("#purchaseWithZeroEx", () => {
      let snapshotId;

      beforeEach(async () => {
        const snapShot = await helper.takeSnapshot();
        snapshotId = snapShot["result"];
      });

      afterEach(async () => {
        await helper.revertToSnapShot(snapshotId);
      });

      it("purchases with 0x exchange", async function () {
        const res = await this.adapter.purchaseWithZeroEx(
          this.optionTerms,
          this.zeroExOrder,
          {
            from: user,
            gasPrice: this.apiResponse.gasPrice,
            value: calculateZeroExOrderCost(this.apiResponse),
          }
        );

        const buyToken = await IERC20.at(this.apiResponse.buyTokenAddress);
        const sellToken = await IERC20.at(this.apiResponse.sellTokenAddress);

        assert.isAtLeast(
          (await buyToken.balanceOf(this.adapter.address)).toNumber(),
          parseInt(this.apiResponse.buyAmount)
        );
        assert.equal(await sellToken.balanceOf(this.adapter.address), "0");

        expectEvent(res, "Purchased", {
          caller: user,
          protocolName: web3.utils.sha3(this.protocolName),
          underlying: this.underlying,
          strikeAsset: this.strikeAsset,
          expiry: this.expiry,
          strikePrice: this.strikePrice,
          optionType: this.optionType.toString(),
          amount: this.scaleDecimals(this.purchaseAmount),
          premium: this.premium,
          optionID: "0",
        });
      });

      it("purchases twice", async function () {
        await this.adapter.purchaseWithZeroEx(
          this.optionTerms,
          this.zeroExOrder,
          {
            from: user,
            gasPrice: this.apiResponse.gasPrice,
            value: calculateZeroExOrderCost(this.apiResponse),
          }
        );

        await this.adapter.purchaseWithZeroEx(
          this.optionTerms,
          this.zeroExOrder,
          {
            from: user,
            gasPrice: this.apiResponse.gasPrice,
            value: calculateZeroExOrderCost(this.apiResponse),
          }
        );
      });
    });

    describe("#exercise", () => {
      let snapshotId;

      beforeEach(async function () {
        const snapShot = await helper.takeSnapshot();
        snapshotId = snapShot["result"];

        // load the contract with collateralAsset
        await this.mockController.buyCollateral(this.oTokenAddress, {
          from: owner,
          value: ether("10"),
        });

        await this.adapter.purchaseWithZeroEx(
          this.optionTerms,
          this.zeroExOrder,
          {
            from: user,
            gasPrice: this.apiResponse.gasPrice,
            value: ether("5"),
          }
        );
      });

      afterEach(async () => {
        await helper.revertToSnapShot(snapshotId);
      });

      it("exercises otokens", async function () {
        const recipientTracker = await balance.tracker(recipient);

        if (new BN(this.exerciseProfit).isZero()) {
          return;
        }
        await time.increaseTo(this.expiry + 1);

        const res = await this.mockAdapter.mockedExercise(
          this.oTokenAddress,
          0,
          this.purchaseAmount,
          recipient,
          { from: user }
        );

        expectEvent(res, "Exercised", {
          caller: user,
          options: this.oTokenAddress,
          optionID: "0",
          amount: this.purchaseAmount,
          exerciseProfit: this.exerciseProfit,
        });

        const otoken = await IERC20.at(this.oTokenAddress);

        assert.equal((await otoken.balanceOf(user)).toString(), "0");
        assert.equal(
          (await otoken.balanceOf(this.adapter.address)).toString(),
          "0"
        );

        if (this.collateralAsset == WETH_ADDRESS) {
          assert.equal(
            (await recipientTracker.delta()).toString(),
            this.exerciseProfit
          );
        } else {
          const collateralToken = await IERC20.at(this.collateralAsset);
          assert.equal(
            (await collateralToken.balanceOf(user)).toString(),
            this.exerciseProfit
          );
        }
      });
    });

    describe("#canExercise", () => {
      let snapshotId;

      beforeEach(async () => {
        const snapShot = await helper.takeSnapshot();
        snapshotId = snapShot["result"];
      });

      afterEach(async () => {
        await helper.revertToSnapShot(snapshotId);
      });

      it("can exercise", async function () {
        await time.increaseTo(this.expiry + 1);

        const res = await this.adapter.canExercise(
          this.oTokenAddress,
          0,
          this.purchaseAmount
        );

        if (this.exerciseProfit.isZero()) {
          assert.isFalse(res);
          return;
        }

        assert.isTrue(res);
      });

      it("cannot exercise before expiry", async function () {
        const res = await this.adapter.canExercise(
          this.oTokenAddress,
          0,
          this.purchaseAmount
        );
        assert.isFalse(res);
      });
    });

    describe("#createShort", () => {
      let snapshotId;

      beforeEach(async function () {
        const snapShot = await helper.takeSnapshot();
        snapshotId = snapShot["result"];

        const depositAmount = ether("10");

        if (this.collateralAsset === WETH_ADDRESS) {
          const wethContract = await IWETH.at(WETH_ADDRESS);
          await wethContract.deposit({ from: owner, value: depositAmount });
          await wethContract.transfer(this.adapter.address, depositAmount, {
            from: owner,
          });
        } else {
          const router = await UniswapRouter.at(UNISWAP_ROUTER);
          const collateralToken = await IERC20.at(this.collateralAsset);

          const amountsOut = await router.getAmountsOut(depositAmount, [
            WETH_ADDRESS,
            this.collateralAsset,
          ]);

          const amountOutMin = amountsOut[1];

          await router.swapExactETHForTokens(
            amountOutMin,
            [WETH_ADDRESS, this.collateralAsset],
            owner,
            Math.floor(Date.now() / 1000) + 69,
            { from: owner, value: depositAmount }
          );

          await collateralToken.transfer(this.adapter.address, amountOutMin, {
            from: owner,
          });
        }
      });

      afterEach(async () => {
        await helper.revertToSnapShot(snapshotId);
      });

      it("reverts when no matched oToken", async function () {
        const optionTerms = [
          "0x0000000000000000000000000000000000000069",
          "0x0000000000000000000000000000000000000069",
          "0x0000000000000000000000000000000000000069",
          "1614326400",
          ether("800"),
          CALL_OPTION_TYPE,
        ];

        await expectRevert(
          this.adapter.createShort(optionTerms, this.shortAmount),
          "Invalid oToken"
        );
      });

      it("reverts when depositing too little collateral for ETH", async function () {
        if (this.collateralAsset === WETH_ADDRESS) {
          await expectRevert(
            this.adapter.createShort(this.optionTerms, 1),
            "Must deposit more than 10**8 collateral"
          );
        }
      });

      it("creates a short position", async function () {
        const collateral = await IERC20.at(this.collateralAsset);
        const initialPoolCollateralBalance = await collateral.balanceOf(
          MARGIN_POOL
        );

        await this.adapter.createShort(this.optionTerms, this.shortAmount);

        let oTokenMintedAmount;

        if (this.optionType === CALL_OPTION_TYPE) {
          oTokenMintedAmount = this.shortAmount.div(
            new BN("10").pow(new BN("10"))
          );
        } else {
          oTokenMintedAmount = wdiv(this.shortAmount, this.strikePrice)
            .mul(new BN("10").pow(new BN("8")))
            .div(new BN("10").pow(new BN("6")));
        }

        const vaultID = await this.gammaController.getAccountVaultCounter(
          this.adapter.address
        );
        assert.equal(vaultID, "1");

        assert.equal(
          (await this.oToken.balanceOf(this.adapter.address)).toString(),
          oTokenMintedAmount
        );

        const endPoolCollateralBalance = await collateral.balanceOf(
          MARGIN_POOL
        );
        assert.equal(
          endPoolCollateralBalance.sub(initialPoolCollateralBalance).toString(),
          this.shortAmount
        );
      });
    });
  });
}

function calculateZeroExOrderCost(apiResponse) {
  let decimals;

  if (apiResponse.sellTokenAddress === USDC_ADDRESS.toLowerCase()) {
    decimals = 10 ** 6;
  } else if (apiResponse.sellTokenAddress === WETH_ADDRESS.toLowerCase()) {
    return new BN(apiResponse.sellAmount);
  } else {
    decimals = 10 ** 18;
  }

  const scaledSellAmount = parseInt(apiResponse.sellAmount) / decimals;
  const totalETH =
    scaledSellAmount / parseFloat(apiResponse.sellTokenToEthRate);

  return ether(totalETH.toPrecision(6)).add(new BN(apiResponse.value));
}
