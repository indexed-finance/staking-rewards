import { expect } from "chai";
import { ethers } from "hardhat";
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

const calculateRewardsForRange = (from: number, to: number) => {
  if (to > 4778281) to = 4778281;
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
  let schedule: NDXRewardsSchedule;

  before(async function () {
    const RewardsSchedule = await ethers.getContractFactory('NDXRewardsSchedule');
    schedule = (await RewardsSchedule.deploy(100)) as NDXRewardsSchedule;
  })

  describe('Settings', () => {
    it('START_BLOCK', async () => {
      expect(await schedule.START_BLOCK()).to.eq(100)
    })

    it('END_BLOCK', async () => {
      expect(await schedule.END_BLOCK()).to.eq(4778281)
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
      it('Should return 0 if to<=START_BLOCK', async () => {
        expect(await schedule.getRewardsForBlockRange(0, 100)).to.eq(0)
      })

      it('Should return 0 if from>=END_BLOCK', async () => {
        expect(await schedule.getRewardsForBlockRange(4778281, 4778283)).to.eq(0)
      })

      it('Should use from=START_BLOCK if from<START_BLOCK', async () => {
        expect(await schedule.getRewardsForBlockRange(99, 105)).to.eq(
          calculateRewardsForRange(100, 105)
        )
      })

      it('Should use to=END_BLOCK if to>END_BLOCK', async () => {
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
});