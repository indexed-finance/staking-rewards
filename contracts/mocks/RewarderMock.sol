// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "../interfaces/IRewarder.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";


contract RewarderMock is IRewarder {
  using BoringMath for uint256;
  using BoringERC20 for IERC20;
  uint256 private immutable rewardMultiplier;
  IERC20 private immutable rewardToken;
  uint256 private constant REWARD_TOKEN_DIVISOR = 1e18;

  constructor (uint256 _rewardMultiplier, IERC20 _rewardToken) public {
    rewardMultiplier = _rewardMultiplier;
    rewardToken = _rewardToken;
  }

  function onStakingReward(uint256, address user, uint256 rewardAmount) override external {
    uint256 pendingReward = rewardAmount.mul(rewardMultiplier) / REWARD_TOKEN_DIVISOR;
    uint256 rewardBal = rewardToken.balanceOf(address(this));
    if (pendingReward > rewardBal) {
      rewardToken.safeTransfer(user, rewardBal);
    } else {
      rewardToken.safeTransfer(user, pendingReward);
    }
  }
  function pendingTokens(uint256 pid, address user, uint256 rewardAmount) override external returns (address[] memory rewardTokens, uint256[] memory rewardAmounts) {
    rewardTokens = new address[](1);
    rewardTokens[0] = address(rewardToken);
    rewardAmounts = new uint256[](1);
    rewardAmounts[0] = rewardAmount.mul(rewardMultiplier) / REWARD_TOKEN_DIVISOR;
  }
}