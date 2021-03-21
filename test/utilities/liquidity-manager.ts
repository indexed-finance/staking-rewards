import { BigNumber, Contract } from "ethers";
import { getTransactionTimestamp } from "./time";

const MAX_UINT112 = BigNumber.from(2).pow(112);

type EncodedPrice = {
  tokenReserves?: BigNumber,
  wethReserves?: BigNumber,
  tokenPriceAverage?: BigNumber,
  ethPriceAverage?: BigNumber,
  blockTimestamp?: number,
  tokenPriceCumulativeLast?: BigNumber,
  ethPriceCumulativeLast?: BigNumber
}

function encodePrice(
  _tokenReserves: BigNumber,
  _wethReserves: BigNumber,
  _blockTimestamp: number,
  lastPrice: EncodedPrice = {}
): EncodedPrice {
  const blockTimestamp = _blockTimestamp % (2**32);
  const timeElapsed = blockTimestamp - (lastPrice.blockTimestamp || 0);
  let tokenPriceAverage = lastPrice.tokenPriceAverage;
  let ethPriceAverage = lastPrice.ethPriceAverage;
  let tokenPriceCumulativeLast = BigNumber.from(0)
  let ethPriceCumulativeLast = BigNumber.from(0);
  if (timeElapsed > 0 && lastPrice.tokenReserves && lastPrice.wethReserves) {
    const { tokenReserves, wethReserves } = lastPrice;
    tokenPriceAverage = wethReserves.mul(MAX_UINT112).div(tokenReserves);
    ethPriceAverage = tokenReserves.mul(MAX_UINT112).div(wethReserves);
    tokenPriceCumulativeLast = lastPrice.tokenPriceCumulativeLast.add(
      tokenPriceAverage.mul(timeElapsed)
    );
    ethPriceCumulativeLast = lastPrice.ethPriceCumulativeLast.add(
      ethPriceAverage.mul(timeElapsed)
    );
  }
  const tokenReserves = BigNumber.from(lastPrice.tokenReserves || 0).add(_tokenReserves);
  const wethReserves = BigNumber.from(lastPrice.wethReserves || 0).add(_wethReserves);
  return {
    tokenReserves,
    wethReserves,
    tokenPriceAverage,
    ethPriceAverage,
    blockTimestamp,
    tokenPriceCumulativeLast,
    ethPriceCumulativeLast
  };
}

export default class LiquidityManager {
  public prices: { [address: string]: EncodedPrice | undefined } = {};

  constructor(
    public liquidityAdder: Contract,
    public uniswapOracle: Contract
  ) {}

  updateEncodedPrice(address, amountToken, amountWeth, timestamp) {
    const lastPrice = this.prices[address] || {};
    this.prices[address] = encodePrice(amountToken, amountWeth, +timestamp, lastPrice || {});
  }

  async addLiquidity(token: string, amountToken, amountWeth) {
    const [amountTokenActual, amountWethActual] = await this.liquidityAdder.callStatic.addLiquiditySingle(
      token,
      amountToken,
      amountWeth
    );
    const tx = this.liquidityAdder.addLiquiditySingle(
      token,
      amountToken,
      amountWeth,
      { gasLimit: 4700000 }
    );
    const timestamp = await getTransactionTimestamp(tx);
    this.updateEncodedPrice(token, amountTokenActual, amountWethActual, timestamp);
    return tx;
  }

  async updatePrice(token: string) {
    const tx = this.uniswapOracle.updatePrice(token);
    const timestamp = await getTransactionTimestamp(tx);
    this.updateEncodedPrice(token, 0, 0, timestamp);
    return tx;
  }

  async updatePricesInternal(tokens: string[]) {
    const { timestamp } = await this.liquidityAdder.provider.getBlock('latest');
    for (let token of tokens) {
      this.updateEncodedPrice(token, 0, 0, timestamp);
    }
  }

  async updatePrices(tokens: string[]) {
    const tx = this.uniswapOracle.updatePrices(tokens);
    const timestamp = await getTransactionTimestamp(tx);
    for (let token of tokens) {
      this.updateEncodedPrice(token, BigNumber.from(0), BigNumber.from(0), timestamp);
    }
    return tx;
  }

  async swapIncreasePrice(_token) {
    const [amountWeth, amountToken] = await this.liquidityAdder.callStatic.swapIncreasePrice(_token);
    const tx = this.liquidityAdder.swapIncreasePrice(_token);
    const timestamp = await getTransactionTimestamp(tx);
    this.updateEncodedPrice(_token, BigNumber.from(0).sub(amountToken), amountWeth, timestamp);
    return tx;
  }

  async swapDecreasePrice(_token) {
    const [amountToken, amountWeth] = await this.liquidityAdder.callStatic.swapDecreasePrice(_token);
    const tx = this.liquidityAdder.swapDecreasePrice(_token);
    const timestamp = await getTransactionTimestamp(tx);
    this.updateEncodedPrice(_token, amountToken, BigNumber.from(0).sub(amountWeth), timestamp);
    return tx;
  }

  computeAverageEthForTokens(_token, amountToken) {
    const lastPrice = this.prices[_token];
    return lastPrice.tokenPriceAverage.mul(amountToken).div(MAX_UINT112);
  }

  computeAverageTokensForEth(_token, amountWeth) {
    const lastPrice = this.prices[_token];
    return lastPrice.ethPriceAverage.mul(amountWeth).div(MAX_UINT112);
  }

  getAverageTokenPrice(_token) {
    const lastPrice = this.prices[_token];
    return lastPrice.tokenPriceAverage;
  }

  getAverageEthPrice(_token) {
    const lastPrice = this.prices[_token];
    return lastPrice.ethPriceAverage;
  }
}