import { expect } from "chai";
import { ethers, waffle } from "hardhat";
import { BigNumber } from 'ethers';
import { NDXRewardsSchedule } from "../types/NDXRewardsSchedule";
import { getBigNumber } from "./utilities";

const calculateExactRewards = (from: number, to: number) => {
  const end = to - 100;
  let sum = 0;
  for (let b = from - 100; b < end; b++) {
    sum += (5336757788e8 - 91980108790 * b);
  }
  return BigNumber.from(`0x${sum.toString(16)}`);
}

const calculateRewardsForRange = (from: number, to: number, endBlock = 4778281) => {
  if (to > endBlock) to = endBlock;
  const x = BigNumber.from(from - 100);
  const y = BigNumber.from(to - 100);
  const c = BigNumber.from('45990054395');
  const m = BigNumber.from('5336757788').mul(
    BigNumber.from(10).pow(8)
  );
  return c.mul(x.pow(2))
    .add(m.mul(y.sub(x)))
    .sub(c.mul(y.pow(2)));
}

describe("NDXRewardsSchedule", function () {
  const [, notOwner] = waffle.provider.getWallets()
  let schedule: NDXRewardsSchedule;

  function setupTests() {
    before(async function () {
      const RewardsSchedule = await ethers.getContractFactory('NDXRewardsSchedule');
      schedule = (await RewardsSchedule.deploy(100)) as NDXRewardsSchedule;
    })
  }

  describe('Settings', () => {
    setupTests();

    it('startBlock', async () => {
      expect(await schedule.startBlock()).to.eq(100)
    })

    it('endBlock', async () => {
      expect(await schedule.endBlock()).to.eq(4778281)
    })
  })

  describe('getRewardsForBlockRange', () => {
    describe('Total Rewards', () => {
      it('Should give the expected total for the full block range using the antiderivative', async () => {
        expect(await schedule.getRewardsForBlockRange(100, 4778281)).to.eq(
          calculateRewardsForRange(100, 4778281)
        );
      })
  
      it('Should be within 0.25 of the exact sum', async () => {
        const rewards = await schedule.getRewardsForBlockRange(100, 4778281)
        const exactRewards = calculateExactRewards(100, 4778281)
        expect(exactRewards.sub(rewards).abs()).to.be.lte(getBigNumber(25, 16))
      })
    })

    describe('Precision', () => {
      it('Should give same rewards for full range split into chunks of 20k', async () => {
        let proms = [];
        for (let i = 100; i < 4778281; i += 20000) {
          proms.push(schedule.getRewardsForBlockRange(i, i + 20000));
        }
        const sum = (await Promise.all(proms)).reduce((prev, each) => prev.add(each), BigNumber.from(0));
        expect(await schedule.getRewardsForBlockRange(100, 4778281)).to.eq(sum)
      })

      it('Should give same rewards for 100:115 + 115:120 as 110:120', async () => {
        expect(
          (await schedule.getRewardsForBlockRange(110, 115)).add(
            await schedule.getRewardsForBlockRange(115, 120)
          )
        ).to.eq(
          await schedule.getRewardsForBlockRange(110, 120)
        )
      })
    })

    describe('Boundaries', () => {
      it('Should return 0 if to<=startBlock', async () => {
        expect(await schedule.getRewardsForBlockRange(0, 100)).to.eq(0)
      })

      it('Should return 0 if from>=endBlock', async () => {
        expect(await schedule.getRewardsForBlockRange(4778281, 4778283)).to.eq(0)
      })

      it('Should use from=startBlock if from<startBlock', async () => {
        expect(await schedule.getRewardsForBlockRange(99, 105)).to.eq(
          calculateRewardsForRange(100, 105)
        )
      })

      it('Should use to=endBlock if to>endBlock', async () => {
        expect(await schedule.getRewardsForBlockRange(100, 4778283)).to.eq(
          calculateRewardsForRange(100, 4778281)
        )
      })

      it('Should revert if to<from', async () => {
        await expect(
          schedule.getRewardsForBlockRange(110, 109)
        ).to.be.revertedWith('Bad block range')
      })
    })
  })

  describe('setEarlyEndBlock', () => {
    describe('Restrictions', () => {
      setupTests();

      it('Should revert if not called by owner', async () => {
        await expect(
          schedule.connect(notOwner).setEarlyEndBlock(1000)
        ).to.be.revertedWith('Ownable: caller is not the owner')
      })

      it('Should revert if block number <= current', async () => {
        const blockNumber = await ethers.provider.getBlockNumber();
        await expect(
          schedule.setEarlyEndBlock(blockNumber)
        ).to.be.revertedWith('End block too early')
        await expect(
          schedule.setEarlyEndBlock(blockNumber + 1)
        ).to.be.revertedWith('End block too early')
      })
  
      it('Should revert if block number is <= startBlock', async () => {
        await expect(
          schedule.setEarlyEndBlock(99)
        ).to.be.revertedWith('End block too early')
        await expect(
          schedule.setEarlyEndBlock(100)
        ).to.be.revertedWith('End block too early')
      })
  
      it('Should revert if block number is >= endBlock', async () => {
        await expect(
          schedule.setEarlyEndBlock(4778281)
        ).to.be.revertedWith('End block too late')
        await expect(
          schedule.setEarlyEndBlock(4778282)
        ).to.be.revertedWith('End block too late')
      })
  
      it('Should revert if early end block has already been set', async () => {
        await schedule.setEarlyEndBlock(1000)
        await expect(
          schedule.setEarlyEndBlock(1000)
        ).to.be.revertedWith('Early end block already set')
      })
    })

    describe('Early termination', () => {
      setupTests();

      it('Should set endBlock', async () => {
        await schedule.setEarlyEndBlock(1000)
        expect(await schedule.endBlock()).to.eq(1000)
      })

      describe('getRewardsForBlockRange', () => {
        it('Should return 0 if from>=endBlock', async () => {
          expect(await schedule.getRewardsForBlockRange(1000, 1001)).to.eq(0)
        })
  
        it('Should use to=endBlock if to>endBlock', async () => {
          expect(await schedule.getRewardsForBlockRange(100, 1003)).to.eq(
            calculateRewardsForRange(100, 1003, 1000)
          )
        })
      })
    })
  })
});