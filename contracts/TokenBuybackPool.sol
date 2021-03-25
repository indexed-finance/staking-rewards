// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/* ========== External Interfaces ========== */
import "@indexed-finance/uniswap-v2-oracle/contracts/interfaces/IIndexedUniswapV2Oracle.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

/* ========== External Libraries ========== */
import "@indexed-finance/uniswap-v2-oracle/contracts/lib/PriceLibrary.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";

/* ========== Internal Libraries ========== */
import "./libraries/TransferHelper.sol";

/* ========== External Inheritance ========== */
import "@boringcrypto/boring-solidity/contracts/BoringOwnable.sol";


contract TokenBuybackPool is BoringOwnable {
  using TransferHelper for address;
  using PriceLibrary for PriceLibrary.TwoWayAveragePrice;

/* ==========  Constants  ========== */

  /// @notice Minimum TWAP duration for price queries to the oracle
  uint32 public constant SHORT_TWAP_MIN_TIME_ELAPSED = 20 minutes;
  /// @notice Maximum TWAP duration for price queries to the oracle
  uint32 public constant SHORT_TWAP_MAX_TIME_ELAPSED = 2 days;

  /// @notice Address of the token to buy-back.
  address public immutable buybackToken;
  /// @notice Address of the Uniswap V2 router
  IUniswapV2Router02 public immutable uniswapRouter;
  /// @notice Address of the Indexed Uniswap oracle
  IIndexedUniswapV2Oracle public immutable oracle;

/* ==========  Storage  ========== */

  // Premium on the amount paid in swaps.
  // Half goes to the caller, half is used to increase payments.
  uint8 public premiumPercent = 2;

  // Reentrance lock
  bool internal _mutex;

/* ==========  Events  ========== */

  event PremiumPercentSet(uint8 premium);

  /**
   * @param tokenSold Token sent to caller
   * @param amountSold Amount of `tokenSold` paid to caller
   * @param amountBought Amount of `buybackToken` received
   */
  event SwappedTokens(
    address indexed tokenSold,
    uint256 amountSold,
    uint256 amountBought
  );

  event TokensWithdrawn(
    address indexed token,
    address recipient,
    uint256 amount
  );

/* ==========  Modifiers  ========== */

  modifier onlyEOA() {
    require(msg.sender == tx.origin, "TokenBuybackPool: must use EOA");
    _;
  }

/* ==========  Constructor  ========== */

  constructor(
    address uniswapRouter_,
    address oracle_,
    address buybackToken_
  ) public {
    uniswapRouter = IUniswapV2Router02(uniswapRouter_);
    oracle = IIndexedUniswapV2Oracle(oracle_);
    buybackToken = buybackToken_;
  }

/* ==========  Owner Functions  ========== */

  /**
   * @dev Set the premium rate as a percent.
   */
  function setPremiumPercent(uint8 premiumPercent_) external onlyOwner {
    require(
      premiumPercent_ > 0 && premiumPercent_ < 20,
      "ERR_PREMIUM"
    );
    premiumPercent = premiumPercent_;
    emit PremiumPercentSet(premiumPercent_);
  }

  function withdrawTokens(
    address token,
    address to,
    uint256 amount
  ) external onlyOwner {
    token.safeTransfer(to, amount);
    emit TokensWithdrawn(token, to, amount);
  }

/* ==========  Token Swaps  ========== */

  /**
   * @dev Execute a trade with UniSwap to sell some tokens held by the contract
   * for some tokens desired by the pool and pays the caller the difference between
   * the maximum input value and the actual paid amount.
   *
   * @param tokenToSell Token to sell to UniSwap
   * @param amountToBuy Exact amount of `buybackToken` to receive from UniSwap
   * @param path Swap path to execute
   */
  function executeSwapTokensForExactTokens(
    address tokenToSell,
    uint256 amountToBuy,
    address[] calldata path
  )
    external
    onlyEOA
    returns (uint256 premiumPaidToCaller)
  {
    // calcOutGivenIn uses tokenIn as the token the pool is receiving and
    // tokenOut as the token the pool is paying, whereas this function is
    // the reverse.
    uint256 maxAmountSold = calcOutGivenIn(tokenToSell, amountToBuy);
    // Approve UniSwap to transfer the input tokens
    tokenToSell.safeApprove(address(uniswapRouter), maxAmountSold);
    // Verify that the first token in the path is the input token and that
    // the last is the output token.
    require(
      path[0] == tokenToSell && path[path.length - 1] == buybackToken,
      "ERR_PATH_TOKENS"
    );
    // Execute the swap.
    uint256[] memory amounts = uniswapRouter.swapTokensForExactTokens(
      amountToBuy,
      maxAmountSold,
      path,
      address(this),
      block.timestamp
    );
    // Get the actual amount paid
    uint256 amountSold = amounts[0];
    // If we did not swap the full amount, remove the UniSwap allowance.
    if (amountSold < maxAmountSold) {
      tokenToSell.safeApprove(address(uniswapRouter), 0);
      premiumPaidToCaller = maxAmountSold - amountSold;
      // Transfer the difference between what the contract was willing to pay and
      // what it actually paid to the caller.
      tokenToSell.safeTransfer(msg.sender, premiumPaidToCaller);
    }
    emit SwappedTokens(
      tokenToSell,
      amountSold,
      amountToBuy
    );
  }

  /**
   * @dev Executes a trade with UniSwap to sell some tokens held by the contract
   * for some tokens desired by the pool and pays the caller any tokens received
   * above the minimum acceptable output.
   *
   * @param tokenToSell Token to sell to UniSwap
   * @param amountToSell Exact amount of `tokenToSell` to give UniSwap
   * @param path Swap path to execute
   */
  function executeSwapExactTokensForTokens(
    address tokenToSell,
    uint256 amountToSell,
    address[] calldata path
  )
    external
    onlyEOA
    returns (uint256 premiumPaidToCaller)
  {
    // calcInGivenOut uses tokenIn as the token the pool is receiving and
    // tokenOut as the token the pool is paying, whereas this function is
    // the reverse.
    uint256 minAmountBought = calcInGivenOut(tokenToSell, amountToSell);
    // Approve UniSwap to transfer the input tokens
    tokenToSell.safeApprove(address(uniswapRouter), amountToSell);
    // Verify that the first token in the path is the input token and that
    // the last is the output token.
    require(
      path[0] == tokenToSell && path[path.length - 1] == buybackToken,
      "ERR_PATH_TOKENS"
    );
    // Execute the swap.
    uint256[] memory amounts = uniswapRouter.swapExactTokensForTokens(
      amountToSell,
      minAmountBought,
      path,
      address(this),
      block.timestamp
    );
  
    // Get the actual amount paid
    uint256 amountBought = amounts[amounts.length - 1];
    if (amountBought > minAmountBought) {
      // Transfer any tokens received beyond the minimum acceptable payment
      // to the caller as a reward.
      premiumPaidToCaller = amountBought - minAmountBought;
      buybackToken.safeTransfer(msg.sender, premiumPaidToCaller);
    }
    emit SwappedTokens(
      tokenToSell,
      amountToSell,
      amountBought
    );
  }

  /**
   * @dev Swap exactly `amountIn` of `buybackToken` for at least `minAmountOut`
   * of `tokenOut`.
   *
   * @param tokenOut Token to buy from pool
   * @param amountIn Amount of `buybackToken` to sell to pool
   * @param minAmountOut Minimum amount of `tokenOut` to buy from pool
   */
  function swapExactTokensForTokens(
    address tokenOut,
    uint256 amountIn,
    uint256 minAmountOut
  )
    external
    onlyEOA
    returns (uint256 amountOut)
  {
    amountOut = calcOutGivenIn(tokenOut, amountIn);
    // Verify the amount is above the provided minimum.
    require(amountOut >= minAmountOut, "ERR_MIN_AMOUNT_OUT");
    // Transfer the input tokens to the pool
    buybackToken.safeTransferFrom(msg.sender, address(this), amountIn);
    // Transfer the output tokens to the caller
    tokenOut.safeTransfer(msg.sender, amountOut);
    emit SwappedTokens(
      tokenOut,
      amountOut,
      amountIn
    );
  }

  /**
   * @dev Swap up to `maxAmountIn` of `tokenIn` for exactly `amountOut`
   * of `tokenOut`.
   *
   * @param tokenOut Token to buy from pool
   * @param amountOut Amount of `tokenOut` to buy from pool
   * @param maxAmountIn Maximum amount of `buybackToken` to sell to pool
   */
  function swapTokensForExactTokens(
    address tokenOut,
    uint256 amountOut,
    uint256 maxAmountIn
  )
    external
    onlyEOA
    returns (uint256 amountIn)
  {
    amountIn = calcInGivenOut(tokenOut, amountOut);
    require(amountIn <= maxAmountIn, "ERR_MAX_AMOUNT_IN");
    // Transfer the input tokens to the pool
    buybackToken.safeTransferFrom(msg.sender, address(this), amountIn);
    // Transfer the output tokens to the caller
    tokenOut.safeTransfer(msg.sender, amountOut);
    emit SwappedTokens(
      tokenOut,
      amountOut,
      amountIn
    );
  }

/* ==========  Swap Queries  ========== */

  /**
   * @dev Calculate the amount of `buybackToken` the pool will accept for
   * `amountOut` of `tokenOut`.
   */
  function calcInGivenOut(address tokenOut, uint256 amountOut)
    public
    view
    returns (uint256 amountIn)
  {
    require(
      IERC20(tokenOut).balanceOf(address(this)) >= amountOut,
      "ERR_INSUFFICIENT_BALANCE"
    );
    (
      PriceLibrary.TwoWayAveragePrice memory avgPriceIn,
      PriceLibrary.TwoWayAveragePrice memory avgPriceOut
    ) = _getAveragePrices(buybackToken, tokenOut);
    // Compute the average weth value for `amountOut` of `tokenOut`
    uint144 avgOutValue = avgPriceOut.computeAverageEthForTokens(amountOut);
    // Compute the minimum weth value the contract must receive for `avgOutValue`
    uint256 minInValue = _minimumReceivedValue(avgOutValue);
    // Compute the average amount of `tokenIn` worth `minInValue` weth
    amountIn = avgPriceIn.computeAverageTokensForEth(minInValue);
  }

  /**
   * @dev Calculate the amount of `tokenOut` the pool will give for
   * `amountIn` of `buybackToken`.
   */
  function calcOutGivenIn(address tokenOut, uint256 amountIn)
    public
    view
    returns (uint256 amountOut)
  {
    (
      PriceLibrary.TwoWayAveragePrice memory avgPriceIn,
      PriceLibrary.TwoWayAveragePrice memory avgPriceOut
    ) = _getAveragePrices(buybackToken, tokenOut);
    // Compute the average weth value for `amountIn` of `buybackToken`
    uint144 avgInValue = avgPriceIn.computeAverageEthForTokens(amountIn);
    // Compute the maximum weth value the contract will give for `avgInValue`
    uint256 maxOutValue = _maximumPaidValue(avgInValue);
    // Compute the average amount of `tokenOut` worth `maxOutValue` weth
    amountOut = avgPriceOut.computeAverageTokensForEth(maxOutValue);
    uint256 tokenOutBalance = IERC20(tokenOut).balanceOf(address(this));
    if (tokenOutBalance < amountOut) {
      amountOut = tokenOutBalance;
    }
  }

/* ==========  Internal Utilities  ========== */

  function _getAveragePrices(address token1, address token2)
    internal
    view
    returns (
      PriceLibrary.TwoWayAveragePrice memory avgPrice1,
      PriceLibrary.TwoWayAveragePrice memory avgPrice2
    )
  {
    address[] memory tokens = new address[](2);
    tokens[0] = token1;
    tokens[1] = token2;
    PriceLibrary.TwoWayAveragePrice[] memory prices = oracle.computeTwoWayAveragePrices(
      tokens,
      SHORT_TWAP_MIN_TIME_ELAPSED,
      SHORT_TWAP_MAX_TIME_ELAPSED
    );
    avgPrice1 = prices[0];
    avgPrice2 = prices[1];
  }

  function _maximumPaidValue(uint256 valueReceived)
    internal
    view
    returns (uint256 maxPaidValue)
  {
    maxPaidValue = (100 * valueReceived) / (100 - premiumPercent);
  }


  function _minimumReceivedValue(uint256 valuePaid)
    internal
    view
    returns (uint256 minValueReceived)
  {
    minValueReceived = (valuePaid * (100 - premiumPercent)) / 100;
  }
}