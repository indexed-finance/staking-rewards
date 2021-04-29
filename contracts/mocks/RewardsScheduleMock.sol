// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "../interfaces/IRewardsSchedule.sol";


contract RewardsScheduleMock is IRewardsSchedule {
  uint256 public constant REWARDS_PER_BLOCK = 1e20;

  uint256 public immutable override startBlock;
  uint256 public override endBlock;

  constructor(uint256 startBlock_, uint256 endBlock_) public {
    require(endBlock_ > startBlock_);
    startBlock = startBlock_;
    endBlock = endBlock_;
  }

  function setEarlyEndBlock(uint256 earlyEndBlock) external override {
    endBlock = earlyEndBlock;
    emit EarlyEndBlockSet(earlyEndBlock);
  }

  function getRewardsForBlockRange(uint256 from, uint256 to) external view override returns (uint256) {
    uint256 endBlock_ = endBlock;
    // If queried range is entirely outside of reward blocks, return 0
    if (from >= endBlock_ || to <= startBlock) return 0;
    // Use start/end values where from/to are OOB
    if (to > endBlock_) to = endBlock_;
    if (from < startBlock) from = startBlock;

    return (to - from) * REWARDS_PER_BLOCK;
  }
}