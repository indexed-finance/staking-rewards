// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;


interface IRewarder {
  function onStakingReward(uint256 pid, address user, uint256 sushiAmount) external;
  function pendingTokens(uint256 pid, address user, uint256 sushiAmount) external returns (address[] memory, uint256[] memory);
}
