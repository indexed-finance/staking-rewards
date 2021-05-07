import { expect, assert } from "chai"
import { ethers, waffle } from "hardhat"
import { advanceBlockTo, advanceBlock, prepare, /* deploy, */ getBigNumber, ADDRESS_ZERO } from "./utilities"
import { Fixture } from 'ethereum-waffle';

import {
  ERC20Mock,
  MultiTokenStaking,
  RewarderMock,
  RewarderBrokenMock,
  RewardsScheduleMock
} from '../types';
import { constants } from "ethers";

interface StakingFixture {
  rewardsToken: ERC20Mock;
  rewards: MultiTokenStaking;
  brokenRewarder: RewarderBrokenMock;
  rewarder: RewarderMock;
  rewardsSchedule: RewardsScheduleMock;
  lp: ERC20Mock;
  dummy: ERC20Mock;
  rlp: ERC20Mock;
  r: ERC20Mock;
}

const deploy = async (name: string, ...args: any[]) => {
  const factory = await ethers.getContractFactory(name)
  return factory.deploy(...args);
}

const stakingFixture: Fixture<StakingFixture> = async (): Promise<StakingFixture> => {
  const [alice, bob, carol] = waffle.provider.getWallets()
  const rewardsToken = await deploy('ERC20Mock', "Rewards Token", "REWARD", 0)
  const lp = await deploy('ERC20Mock', "LP Token", "LPT", getBigNumber(10))
  const dummy = await deploy('ERC20Mock', "Dummy", "DummyT", getBigNumber(10))
  const rlp = await deploy('ERC20Mock', "LP", "rLPT", getBigNumber(10))
  const r = await deploy('ERC20Mock', "Reward", "RewardT", getBigNumber(100000))
  const rewarder = await deploy('RewarderMock', getBigNumber(1), r.address)
  const brokenRewarder = await deploy('RewarderBrokenMock', )

  const rewardsSchedule = await deploy('RewardsScheduleMock', 10, 110)

  const rewards = await deploy('MultiTokenStaking', rewardsToken.address, rewardsSchedule.address)

  await rewardsToken.mint(alice.address, getBigNumber(10000))
  await rewardsToken.approve(rewards.address, getBigNumber(15000))
  await rewards.addRewards(getBigNumber(10000))
  await dummy.approve(rewards.address, getBigNumber(10))
  await rlp.mint(bob.address, getBigNumber(1))
  await advanceBlockTo(10)
  return {
    rewardsToken,
    rewards,
    brokenRewarder,
    rewarder,
    rewardsSchedule,
    lp,
    dummy,
    rlp,
    r
  } as StakingFixture;
}

const createFixtureLoader = waffle.createFixtureLoader

describe("MultiTokenStaking", function () {
  const [alice, bob, carol] = waffle.provider.getWallets()
  let rewardsToken: ERC20Mock;
  let rewards: MultiTokenStaking;
  let brokenRewarder: RewarderBrokenMock;
  let rewarder: RewarderMock;
  let rewardsSchedule: RewardsScheduleMock;
  let lp: ERC20Mock;
  let dummy: ERC20Mock;
  let rlp: ERC20Mock;
  let r: ERC20Mock;

  let loadFixture: ReturnType<typeof createFixtureLoader>

  before(() => {
    loadFixture = createFixtureLoader()
  })

  beforeEach(async function () {
    ({
      rewardsToken,
      rewards,
      brokenRewarder,
      rewarder,
      rewardsSchedule,
      lp,
      dummy,
      rlp,
      r
    } = await loadFixture(stakingFixture));
  })

  describe("SetPointsAllocator", function () {
    it("Should revert if not owner", async function () {
      await expect(rewards.connect(bob).setPointsAllocator(ADDRESS_ZERO)).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it("Should set points allocator", async function () {
      await rewards.setPointsAllocator(bob.address)
      expect(await rewards.pointsAllocator()).to.eq(bob.address)
    })
  })

  describe('AddRewards', function () {
    it('Should revert if not called by owner', async function () {
      await expect(rewards.connect(bob).addRewards(1)).to.be.revertedWith("Ownable: caller is not the owner")
    })

    it('Should emit RewardsAdded', async function () {
      await rewardsToken.mint(alice.address, getBigNumber(20))
      await expect(rewards.addRewards(getBigNumber(20)))
        .to.emit(rewards, 'RewardsAdded')
        .withArgs(getBigNumber(20));
    })

    it('Should transfer `amount` from caller to contract', async function () {
      await rewardsToken.mint(alice.address, getBigNumber(20))
      await expect(rewards.addRewards(getBigNumber(20)))
        .to.emit(rewardsToken, 'Transfer')
        .withArgs(alice.address, rewards.address, getBigNumber(20));
    })

    it('Should increase totalRewardsReceived', async function () {
      await rewardsToken.mint(alice.address, getBigNumber(20))
      await rewards.addRewards(getBigNumber(20))
      expect(await rewards.totalRewardsReceived()).to.eq(getBigNumber(10020))
    })
  })

  describe('SetEarlyEndBlock', function () {
    it('Should revert if not called by owner', async function () {
      await expect(
        rewards.connect(bob).setEarlyEndBlock(120)
      ).to.be.revertedWith('Ownable: caller is not the owner')
    })

    it('Should withdraw remainder of rewards that will not be distributed before early end block', async function () {
      await expect(rewards.setEarlyEndBlock(20))
        .to.emit(rewardsToken, "Transfer")
        .withArgs(rewards.address, alice.address, getBigNumber(9000))
    })
  })

  describe("PoolLength", function () {
    it("PoolLength should execute", async function () {
      await rewards.add(10, rlp.address, rewarder.address)
      expect(await rewards.poolLength()).to.eq(1)
    })
  })

  describe("Add", function () {
    it("Should add pool with reward token multiplier", async function () {
      const txProm = rewards.add(10, rlp.address, rewarder.address)
      await expect(txProm)
        .to.emit(rewards, "LogPoolAddition")
        .withArgs(0, 10, rlp.address, rewarder.address)
      const res = await (await txProm).wait();
      const poolInfo = await rewards.poolInfo(0)
      expect(poolInfo.accRewardsPerShare).to.eq(0)
      expect(poolInfo.lastRewardBlock).to.eq(res.blockNumber)
      expect(poolInfo.allocPoint).to.eq(10)
      expect(await rewards.rewarder(0)).to.eq(rewarder.address)
    })

    it("Should revert if not owner or points allocator", async function () {
      await expect(rewards.connect(bob).add(10, rlp.address, rewarder.address)).to.be.revertedWith(
        "MultiTokenStaking: not authorized to allocate points"
      )
    })

    it("Should revert if pool exists for token", async function () {
      await rewards.add(10, rlp.address, rewarder.address)
      await expect(rewards.add(10, rlp.address, rewarder.address)).to.be.revertedWith(
        "MultiTokenStaking: Staking pool already exists"
      )
    })

    it("Should be callable by points allocator", async function () {
      await rewards.setPointsAllocator(bob.address)
      await expect(rewards.connect(bob).add(10, rlp.address, rewarder.address))
        .to.emit(rewards, "LogPoolAddition")
        .withArgs(0, 10, rlp.address, rewarder.address)
    })
  })

  describe("Set", function () {
    it("Should emit event LogSetPool", async function () {
      await rewards.add(10, rlp.address, rewarder.address)
      await expect(rewards.set(0, 10, dummy.address, false))
        .to.emit(rewards, "LogSetPool")
        .withArgs(0, 10, rewarder.address, false)
      await expect(rewards.set(0, 10, dummy.address, true))
        .to.emit(rewards, "LogSetPool")
        .withArgs(0, 10, dummy.address, true)
    })

    it("Should revert if invalid pool", async function () {
      let err
      try {
        await rewards.set(0, 10, rewarder.address, false)
      } catch (e) {
        err = e.message
      }
      expect(err).to.eq("VM Exception while processing transaction: invalid opcode")
    })

    it("Should revert if not owner or points allocator", async function () {
      await expect(rewards.connect(bob).set(0, 10, dummy.address, true)).to.be.revertedWith(
        "MultiTokenStaking: not authorized to allocate points"
      )
    })

    it("Should be callable by points allocator", async function () {
      await rewards.add(10, rlp.address, rewarder.address)
      await rewards.setPointsAllocator(bob.address)
      await expect(rewards.connect(bob).set(0, 10, dummy.address, false))
        .to.emit(rewards, "LogSetPool")
        .withArgs(0, 10, rewarder.address, false)
    })
  })

  describe("PendingRewards", function () {
    it("Should equal ExpectedRewards", async function () {
      await rewards.add(10, rlp.address, rewarder.address)
      await rlp.approve(rewards.address, getBigNumber(10))
      let log = await rewards.deposit(0, getBigNumber(1), alice.address)
      await advanceBlock()
      let log2 = await rewards.updatePool(0)
      await advanceBlock()
      let expectedRewards = getBigNumber(100).mul(log2.blockNumber + 1 - log.blockNumber)
      let pendingRewards = await rewards.pendingRewards(0, alice.address)
      expect(pendingRewards).to.be.equal(expectedRewards)
    })

    it("When block is lastRewardBlock", async function () {
      await rewards.add(10, rlp.address, rewarder.address)
      await rlp.approve(rewards.address, getBigNumber(10))
      let log = await rewards.deposit(0, getBigNumber(1), alice.address)
      await advanceBlockTo(3)
      let log2 = await rewards.updatePool(0)
      let expectedRewards = getBigNumber(100).mul(log2.blockNumber - log.blockNumber)
      let pendingRewards = await rewards.pendingRewards(0, alice.address)
      expect(pendingRewards).to.be.equal(expectedRewards)
    })
  })

  describe("MassUpdatePools", function () {
    it("Should call updatePool", async function () {
      await rewards.add(10, rlp.address, rewarder.address)
      await advanceBlockTo(1)
      await rewards.massUpdatePools([0])
    })

    it("Updating invalid pools should fail", async function () {
      let err
      try {
        await rewards.massUpdatePools([0, 10000, 100000])
      } catch (e) {
        err = e
      }

      assert.equal(err.toString(), "Error: VM Exception while processing transaction: invalid opcode")
    })
  })

  describe("UpdatePool", function () {
    it("Should emit event LogUpdatePool", async function () {
      await rewards.add(10, rlp.address, rewarder.address)
      await advanceBlockTo(1)
      await expect(rewards.updatePool(0))
        .to.emit(rewards, "LogUpdatePool")
        .withArgs(
          0,
          (await rewards.poolInfo(0)).lastRewardBlock,
          await rlp.balanceOf(rewards.address),
          (await rewards.poolInfo(0)).accRewardsPerShare
        )
    })

    it("Should take else path", async function () {
      await rewards.add(10, rlp.address, rewarder.address)
      await advanceBlockTo(1)
      await rewards.batch(
        [rewards.interface.encodeFunctionData("updatePool", [0]), rewards.interface.encodeFunctionData("updatePool", [0])],
        true
      )
    })
  })

  describe("Deposit", function () {
    it("Depositing 0 amount", async function () {
      await rewards.add(10, rlp.address, rewarder.address)
      await rlp.approve(rewards.address, getBigNumber(10))
      await expect(rewards.deposit(0, getBigNumber(0), alice.address))
        .to.emit(rewards, "Deposit")
        .withArgs(alice.address, 0, 0, alice.address)
    })

    it("Depositing into non-existent pool should fail", async function () {
      let err
      try {
        await rewards.deposit(1001, getBigNumber(0), alice.address)
      } catch (e) {
        err = e
      }

      assert.equal(err.toString(), "Error: VM Exception while processing transaction: invalid opcode")
    })
  })

  describe("Withdraw", function () {
    it("Withdraw 0 amount", async function () {
      await rewards.add(10, rlp.address, rewarder.address)
      await expect(rewards.withdraw(0, getBigNumber(0), alice.address))
        .to.emit(rewards, "Withdraw")
        .withArgs(alice.address, 0, 0, alice.address)
    })
  })

  describe("Harvest", function () {
    it("Should give back the correct amount of base rewards and external reward", async function () {
      await r.transfer(rewarder.address, getBigNumber(100000))
      await rewards.add(10, rlp.address, rewarder.address)
      await rlp.approve(rewards.address, getBigNumber(10))
      expect(await rewards.lpToken(0)).to.be.equal(rlp.address)
      let log = await rewards.deposit(0, getBigNumber(1), alice.address)
      await advanceBlockTo(20)
      let log2 = await rewards.withdraw(0, getBigNumber(1), alice.address)
      let expectedRewards = getBigNumber(100).mul(log2.blockNumber - log.blockNumber)
      expect((await rewards.userInfo(0, alice.address)).rewardDebt).to.be.equal("-" + expectedRewards)
      await rewards.harvest(0, alice.address)
      expect(await rewardsToken.balanceOf(alice.address))
        .to.be.equal(await r.balanceOf(alice.address))
        .to.be.equal(expectedRewards)
    })

    it("Harvest with empty user balance", async function () {
      await rewards.add(10, rlp.address, rewarder.address)
      await rewards.harvest(0, alice.address)
    })

    it("Harvest for pool without external rewards", async function () {
      await rewards.add(10, rlp.address, ADDRESS_ZERO)
      await rlp.approve(rewards.address, getBigNumber(10))
      expect(await rewards.lpToken(0)).to.be.equal(rlp.address)
      let log = await rewards.deposit(0, getBigNumber(1), alice.address)
      await advanceBlock()
      let log2 = await rewards.withdraw(0, getBigNumber(1), alice.address)
      let expectedRewards = getBigNumber(100).mul(log2.blockNumber - log.blockNumber)
      expect((await rewards.userInfo(0, alice.address)).rewardDebt).to.be.equal("-" + expectedRewards)
      await rewards.harvest(0, alice.address)
      expect(await rewardsToken.balanceOf(alice.address)).to.be.equal(expectedRewards)
    })
  })

  describe('WithdrawAndHarvest', function () {
    it("Harvest and withdraw with external reward", async function () {
      await r.transfer(rewarder.address, getBigNumber(100000))
      await rewards.add(10, rlp.address, rewarder.address)
      await rlp.approve(rewards.address, getBigNumber(10))
      expect(await rewards.lpToken(0)).to.be.equal(rlp.address)
      let log = await rewards.deposit(0, getBigNumber(1), alice.address)
      await advanceBlockTo(20)
      let log2 = await rewards.withdrawAndHarvest(0, getBigNumber(1), alice.address)
      let expectedRewards = getBigNumber(100).mul(log2.blockNumber - log.blockNumber)
      expect((await rewards.userInfo(0, alice.address)).rewardDebt).to.be.equal(0)
      expect(await rewardsToken.balanceOf(alice.address))
        .to.be.equal(await r.balanceOf(alice.address))
        .to.be.equal(expectedRewards)
      expect(await rlp.balanceOf(alice.address)).to.eq(getBigNumber(10))
    })

    it('Harvest and withdraw with no external reward', async function () {
      await rewards.add(10, rlp.address, constants.AddressZero)
      await rlp.approve(rewards.address, getBigNumber(10))
      expect(await rewards.lpToken(0)).to.be.equal(rlp.address)
      let log = await rewards.deposit(0, getBigNumber(1), alice.address)
      await advanceBlockTo(20)
      let log2 = await rewards.withdrawAndHarvest(0, getBigNumber(1), alice.address)
      let expectedRewards = getBigNumber(100).mul(log2.blockNumber - log.blockNumber)
      expect((await rewards.userInfo(0, alice.address)).rewardDebt).to.be.equal(0)
      expect(await rewardsToken.balanceOf(alice.address))
        .to.be.equal(expectedRewards)
      expect(await rlp.balanceOf(alice.address)).to.eq(getBigNumber(10))
    })
  })

  describe("EmergencyWithdraw", function () {
    it("Should emit event EmergencyWithdraw", async function () {
      await r.transfer(rewarder.address, getBigNumber(100000))
      await rewards.add(10, rlp.address, rewarder.address)
      await rlp.approve(rewards.address, getBigNumber(10))
      await rewards.deposit(0, getBigNumber(1), bob.address)
      //await rewards.emergencyWithdraw(0, alice.address)
      await expect(rewards.connect(bob).emergencyWithdraw(0, bob.address))
        .to.emit(rewards, "EmergencyWithdraw")
        .withArgs(bob.address, 0, getBigNumber(1), bob.address)
    })
  })
})
