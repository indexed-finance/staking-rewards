// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";


contract RedeemableShares is ERC20 {
  using SafeERC20 for IERC20;

  IERC20 public immutable underlyingToken;

  constructor(
    string memory name,
    string memory symbol,
    address _underlyingToken
  ) public ERC20(name, symbol) {
    underlyingToken = IERC20(_underlyingToken);
  }

  function underlyingBalance() public view returns (uint256) {
    return underlyingToken.balanceOf(address(this));
  }

  function fromUnderlying(uint256 underlyingAmount) public view returns (uint256) {
    uint256 _underlyingBalance = underlyingBalance();
    uint256 _supply = totalSupply();
    if (_supply == 0 || _underlyingBalance == 0) {
      return underlyingAmount;
    }
    return underlyingAmount.mul(_supply).div(_underlyingBalance);
  }

  function toUnderlying(uint256 sharesAmount) public view returns (uint256) {
    uint256 _underlyingBalance = underlyingBalance();
    uint256 _supply = totalSupply();
    if (_supply == 0 || _underlyingBalance == 0) {
      return 0;
    }
    return sharesAmount.mul(_underlyingBalance).div(_supply);
  }

  /**
   * @dev Deposit `underlyingAmount` of `underlyingToken` to mint shares of
   * the redeemable asset at the current ratio of shares to underlying
   * tokens held.
   * @param underlyingAmount - Amount of the underlying asset to deposit
   * @return sharesMinted - Amount of shares minted to the caller
   */
  function deposit(uint256 underlyingAmount) public returns (uint256 sharesMinted) {
    sharesMinted = fromUnderlying(underlyingAmount);
    _mint(msg.sender, sharesMinted);
    underlyingToken.safeTransferFrom(msg.sender, address(this), underlyingAmount);
  }

  /**
   * @dev Burn `sharesAmount` of the redeemable shares to withdraw underlying
   * tokens at the current ratio of shares to underlying tokens held.
   * @param sharesAmount - Amount of shares to burn
   * @return underlyingAmountRedeemed - Amount of underlying assets redeemed
   */
  function withdraw(uint256 sharesAmount) public returns (uint256 underlyingAmountRedeemed) {
    underlyingAmountRedeemed = _withdraw(msg.sender, msg.sender, sharesAmount);
  }

  /**
   * @dev Burn `sharesAmount` of the redeemable shares to withdraw underlying
   * tokens at the current ratio of shares to underlying tokens held and
   * transfer the underlying tokens to another account.
   * @param recipient - Address to send underlying tokens to
   * @param sharesAmount - Amount of shares to burn
   * @return underlyingAmountRedeemed - Amount of underlying assets redeemed
   */
  function withdrawTo(address recipient, uint256 sharesAmount) public returns (uint256 underlyingAmountRedeemed) {
    underlyingAmountRedeemed = _withdraw(msg.sender, recipient, sharesAmount);
  }

  /**
   * @dev Burn `sharesAmount` redeemable shares from `sender` to withdraw
   * underlying tokens at the current ratio of shares to underlying tokens
   * held and transfer the underlying tokens to `recipient`.
   * Caller must have at least `sharesAmount` allowance from `sender`.
   * @param sender - Account to withdraw shares from
   * @param recipient - Address to send underlying tokens to
   * @param sharesAmount - Amount of shares to burn
   * @return underlyingAmountRedeemed - Amount of underlying assets redeemed
   */
  function withdrawFrom(address sender, address recipient, uint256 sharesAmount) public returns (uint256 underlyingAmountRedeemed) {
    _approve(
      sender,
      msg.sender,
      allowance(sender, msg.sender).sub(sharesAmount, "RedeemableShares: withdrawal amount exceeds allowance")
    );
    underlyingAmountRedeemed = _withdraw(sender, recipient, sharesAmount);
  }

  function _withdraw(address sender, address recipient, uint256 sharesAmount) internal returns (uint256 underlyingAmountRedeemed) {
    underlyingAmountRedeemed = toUnderlying(sharesAmount);
    _burn(sender, sharesAmount);
    underlyingToken.safeTransfer(recipient, underlyingAmountRedeemed);
  }
}