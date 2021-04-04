// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "../interfaces/IRewardsSchedule.sol";


contract RewardsScheduleMock {
  uint256 public constant REWARDS_PER_BLOCK = 1e20;

  function getRewardsForBlockRange(uint256 from, uint256 to) external view returns (uint256) {
    return (to - from) * REWARDS_PER_BLOCK;
  }
}