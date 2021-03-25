import { expect, assert } from "chai"
import { advanceBlockTo, advanceBlock, prepare, deploy, getBigNumber, ADDRESS_ZERO } from "./utilities"

describe("MultiTokenStaking", function () {
  before(async function () {
    await prepare(this, ["ERC20Mock", "MultiTokenStaking", "RewarderMock", "RewarderBrokenMock", "RewardsScheduleMock"])
    await deploy(this, [["brokenRewarder", this.RewarderBrokenMock]])
  })

  beforeEach(async function () {
    await deploy(this, [
      ["rewardsToken", this.ERC20Mock, ["Rewards Token", "REWARD", 0]],
      ["rewardsSchedule", this.RewardsScheduleMock],
    ])

    await deploy(this, [
      ["lp", this.ERC20Mock, ["LP Token", "LPT", getBigNumber(10)]],
      ["dummy", this.ERC20Mock, ["Dummy", "DummyT", getBigNumber(10)]],
      ["rewards", this.MultiTokenStaking, [this.rewardsToken.address, this.rewardsSchedule.address]],
    ])
    await this.rewardsToken.mint(this.rewards.address, getBigNumber(1000))

    await deploy(this, [
      ["rlp", this.ERC20Mock, ["LP", "rLPT", getBigNumber(10)]],
      ["r", this.ERC20Mock, ["Reward", "RewardT", getBigNumber(100000)]],
    ])
    await deploy(this, [["rewarder", this.RewarderMock, [getBigNumber(1), this.r.address]]])
    await this.dummy.approve(this.rewards.address, getBigNumber(10))
    await this.rlp.transfer(this.bob.address, getBigNumber(1))
  })

  describe("SetPointsAllocator", function () {
    it("Should revert if not owner", async function () {
      await expect(this.rewards.connect(this.bob).setPointsAllocator(ADDRESS_ZERO)).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("Should set points allocator", async function () {
      await this.rewards.setPointsAllocator(this.bob.address)
      expect(await this.rewards.pointsAllocator()).to.eq(this.bob.address)
    })
  })

  describe("PoolLength", function () {
    it("PoolLength should execute", async function () {
      await this.rewards.add(10, this.rlp.address, this.rewarder.address)
      expect(await this.rewards.poolLength()).to.eq(1)
    })
  })

  describe("Add", function () {
    it("Should add pool with reward token multiplier", async function () {
      const txProm = this.rewards.add(10, this.rlp.address, this.rewarder.address)
      await expect(txProm)
        .to.emit(this.rewards, "LogPoolAddition")
        .withArgs(0, 10, this.rlp.address, this.rewarder.address)
      const res = await (await txProm).wait();
      const poolInfo = await this.rewards.poolInfo(0)
      expect(poolInfo.accRewardsPerShare).to.eq(0)
      expect(poolInfo.lastRewardBlock).to.eq(res.blockNumber)
      expect(poolInfo.allocPoint).to.eq(10)
      expect(await this.rewards.rewarder(0)).to.eq(this.rewarder.address)
    })

    it("Should revert if not owner or points allocator", async function () {
      await expect(this.rewards.connect(this.bob).add(10, this.rlp.address, this.rewarder.address)).to.be.revertedWith(
        "MultiTokenStaking: not authorized to allocate points"
      )
    })

    it("Should be callable by points allocator", async function () {
      await this.rewards.setPointsAllocator(this.bob.address)
      await expect(this.rewards.connect(this.bob).add(10, this.rlp.address, this.rewarder.address))
        .to.emit(this.rewards, "LogPoolAddition")
        .withArgs(0, 10, this.rlp.address, this.rewarder.address)
    })
  })

  describe("Set", function () {
    it("Should emit event LogSetPool", async function () {
      await this.rewards.add(10, this.rlp.address, this.rewarder.address)
      await expect(this.rewards.set(0, 10, this.dummy.address, false))
        .to.emit(this.rewards, "LogSetPool")
        .withArgs(0, 10, this.rewarder.address, false)
      await expect(this.rewards.set(0, 10, this.dummy.address, true))
        .to.emit(this.rewards, "LogSetPool")
        .withArgs(0, 10, this.dummy.address, true)
    })

    it("Should revert if invalid pool", async function () {
      let err
      try {
        await this.rewards.set(0, 10, this.rewarder.address, false)
      } catch (e) {
        err = e.message
      }
      expect(err).to.eq("VM Exception while processing transaction: invalid opcode")
    })

    it("Should revert if not owner or points allocator", async function () {
      await expect(this.rewards.connect(this.bob).set(0, 10, this.dummy.address, true)).to.be.revertedWith(
        "MultiTokenStaking: not authorized to allocate points"
      )
    })

    it("Should be callable by points allocator", async function () {
      await this.rewards.add(10, this.rlp.address, this.rewarder.address)
      await this.rewards.setPointsAllocator(this.bob.address)
      await expect(this.rewards.connect(this.bob).set(0, 10, this.dummy.address, false))
        .to.emit(this.rewards, "LogSetPool")
        .withArgs(0, 10, this.rewarder.address, false)
    })
  })

  describe("PendingRewards", function () {
    it("Should equal ExpectedRewards", async function () {
      await this.rewards.add(10, this.rlp.address, this.rewarder.address)
      await this.rlp.approve(this.rewards.address, getBigNumber(10))
      let log = await this.rewards.deposit(0, getBigNumber(1), this.alice.address)
      await advanceBlock()
      let log2 = await this.rewards.updatePool(0)
      await advanceBlock()
      let expectedRewards = getBigNumber(100).mul(log2.blockNumber + 1 - log.blockNumber)
      let pendingRewards = await this.rewards.pendingRewards(0, this.alice.address)
      expect(pendingRewards).to.be.equal(expectedRewards)
    })

    it("When block is lastRewardBlock", async function () {
      await this.rewards.add(10, this.rlp.address, this.rewarder.address)
      await this.rlp.approve(this.rewards.address, getBigNumber(10))
      let log = await this.rewards.deposit(0, getBigNumber(1), this.alice.address)
      await advanceBlockTo(3)
      let log2 = await this.rewards.updatePool(0)
      let expectedRewards = getBigNumber(100).mul(log2.blockNumber - log.blockNumber)
      let pendingRewards = await this.rewards.pendingRewards(0, this.alice.address)
      expect(pendingRewards).to.be.equal(expectedRewards)
    })
  })

  describe("MassUpdatePools", function () {
    it("Should call updatePool", async function () {
      await this.rewards.add(10, this.rlp.address, this.rewarder.address)
      await advanceBlockTo(1)
      await this.rewards.massUpdatePools([0])
    })

    it("Updating invalid pools should fail", async function () {
      let err
      try {
        await this.rewards.massUpdatePools([0, 10000, 100000])
      } catch (e) {
        err = e
      }

      assert.equal(err.toString(), "Error: VM Exception while processing transaction: invalid opcode")
    })
  })

  describe("UpdatePool", function () {
    it("Should emit event LogUpdatePool", async function () {
      await this.rewards.add(10, this.rlp.address, this.rewarder.address)
      await advanceBlockTo(1)
      await expect(this.rewards.updatePool(0))
        .to.emit(this.rewards, "LogUpdatePool")
        .withArgs(
          0,
          (await this.rewards.poolInfo(0)).lastRewardBlock,
          await this.rlp.balanceOf(this.rewards.address),
          (await this.rewards.poolInfo(0)).accRewardsPerShare
        )
    })

    it("Should take else path", async function () {
      await this.rewards.add(10, this.rlp.address, this.rewarder.address)
      await advanceBlockTo(1)
      await this.rewards.batch(
        [this.rewards.interface.encodeFunctionData("updatePool", [0]), this.rewards.interface.encodeFunctionData("updatePool", [0])],
        true
      )
    })
  })

  describe("Deposit", function () {
    it("Depositing 0 amount", async function () {
      await this.rewards.add(10, this.rlp.address, this.rewarder.address)
      await this.rlp.approve(this.rewards.address, getBigNumber(10))
      await expect(this.rewards.deposit(0, getBigNumber(0), this.alice.address))
        .to.emit(this.rewards, "Deposit")
        .withArgs(this.alice.address, 0, 0, this.alice.address)
    })

    it("Depositing into non-existent pool should fail", async function () {
      let err
      try {
        await this.rewards.deposit(1001, getBigNumber(0), this.alice.address)
      } catch (e) {
        err = e
      }

      assert.equal(err.toString(), "Error: VM Exception while processing transaction: invalid opcode")
    })
  })

  describe("Withdraw", function () {
    it("Withdraw 0 amount", async function () {
      await this.rewards.add(10, this.rlp.address, this.rewarder.address)
      await expect(this.rewards.withdraw(0, getBigNumber(0), this.alice.address))
        .to.emit(this.rewards, "Withdraw")
        .withArgs(this.alice.address, 0, 0, this.alice.address)
    })
  })

  describe("Harvest", function () {
    it("Should give back the correct amount of base rewards and external reward", async function () {
      await this.r.transfer(this.rewarder.address, getBigNumber(100000))
      await this.rewards.add(10, this.rlp.address, this.rewarder.address)
      await this.rlp.approve(this.rewards.address, getBigNumber(10))
      expect(await this.rewards.lpToken(0)).to.be.equal(this.rlp.address)
      let log = await this.rewards.deposit(0, getBigNumber(1), this.alice.address)
      await advanceBlockTo(20)
      let log2 = await this.rewards.withdraw(0, getBigNumber(1), this.alice.address)
      let expectedRewards = getBigNumber(100).mul(log2.blockNumber - log.blockNumber)
      expect((await this.rewards.userInfo(0, this.alice.address)).rewardDebt).to.be.equal("-" + expectedRewards)
      await this.rewards.harvest(0, this.alice.address)
      expect(await this.rewardsToken.balanceOf(this.alice.address))
        .to.be.equal(await this.r.balanceOf(this.alice.address))
        .to.be.equal(expectedRewards)
    })

    it("Harvest with empty user balance", async function () {
      await this.rewards.add(10, this.rlp.address, this.rewarder.address)
      await this.rewards.harvest(0, this.alice.address)
    })

    it("Harvest for pool without external rewards", async function () {
      await this.rewards.add(10, this.rlp.address, ADDRESS_ZERO)
      await this.rlp.approve(this.rewards.address, getBigNumber(10))
      expect(await this.rewards.lpToken(0)).to.be.equal(this.rlp.address)
      let log = await this.rewards.deposit(0, getBigNumber(1), this.alice.address)
      await advanceBlock()
      let log2 = await this.rewards.withdraw(0, getBigNumber(1), this.alice.address)
      let expectedRewards = getBigNumber(100).mul(log2.blockNumber - log.blockNumber)
      expect((await this.rewards.userInfo(0, this.alice.address)).rewardDebt).to.be.equal("-" + expectedRewards)
      await this.rewards.harvest(0, this.alice.address)
      expect(await this.rewardsToken.balanceOf(this.alice.address)).to.be.equal(expectedRewards)
    })
  })

  describe("EmergencyWithdraw", function () {
    it("Should emit event EmergencyWithdraw", async function () {
      await this.r.transfer(this.rewarder.address, getBigNumber(100000))
      await this.rewards.add(10, this.rlp.address, this.rewarder.address)
      await this.rlp.approve(this.rewards.address, getBigNumber(10))
      await this.rewards.deposit(0, getBigNumber(1), this.bob.address)
      //await this.rewards.emergencyWithdraw(0, this.alice.address)
      await expect(this.rewards.connect(this.bob).emergencyWithdraw(0, this.bob.address))
        .to.emit(this.rewards, "EmergencyWithdraw")
        .withArgs(this.bob.address, 0, getBigNumber(1), this.bob.address)
    })
  })
})
