import { deployments } from "hardhat";
import LiquidityManager from './utilities/liquidity-manager';

export default (thisObject, owner: string) => deployments.createFixture(async ({ deployments, ethers }) => {
  await deployments.fixture();
  const [ signer ] = await ethers.getSigners();

  const deploy = async (name, ...args) => {
    return (await ethers.getContractFactory(name, signer)).deploy(...args);
  }

  const weth = await deploy('ERC20Mock', "Wrapped Ether V9", "WETH9", 0);
  const uniswapFactory = await ethers.getContractAt('IUniswapV2Factory', (await deployments.deploy("UniswapV2Factory", {
    from: owner,
    gasLimit: 4000000,
    args: [owner]
  })).address);
  const uniswapRouter = await ethers.getContractAt('IUniswapV2Router02', (await deployments.deploy("UniswapV2Router02", {
    from: owner,
    gasLimit: 5000000,
    args: [uniswapFactory.address, weth.address]
  })).address);
  
  const uniswapOracle = await ethers.getContractAt('IIndexedUniswapV2Oracle', (await deployments.deploy("IndexedUniswapV2Oracle", {
    from: owner,
    gasLimit: 5000000,
    args: [uniswapFactory.address, weth.address]
  })).address);
  
  const liquidityAdder = await deploy('LiquidityAdder', weth.address, uniswapFactory.address, uniswapRouter.address);
  const liquidityManager = new LiquidityManager(liquidityAdder, uniswapOracle);

  thisObject['weth'] = weth;
  thisObject['uniswapFactory'] = uniswapFactory;
  thisObject['uniswapRouter'] = uniswapRouter;
  thisObject['uniswapOracle'] = uniswapOracle;
  thisObject['liquidityManager'] = liquidityManager;

  const addLiquidity = (erc20, amountToken, amountWeth) => liquidityManager.addLiquidity(erc20, amountToken, amountWeth);
  const updatePrice = (token) => liquidityManager.updatePrice(token);
  const updatePrices = (tokens) => liquidityManager.updatePrices(tokens);
  const getAverageTokenPrice = (token) => liquidityManager.getAverageTokenPrice(token);
  const getAverageEthPrice = (token) => liquidityManager.getAverageEthPrice(token);

  const deployTokenAndMarket = async (name: string, symbol: string) => {
    const erc20 = await deploy('ERC20Mock', name, symbol, 0);
    const receipt = await uniswapFactory.createPair(erc20.address, weth.address);
    const { events } = await receipt.wait();
    const { args: { pair } } = events.filter(e => e.event == 'PairCreated')[0];
    thisObject[name] = erc20;
    return {
      token: erc20,
      address: erc20.address
    };
  }

  return {
    weth,
    uniswapFactory,
    uniswapRouter,
    deployTokenAndMarket,
    liquidityManager,
    addLiquidity,
    uniswapOracle,
    updatePrice,
    updatePrices,
    getAverageTokenPrice,
    getAverageEthPrice
  };
});