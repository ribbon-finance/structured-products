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
const OpynV1Adapter = contract.fromArtifact("OpynV1Adapter");
const MockDojiFactory = contract.fromArtifact("MockDojiFactory");
const IERC20 = contract.fromArtifact("IERC20");
const IOToken = contract.fromArtifact("IOToken");
const IOptionsExchange = contract.fromArtifact("IOptionsExchange");
const IUniswapFactory = contract.fromArtifact("IUniswapFactory");
const UniswapExchangeInterface = contract.fromArtifact(
  "UniswapExchangeInterface"
);
const helper = require("../helper.js");

const aaveAddressProvider = "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5";
const uniswapRouter = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const [admin, owner, user] = accounts;
const PUT_OPTION_TYPE = 1;
const CALL_OPTION_TYPE = 2;
const ETH_ADDRESS = constants.ZERO_ADDRESS;

describe("OpynV1Adapter", () => {
  let initSnapshotId;

  before(async function () {
    // we assume the user account is the calling instrument
    this.factory = await MockDojiFactory.new({ from: owner });
    await this.factory.initialize(owner, admin, { from: owner });
    await this.factory.setInstrument(user, { from: user });

    this.adapter = await OpynV1Adapter.new(aaveAddressProvider, {
      from: owner,
    });
    await this.adapter.initialize(
      owner,
      this.factory.address,
      aaveAddressProvider,
      uniswapRouter,
      weth,
      { from: owner }
    );
    this.vaults = [
      "0x076C95c6cd2eb823aCC6347FdF5B3dd9b83511E4",
      "0xC5Df4d5ED23F645687A867D8F83a41836FCf8811",
    ];

    // test cases
    this.protocolName = "OPYN_V1";
    this.nonFungible = false;
  });

  after(async () => {
    await helper.revertToSnapShot(initSnapshotId);
  });

  behavesLikeOToken({
    oTokenName: "ETH CALL ITM",
    underlying: ETH_ADDRESS,
    strikeAsset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    expiry: "1608883200",
    oTokenAddress: "0xb759e6731df19abD72e0456184890f87dCb6C518",
    optionType: CALL_OPTION_TYPE,
    strikePrice: ether("500"),
    premium: "226576941400395228",
    purchaseAmount: ether("500"),
    scaledPurchaseAmount: new BN("500000000"),
  });

  describe("#setVaults", () => {
    it("reverts when not owner", async function () {
      await expectRevert(
        this.adapter.setVaults(constants.ZERO_ADDRESS, this.vaults, {
          from: user,
        }),
        "only owner"
      );
    });
  });
});

function behavesLikeOToken(args) {
  let initSnapshotId;
  const gasPrice = web3.utils.toWei("10", "gwei");

  describe(`oToken ${args.oTokenName}`, () => {
    before(async function () {
      const {
        underlying,
        strikeAsset,
        expiry,
        oTokenAddress,
        optionType,
        strikePrice,
        premium,
        purchaseAmount,
        scaledPurchaseAmount,
      } = args;
      this.underlying = underlying;
      this.strikeAsset = strikeAsset;
      this.expiry = expiry;
      this.strikePrice = strikePrice;
      this.premium = premium;
      this.oTokenAddress = oTokenAddress;
      this.optionType = optionType;
      this.purchaseAmount = purchaseAmount;
      this.scaledPurchaseAmount = scaledPurchaseAmount;

      this.oToken = await IERC20.at(this.oTokenAddress);
      await this.adapter.setOTokenWithTerms(
        this.strikePrice,
        this.optionType,
        this.oToken.address,
        { from: owner }
      );

      const oTokenContract = await IOToken.at(this.oTokenAddress);
      const optionsExchange = await IOptionsExchange.at(
        await oTokenContract.optionsExchange()
      );
      const uniswapFactory = await IUniswapFactory.at(
        await optionsExchange.UNISWAP_FACTORY()
      );
      this.uniswapExchange = await UniswapExchangeInterface.at(
        await uniswapFactory.getExchange(this.oTokenAddress)
      );

      const snapShot = await helper.takeSnapshot();
      initSnapshotId = snapShot["result"];
    });

    describe("#lookupOToken", () => {
      it("looks up the oToken with option terms", async function () {
        assert.equal(
          await this.adapter.lookupOToken(
            this.underlying,
            this.strikeAsset,
            this.expiry,
            this.strikePrice,
            this.optionType
          ),
          this.oToken.address
        );
      });
    });

    describe("#premium", () => {
      it("gets the premium for a call option", async function () {
        assert.equal(
          (
            await this.adapter.premium(
              this.underlying,
              this.strikeAsset,
              this.expiry,
              this.strikePrice,
              this.optionType,
              this.purchaseAmount
            )
          ).toString(),
          this.premium
        );
      });
    });

    describe("#purchase", () => {
      let snapshotId;

      beforeEach(async () => {
        const snapShot = await helper.takeSnapshot();
        snapshotId = snapShot["result"];
      });

      afterEach(async () => {
        await helper.revertToSnapShot(snapshotId);
      });

      it("reverts when not enough value passed", async function () {
        await expectRevert(
          this.adapter.purchase(
            this.underlying,
            this.strikeAsset,
            this.expiry,
            this.strikePrice,
            this.optionType,
            this.purchaseAmount,
            { from: user, value: new BN(this.premium).sub(new BN("1")) }
          ),
          "Value does not cover cost."
        );
      });

      it("returns the change if user passes extra value", async function () {
        const userTracker = await balance.tracker(user, "wei");

        const res = await this.adapter.purchase(
          this.underlying,
          this.strikeAsset,
          this.expiry,
          this.strikePrice,
          this.optionType,
          ether("500"),
          {
            from: user,
            gasPrice,
            value: new BN(this.premium).add(new BN("1")),
          }
        );
        const gasUsed = new BN(gasPrice).mul(new BN(res.receipt.gasUsed));

        assert.equal(
          (await userTracker.delta()).toString(),
          new BN(this.premium).add(gasUsed).neg().toString()
        );
      });

      it("purchases the oTokens", async function () {
        const startUserBalance = await this.oToken.balanceOf(user);
        const startExchangeBalance = await this.oToken.balanceOf(
          this.uniswapExchange.address
        );

        const res = await this.adapter.purchase(
          this.underlying,
          this.strikeAsset,
          this.expiry,
          this.strikePrice,
          this.optionType,
          this.purchaseAmount,
          { from: user, value: this.premium }
        );

        expectEvent(res, "Purchased", {
          caller: user,
          underlying: this.underlying,
          strikeAsset: this.strikeAsset,
          expiry: this.expiry.toString(),
          strikePrice: this.purchaseAmount,
          optionType: CALL_OPTION_TYPE.toString(),
          amount: this.scaledPurchaseAmount,
          premium: this.premium,
          optionID: "0",
        });

        assert.equal(await this.oToken.balanceOf(this.adapter.address), "0");
        assert.equal(
          (await this.oToken.balanceOf(user)).toString(),
          startUserBalance.add(this.scaledPurchaseAmount)
        );
        assert.equal(
          (
            await this.oToken.balanceOf(this.uniswapExchange.address)
          ).toString(),
          startExchangeBalance.sub(this.scaledPurchaseAmount)
        );
      });
    });

    // describe("#exercise", () => {
    //   let snapshotId;

    //   beforeEach(async function () {
    //     await this.adapter.purchase(
    //       this.underlying,
    //       this.strikeAsset,
    //       this.expiry,
    //       this.strikePrice,
    //       this.optionType,
    //       ether("500"),
    //       { from: user, value: this.callPremium }
    //     );

    //     await this.adapter.setVaults(this.oToken.address, this.vaults, {
    //       from: owner,
    //     });

    //     const snapShot = await helper.takeSnapshot();
    //     snapshotId = snapShot["result"];
    //   });

    //   afterEach(async () => {
    //     await helper.revertToSnapShot(snapshotId);
    //   });

    //   it("exercises tokens", async function () {
    //     const userTracker = await balance.tracker(user);

    //     await this.oToken.approve(this.adapter.address, "500000000", {
    //       from: user,
    //     });

    //     const res = await this.adapter.exercise(
    //       this.oToken.address,
    //       0,
    //       ether("500"),
    //       {
    //         from: user,
    //       }
    //     );
    //     const gasUsed = new BN(gasPrice).mul(new BN(res.receipt.gasUsed));
    //     const balanceChange = await userTracker.delta();
    //     assert.equal(balanceChange.sub(gasUsed).toString(), "207731545706926439");

    //     // adapter should not hold anything at the end
    //     const strikeERC20 = await IERC20.at(this.strikeAsset);
    //     assert.equal(await balance.current(this.adapter.address), "0");
    //     assert.equal(await this.oToken.balanceOf(this.adapter.address), "0");
    //     assert.equal(await strikeERC20.balanceOf(this.adapter.address), "0");
    //   });
    // });
  });
}
