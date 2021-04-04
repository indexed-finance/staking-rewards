// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;


interface IRewardsSchedule {
  function getRewardsForBlockRange(uint256 from, uint256 to) external view returns (uint256);
}