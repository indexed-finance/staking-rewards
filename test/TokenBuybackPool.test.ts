import { expect, assert } from "chai";
import { ethers } from "hardhat";
import { advanceBlockTo, advanceBlock, prepare, deploy, getBigNumber, ADDRESS_ZERO, advanceTimeAndBlock } from "./utilities"
import uniswapFixture from "./uniswap.fixture";
import { BigNumber } from "@ethersproject/bignumber";

describe("TokenBuybackPool", function () {
  before(async function () {
    await prepare(this, ['ERC20Mock', 'TokenBuybackPool'])
  })

  beforeEach(async function () {
    const {
      uniswapFactory,
      uniswapRouter,
      liquidityManager,
      uniswapOracle,
      deployTokenAndMarket
    } = await uniswapFixture(this, this.alice.address)();

    const { token: tokenA } = await deployTokenAndMarket('tokenA', 'TKA')
    const { token: buybackToken } = await deployTokenAndMarket("buybackToken", "BBT")
    await deploy(this, [
      ['buybackPool', this.TokenBuybackPool, [uniswapRouter.address, uniswapOracle.address, buybackToken.address]]
    ])
    // Set price at 10 TKA <-> 1 eth
    await liquidityManager.addLiquidity(tokenA.address, getBigNumber(10), getBigNumber(1),)
    // Set price at 5 BBT <-> 1 eth
    await liquidityManager.addLiquidity(buybackToken.address, getBigNumber(5), getBigNumber(1))

    await liquidityManager.updatePrices([ buybackToken.address, tokenA.address ])
    
    await advanceTimeAndBlock(3600)
    await liquidityManager.addLiquidity(tokenA.address, getBigNumber(10), getBigNumber(1),)
    await liquidityManager.addLiquidity(buybackToken.address, getBigNumber(5), getBigNumber(1))
    await advanceTimeAndBlock(3600)

    await this.tokenA.mint(this.buybackPool.address, getBigNumber(10, 18))
  })

  describe('withdrawTokens', function() {
    it('Reverts if caller is not owner', async function () {
      await expect(
        this.buybackPool.connect(this.bob).withdrawTokens(ADDRESS_ZERO, ADDRESS_ZERO, 0)
      ).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("Withdraws tokens", async function () {
      await this.buybackPool.withdrawTokens(this.tokenA.address, this.bob.address, getBigNumber(5))
      expect(await this.tokenA.balanceOf(this.bob.address)).to.eq(getBigNumber(5))
    })
  })

  describe('setPremiumPercent', function () {
    it('Reverts if caller is not the owner', async function () {
      await expect(
        this.buybackPool.connect(this.bob).setPremiumPercent(0)
      ).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it('Reverts if premium is 0 or >=20', async function () {
      await expect(
        this.buybackPool.setPremiumPercent(0)
      ).to.be.revertedWith("ERR_PREMIUM")
      await expect(
        this.buybackPool.setPremiumPercent(20)
      ).to.be.revertedWith("ERR_PREMIUM")
    })

    it('Sets premium percent', async function () {
      await this.buybackPool.setPremiumPercent(5)
      expect(await this.buybackPool.premiumPercent()).to.eq(5)
    })
  })

  describe('calcOutGivenIn', function() {
    it('Gives a 2% discount on the value of the input', async function () {
      const amountIn = getBigNumber(1)
      const amountOut = await this.buybackPool.calcOutGivenIn(
        this.tokenA.address,
        amountIn
      )
      const valueIn = this.liquidityManager.computeAverageEthForTokens(this.buybackToken.address, amountIn)
      const valueInWithPremium = valueIn.mul(100).div(98)
      const expectAmountOut = this.liquidityManager.computeAverageTokensForEth(this.tokenA.address, valueInWithPremium)
      expect(amountOut).to.eq(expectAmountOut)
    })

    it('Returns pool balance if it can not afford the normal price', async function () {
      expect(
        await this.buybackPool.calcOutGivenIn(this.tokenA.address, getBigNumber(10))
      ).to.eq(getBigNumber(10))
    })
  })

  describe('calcInGivenOut', function () {
    it('Gives a 2% discount on the value of the input', async function () {
      const amountOut = getBigNumber(1)
      const amountIn = await this.buybackPool.calcInGivenOut(
        this.tokenA.address,
        amountOut
      )
      const valueOut = this.liquidityManager.computeAverageEthForTokens(this.tokenA.address, amountOut)
      const valueOutWithDiscount = valueOut.mul(98).div(100)
      const expectAmountIn = this.liquidityManager.computeAverageTokensForEth(this.buybackToken.address, valueOutWithDiscount)
      expect(amountIn).to.eq(expectAmountIn)
    })

    it('Reverts if pool has insufficient balance for amountOut', async function () {
      await expect(
        this.buybackPool.calcInGivenOut(this.tokenA.address, getBigNumber(11))
      ).to.be.revertedWith("ERR_INSUFFICIENT_BALANCE")
    })
  })

  describe('swapExactTokensForTokens', function () {
    it('Sells an exact amount of tokens to the pool', async function () {
      const amountIn = getBigNumber(1)
      const valueIn = this.liquidityManager.computeAverageEthForTokens(this.buybackToken.address, amountIn)
      const valueInWithPremium = valueIn.mul(100).div(98)
      const expectAmountOut = this.liquidityManager.computeAverageTokensForEth(this.tokenA.address, valueInWithPremium)
  
      await this.buybackToken.approve(this.buybackPool.address, amountIn)
      await this.buybackToken.mint(this.alice.address, amountIn)
      await this.buybackPool.swapExactTokensForTokens(this.tokenA.address, amountIn, expectAmountOut)

      expect(await this.tokenA.balanceOf(this.buybackPool.address)).to.eq(getBigNumber(10).sub(expectAmountOut))
      expect(await this.buybackToken.balanceOf(this.buybackPool.address)).to.eq(amountIn);
      expect(await this.tokenA.balanceOf(this.alice.address)).to.eq(expectAmountOut)
      expect(await this.buybackToken.balanceOf(this.alice.address)).to.eq(0);
    })

    it('Reverts if output is less than minimum', async function () {
      const amountIn = getBigNumber(1)
      const valueIn = this.liquidityManager.computeAverageEthForTokens(this.buybackToken.address, amountIn)
      const valueInWithPremium = valueIn.mul(100).div(98)
      const expectAmountOut = this.liquidityManager.computeAverageTokensForEth(this.tokenA.address, valueInWithPremium)
      await expect(
        this.buybackPool.swapExactTokensForTokens(this.tokenA.address, amountIn, expectAmountOut.add(1))
      ).to.be.revertedWith("ERR_MIN_AMOUNT_OUT")
    })
  })

  describe('swapTokensForExactTokens', function () {
    it('Buys an exact amount of tokens from the pool', async function () {
      const amountOut = getBigNumber(1)
      const valueOut = this.liquidityManager.computeAverageEthForTokens(this.tokenA.address, amountOut)
      const valueOutWithDiscount = valueOut.mul(98).div(100)
      const expectAmountIn = this.liquidityManager.computeAverageTokensForEth(this.buybackToken.address, valueOutWithDiscount)

      await this.buybackToken.approve(this.buybackPool.address, expectAmountIn)
      await this.buybackToken.mint(this.alice.address, expectAmountIn)
      await this.buybackPool.swapTokensForExactTokens(this.tokenA.address, amountOut, expectAmountIn)

      expect(await this.tokenA.balanceOf(this.buybackPool.address)).to.eq(getBigNumber(9))
      expect(await this.buybackToken.balanceOf(this.buybackPool.address)).to.eq(expectAmountIn)
      expect(await this.tokenA.balanceOf(this.alice.address)).to.eq(amountOut)
      expect(await this.buybackToken.balanceOf(this.alice.address)).to.eq(0)
    })

    it('Reverts if amount in is greater than maximum', async function () {
      const amountOut = getBigNumber(1)
      const valueOut = this.liquidityManager.computeAverageEthForTokens(this.tokenA.address, amountOut)
      const valueOutWithDiscount = valueOut.mul(98).div(100)
      const expectAmountIn = this.liquidityManager.computeAverageTokensForEth(this.buybackToken.address, valueOutWithDiscount)
      await expect(
        this.buybackPool.swapTokensForExactTokens(this.tokenA.address, amountOut, expectAmountIn.sub(1))
      ).to.be.revertedWith("ERR_MAX_AMOUNT_IN")
    })
  })
});