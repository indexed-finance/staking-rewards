pragma solidity ^0.6.0;
pragma experimental ABIEncoderV2;

import {
  IUniswapV2Pair
} from "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import {
  IUniswapV2Factory
} from "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import {
  IUniswapV2Router02
} from "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import { UniswapV2Library } from "./UniswapV2Library.sol";
import "./ERC20Mock.sol";


contract LiquidityAdder {
  ERC20Mock public immutable weth;
  IUniswapV2Factory public immutable factory;
  IUniswapV2Router02 public immutable router;

  constructor(
    address weth_,
    address factory_,
    address router_
  ) public {
    weth = ERC20Mock(weth_);
    factory = IUniswapV2Factory(factory_);
    router = IUniswapV2Router02(router_);
  }

  struct LiquidityToAdd {
    address token;
    uint256 amountToken;
    uint256 amountWeth;
  }

  function addLiquidityMulti(LiquidityToAdd[] memory inputs) public {
    for (uint256 i = 0; i < inputs.length; i++) {
      LiquidityToAdd memory _input = inputs[i];
      _addLiquidity(
        ERC20Mock(_input.token),
        _input.amountToken,
        _input.amountWeth
      );
    }
  }

  function addLiquiditySingle(
    ERC20Mock token, uint256 amountToken, uint256 amountWeth
  ) public returns (uint256 amountTokenActual, uint256 amountWethActual) {
    return _addLiquidity(
      token,
      amountToken,
      amountWeth
    );
  }

  function _addLiquidity(
    ERC20Mock token,
    uint256 amountToken,
    uint256 amountWeth
  ) internal returns (uint256 amountTokenActual, uint256 amountWethActual) {
    (uint256 reserveToken, uint256 reserveWeth) = UniswapV2Library.getReserves(
      address(factory),
      address(token),
      address(weth)
    );
    if (reserveWeth > 0) {
      amountWeth = (amountToken * reserveWeth) / reserveToken;
    }
    token.mint(address(this), amountToken);
    weth.mint(address(this), amountWeth);
    token.approve(address(router), amountToken);
    weth.approve(address(router), amountWeth);
    (amountTokenActual, amountWethActual,) = router.addLiquidity(
      address(token),
      address(weth),
      amountToken,
      amountWeth,
      amountToken / 2,
      amountWeth / 2,
      address(this),
      now + 1
    );
  }

  function swapDecreasePrice(ERC20Mock token) external returns (uint256[] memory amounts) {
    address pair = UniswapV2Library.pairFor(
      address(factory),
      address(token),
      address(weth)
    );
    uint256 amountToken = token.balanceOf(address(pair)) / 5;
    address[] memory path = new address[](2);
    path[0] = address(token);
    path[1] = address(weth);
    token.mint(address(this), amountToken);
    token.approve(address(router), amountToken);
    return router.swapExactTokensForTokens(
      amountToken,
      0,
      path,
      address(this),
      now
    );
  }

  function swapIncreasePrice(ERC20Mock token) external returns (uint256[] memory amounts) {
    address pair = UniswapV2Library.pairFor(
      address(factory),
      address(token),
      address(weth)
    );
    uint256 amountWeth = weth.balanceOf(address(pair)) / 5;
    address[] memory path = new address[](2);
    path[0] = address(weth);
    path[1] = address(token);
    weth.mint(address(this), amountWeth);
    weth.approve(address(router), amountWeth);
    return router.swapExactTokensForTokens(
      amountWeth,
      0,
      path,
      address(this),
      now
    );
  }
}