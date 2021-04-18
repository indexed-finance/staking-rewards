// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

/**
 * @dev Rewards schedule that distributed 1,500,000 tokens over two years using a linear
 * decay that distributes roughly 2x tokens in the first block for every 0.3 tokens in the
 * last block.
 *
 * A value of 13.2 seconds was selected as the average block time to set 4778182 as the number
 * of blocks in 2 years. This has been a stable block time for roughly a year at the time of
 * writing.
 */
contract NDXRewardsSchedule {
  uint256 public immutable START_BLOCK;
  uint256 public immutable END_BLOCK;

  constructor(uint256 startBlock) public {
    START_BLOCK = startBlock;
    END_BLOCK = startBlock + 4778181;
  }

  function getRewardsForBlockRange(uint256 from, uint256 to) public view returns (uint256) {
    require(to >= from, "Bad block range");

    // If queried range is entirely outside of reward blocks, return 0
    if (from >= END_BLOCK || to <= START_BLOCK) return 0;

    // Use start/end values where from/to are OOB
    if (to > END_BLOCK) to = END_BLOCK;
    if (from < START_BLOCK) from = START_BLOCK;

    uint256 x = from - START_BLOCK;
    uint256 y = to - START_BLOCK;

    // This formula is the definite integral of the following function:
    // rewards(b) = 0.5336757788 - 0.00000009198010879*b; b >= 0; b < 4778182
    // where b is the block number offset from {START_BLOCK} and the output is multiplied by 1e18.
    return (45990054395 * x**2)
      + (5336757788e8 * (y - x))
      - (45990054395 * y**2);
  }
}

