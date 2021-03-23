import { expect, assert } from "chai";
import { advanceBlockTo, advanceBlock, prepare, deploy, getBigNumber, ADDRESS_ZERO } from "./utilities"

const ONE = getBigNumber(1)

describe("RedeemableShares", function () {
  before(async function () {
    await prepare(this, ['ERC20Mock', 'RedeemableShares'])
  })

  beforeEach(async function () {
    await deploy(this, [["underlying", this.ERC20Mock, ["Underlying Token", "ULT", 0]]])
    await deploy(this, [["shares", this.RedeemableShares, ["Redeemable Token", "RDT", this.underlying.address]]])
  })

  it('Sets correct underlying address', async function () {
    expect(await this.shares.underlyingToken()).to.eq(this.underlying.address)
  })

  it('UnderlyingBalance', async function () {
    expect(await this.shares.underlyingBalance()).to.eq(0)
    await this.underlying.mint(this.shares.address, getBigNumber(10))
    expect(await this.shares.underlyingBalance()).to.eq(getBigNumber(10))
  })

  it('ToUnderlying', async function () {
    await this.underlying.mint(this.alice.address, ONE)
    expect(await this.shares.toUnderlying(ONE)).to.eq(0)
    await this.underlying.mint(this.shares.address, getBigNumber(9))
    expect(await this.shares.toUnderlying(ONE)).to.eq(0)
    await this.underlying.approve(this.shares.address, ONE)
    await this.shares.deposit(ONE)
    expect(await this.shares.toUnderlying(ONE)).to.eq(getBigNumber(10))
  })

  it('FromUnderlying', async function () {
    expect(await this.shares.fromUnderlying(ONE)).to.eq(ONE)
    await this.underlying.mint(this.alice.address, getBigNumber(2))
    await this.underlying.approve(this.shares.address, ONE)
    await this.shares.deposit(ONE)
    expect(await this.shares.fromUnderlying(ONE)).to.eq(ONE)
    await this.underlying.mint(this.shares.address, getBigNumber(9))
    expect(await this.shares.fromUnderlying(ONE)).to.eq(ONE.div(10))
  })

  it('Deposit', async function () {
    await this.shares.deposit(0)
    expect(await this.shares.balanceOf(this.alice.address)).to.eq(0)

    await expect(this.shares.deposit(ONE)).to.be.revertedWith("ERC20: transfer amount exceeds balance")

    await this.underlying.mint(this.alice.address, getBigNumber(2))
    await this.underlying.approve(this.shares.address, ONE)
    await this.shares.deposit(ONE)
    expect(await this.shares.balanceOf(this.alice.address)).to.eq(ONE)

    await this.underlying.mint(this.shares.address, ONE)
    await this.underlying.approve(this.shares.address, ONE)
    await this.shares.deposit(ONE)
    expect(await this.shares.balanceOf(this.alice.address)).to.eq(ONE.mul(3).div(2))
  })

  it('Withdraw', async function () {
    await expect(this.shares.withdraw(1)).to.be.revertedWith("ERC20: burn amount exceeds balance")

    await this.underlying.mint(this.alice.address, getBigNumber(2))
    await this.underlying.approve(this.shares.address, getBigNumber(2))
    await this.shares.deposit(getBigNumber(2))
    await this.shares.withdraw(ONE)
    expect(await this.shares.balanceOf(this.alice.address)).to.eq(ONE)
    expect(await this.underlying.balanceOf(this.alice.address)).to.eq(ONE)

    await this.underlying.mint(this.shares.address, ONE)
    await this.shares.withdraw(ONE)
    expect(await this.shares.balanceOf(this.alice.address)).to.eq(0)
    expect(await this.underlying.balanceOf(this.alice.address)).to.eq(getBigNumber(3))
  })

  it('WithdrawTo', async function () {
    await expect(this.shares.withdrawTo(this.bob.address, 1)).to.be.revertedWith("ERC20: burn amount exceeds balance")

    await this.underlying.mint(this.alice.address, getBigNumber(2))
    await this.underlying.approve(this.shares.address, getBigNumber(2))
    await this.shares.deposit(getBigNumber(2))
    await this.shares.withdrawTo(this.bob.address, ONE)
    expect(await this.shares.balanceOf(this.alice.address)).to.eq(ONE)
    expect(await this.underlying.balanceOf(this.bob.address)).to.eq(ONE)

    await this.underlying.mint(this.shares.address, ONE)
    await this.shares.withdrawTo(this.bob.address, ONE)
    expect(await this.shares.balanceOf(this.alice.address)).to.eq(0)
    expect(await this.underlying.balanceOf(this.bob.address)).to.eq(getBigNumber(3))
  })

  describe('WithdrawFrom', async function () {
    it('Reverts if insufficient allowance', async function () {
      await expect(this.shares.withdrawFrom(this.bob.address, this.alice.address, 1)).to.be.revertedWith("RedeemableShares: withdrawal amount exceeds allowance")
    })

    it('Reverts if insufficient balance', async function () {
      await this.shares.connect(this.bob).approve(this.alice.address, 1)
      await expect(this.shares.withdrawFrom(this.bob.address, this.alice.address, 1)).to.be.revertedWith("ERC20: burn amount exceeds balance")
    })

    it('Withdraws proportional share of underlying', async function () {
      await this.underlying.mint(this.alice.address, getBigNumber(2))
      await this.underlying.approve(this.shares.address, getBigNumber(2))
      await this.shares.deposit(getBigNumber(2))
      await this.shares.approve(this.bob.address, getBigNumber(2))
      await this.shares.connect(this.bob).withdrawFrom(this.alice.address, this.bob.address, ONE)
      expect(await this.shares.balanceOf(this.alice.address)).to.eq(ONE)
      expect(await this.underlying.balanceOf(this.bob.address)).to.eq(ONE)
      expect(await this.shares.allowance(this.alice.address, this.bob.address)).to.eq(ONE)
  
      await this.underlying.mint(this.shares.address, ONE)
      await this.shares.connect(this.bob).withdrawFrom(this.alice.address, this.bob.address, ONE)
      expect(await this.shares.balanceOf(this.alice.address)).to.eq(0)
      expect(await this.underlying.balanceOf(this.bob.address)).to.eq(getBigNumber(3))
      expect(await this.shares.allowance(this.alice.address, this.bob.address)).to.eq(0)
    })
  })
})