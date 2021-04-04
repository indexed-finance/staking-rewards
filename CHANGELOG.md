# Changelog for MultiTokenStaking.sol

MultiTokenStaking.sol contract is a fork of [MasterChef.sol](https://github.com/sushiswap/sushiswap/blob/master/contracts/MasterChef.sol) with elements taken from [MasterChefV2.sol](https://github.com/sushiswap/sushiswap/blob/master/contracts/MasterChefV2.sol)

## Context on original contracts

### MasterChef.sol

MasterChef is a multi-token staking contract used by Sushiswap to distribute rewards for their Onsen program. The purpose of MasterChef is to distribute staking rewards for many LP tokens with a single contract, which enables rewards to be modified much more easily than in the more common approach, which is to deploy a separate `StakingRewards` contract for each token.

Each staking token is assigned a number of "allocation points" - the proportion of each staking token's allocation points relative to the total allocation points determines the share of rewards distributed each block that go to that pool.

Staking tokens are stored in an array and each staking token is assigned a `pid` - the pool id for the token and its index in the array.

MasterChef is the only contract which is able to mint new SUSHI.

MasterChef determines rewards by block number: it has a `sushiPerBlock` value which determines the amount of rewards distributed per block, a `startBlock` value which determines when rewards begin, and a `bonusEndBlock` which determines when the "bonus rewards" phase ends. Between `startBlock` and `bonusEndBlock`, all rewards are multiplied by the constant value `BONUS_MULTIPLIER`, which is 10.

### MasterChefV2.sol

MasterChefV2 was created to allow dual rewards for individual staking tokens. Each staking token can be assigned a `rewarder` which implements the `IRewarder` interface. Whenever a user claims their rewards from MasterChefV2, the `rewarder` for that token (if there is one) will be called with `onSushiReward(uint256 pid, address user, uint256 sushiAmount)`.

Because the original MasterChef is the only contract able to mint new SUSHI, MasterChefV2 is assigned a staking pool in the original contract, and the tokens it distributes as rewards are acquired by claiming rewards from the MCV2 staking pool.

MasterChefV2 uses an `init` function to begin rewards and tell the contract the `pid` it has been assigned in the original MasterChef contract, which it then uses to claim rewards prior to distribution.

Like MasterChef, MasterChefV2 uses a multiplier `MASTERCHEF_SUSHI_PER_BLOCK` to determine rewards per block; however, it does not have any bonus rewards phase.

## Code Changes

### `onSushiReward`

Renamed `onSushiReward` in `IRewarder` to `onStakingReward`. Replaced the `SIG_ON_SUSHI_REWARD` constant which was used to call the rewarder with `IRewarder.onStakingReward.selector`.

### Source of rewards
MultiTokenStaking does not assume the rewards token is mintable; instead, it must be sent the rewards tokens by some other account prior to any distribution taking place. When rewards are claimed, the contract executes a standard ERC20 transfer rather than a mint call.

### `init()`

MultiTokenStaking does not have an `init` function because it does not acquire rewards from a separate staking contract. Removed the `LogInit` event for the same reason.

### `devaddr`
MasterChef stores `devaddr` - the address of the developer multisig - which receives a portion of all new SUSHI. Because MultiTokenStaking must have the rewards transferred to it rather than minting new tokens, it is assumed that any tokens which should be distributed to the developers will be sent to them externally, so this contract does not store `devaddr`.

### Access control
MasterChef & MasterChefV2 require that calls to `set` and `add` (the functions to add or modify rewards) be executed by the owner. MultiTokenStaking allows the owner to set a `pointsAllocator` address. The `set` and `add` functions can be called by either the owner or the `pointsAllocator`.

### Rewards Per Block

Rather than using a constant multiplier to determine rewards per block, MultiTokenStaking uses a `rewardsSchedule` contract assigned in the constructor which implements the `IRewardsSchedule` interface. This interface has a function `getRewardsForBlockRange(uint256 from, uint256 to)` which determines the total amount of rewards that should be distributed between two blocks. This pattern was used instead of a constant multiplier in order to allow rewards for each block to be set more dynamically, such as with a linear decay function or varying rates for different block ranges.
Because of this pattern, we do not use a `startBlock` field, as the rewards schedule will simply return 0 for any blocks prior to the beginning of rewards distribution.

### Cosmetic changes

Changed indentation from 4 spaces to 2.

Added section separation using `/** ========== Section ========== */` tags.

Removed space between license identifier and pragma statement.

### Variables Names

`sushi` was renamed `rewardsToken`, and all references to sushi amounts were replaced with references to reward amounts.
