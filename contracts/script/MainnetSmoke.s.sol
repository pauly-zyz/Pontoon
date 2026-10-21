// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PontoonLauncher} from "../src/PontoonLauncher.sol";
import {TokenRegistry} from "../src/TokenRegistry.sol";
import {FeeVault} from "../src/FeeVault.sol";
import {BuybackExecutor} from "../src/BuybackExecutor.sol";
import {HolderRewards} from "../src/HolderRewards.sol";
import {PlatformTreasury} from "../src/PlatformTreasury.sol";
import {CTOManager} from "../src/CTOManager.sol";
import {FeeConfig, ITokenRegistry} from "../src/interfaces/IPontoon.sol";
import {IPonsV2Curve, IPonsV2LaunchFactory, PonsV2Raw} from "../src/interfaces/IPonsV2Live.sol";

/// @notice Small real-money smoke test on Robinhood Chain mainnet against the live Pons V2.
///         Deploys a THROWAWAY Pontoon set owned by the test wallet (never the official contracts),
///         launches one token and runs every user flow. Pons releases fees only after ~0.0925 ETH of volume,
///         so the distribute/buyback part needs SMOKE_TRADE_WEI >= 1e17 (temporarily ~0.1 ETH, mostly sold back).
///
///   forge script script/MainnetSmoke.s.sol --rpc-url $RPC --broadcast --private-key ...            # deploy + launch
///   (wait > 3 s for the Pons snipe-tax window)
///   forge script script/MainnetSmoke.s.sol --sig "flows()" --rpc-url $RPC --broadcast --private-key ...
contract MainnetSmoke is Script {
    IPonsV2LaunchFactory constant PONS = IPonsV2LaunchFactory(0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e);
    string constant OUT = "./deployments/smoke-mainnet.json";
    uint256 constant INITIAL_BUY = 0.0002 ether;

    /// @dev Pons only harvests a curve's fees after ~0.0925 ETH of volume, so a full fee-flow test buys
    ///      SMOKE_TRADE_ETH (e.g. 0.1) and sells almost all of it back. Default: tiny trade, no distribution.
    function _tradeBuy() internal view returns (uint256) {
        return vm.envOr("SMOKE_TRADE_WEI", uint256(0.0003 ether));
    }

    /// @dev Optional SMOKE_PK env (set by the caller from a key file, never on the command line).
    function _pk() internal view returns (uint256) {
        return vm.envOr("SMOKE_PK", uint256(0));
    }

    function _start() internal {
        uint256 pk = _pk();
        if (pk != 0) vm.startBroadcast(pk);
        else vm.startBroadcast();
    }

    function _sender() internal view returns (address) {
        uint256 pk = _pk();
        return pk != 0 ? vm.addr(pk) : msg.sender;
    }

    function run() external {
        require(address(PONS).code.length > 0, "Pons factory missing");
        address me = _sender();
        uint256 fee = PONS.launchFee();

        _start();
        TokenRegistry registry = new TokenRegistry(me);
        PlatformTreasury treasury = new PlatformTreasury(me);
        BuybackExecutor executor = new BuybackExecutor(me, registry);
        CTOManager cto = new CTOManager(me, registry);
        PontoonLauncher launcher = new PontoonLauncher(
            me,
            PONS,
            registry,
            address(new FeeVault()),
            address(new HolderRewards()),
            address(executor),
            address(treasury),
            address(cto)
        );
        registry.setLauncher(address(launcher));
        (address token, address vault) = launcher.launch{value: fee + INITIAL_BUY}(
            PontoonLauncher.TokenMeta({
                name: "Pontoon Smoke Test",
                symbol: "PSMOKE",
                logo: "",
                description: "Pontoon mainnet integration test. Not a real project, do not buy.",
                twitter: "",
                telegram: "",
                website: ""
            }),
            address(0),
            false,
            FeeConfig({buybackBps: 4_000, rewardBps: 2_000})
        );
        vm.stopBroadcast();

        string memory o = "smoke";
        vm.serializeAddress(o, "PontoonLauncher", address(launcher));
        vm.serializeAddress(o, "TokenRegistry", address(registry));
        vm.serializeAddress(o, "BuybackExecutor", address(executor));
        vm.serializeAddress(o, "PlatformTreasury", address(treasury));
        vm.serializeAddress(o, "CTOManager", address(cto));
        vm.serializeAddress(o, "vault", vault);
        string memory json = vm.serializeAddress(o, "token", token);
        vm.createDir("./deployments", true);
        vm.writeJson(json, OUT);
        console2.log("token", token);
        console2.log("creator tokens from initial buy", IERC20(token).balanceOf(me));
    }

    TokenRegistry registry;
    BuybackExecutor executor;
    address token;
    IPonsV2Curve curve;
    FeeVault vault;
    HolderRewards rewards;
    address me;
    uint256 staked;

    function _load() internal {
        string memory json = vm.readFile(OUT);
        registry = TokenRegistry(vm.parseJsonAddress(json, ".TokenRegistry"));
        executor = BuybackExecutor(payable(vm.parseJsonAddress(json, ".BuybackExecutor")));
        token = vm.parseJsonAddress(json, ".token");
        ITokenRegistry.TokenInfo memory info = registry.getToken(token);
        curve = IPonsV2Curve(info.curve);
        vault = FeeVault(payable(info.vault));
        rewards = HolderRewards(payable(info.holderRewards));
        me = _sender();
    }

    /// @notice Run > 3 s after `run`: buy, sell, stake, then (if Pons releases the fees) distribute,
    ///         buyback-and-burn and claims; finally unstake.
    function flows() external {
        _load();
        require(block.timestamp > curve.launchedAt() + 3, "wait for the snipe-tax window");
        _trade();
        if (_harvestable()) {
            _distributeAndBuyback();
        } else {
            console2.log("Pons fees not harvestable yet (below the Pons minimum); skipping distribute + buyback");
        }
        _start();
        rewards.unstake(staked);
        vm.stopBroadcast();
    }

    function _trade() internal {
        uint256 tradeBuy = _tradeBuy();
        uint256 before = IERC20(token).balanceOf(me);
        _start();
        curve.buy{value: tradeBuy}(tradeBuy, 1, me);
        vm.stopBroadcast();
        uint256 bought = IERC20(token).balanceOf(me) - before;
        console2.log("bought tokens", bought);

        // Sell 95% back, stake half of what is left.
        uint256 toSell = bought * 95 / 100;
        _start();
        IERC20(token).approve(address(curve), toSell);
        curve.sell(toSell, 1, me);
        vm.stopBroadcast();
        staked = IERC20(token).balanceOf(me) / 2;
        _start();
        IERC20(token).approve(address(rewards), staked);
        rewards.stake(staked);
        vm.stopBroadcast();
    }

    /// @dev Simulation only (state is rolled back): would the Pons harvester sweep this curve now?
    function _harvestable() internal returns (bool ok) {
        uint256 snap = vm.snapshotState();
        (ok,) = PonsV2Raw.feeHarvester(PONS.memeHook())
            .call(abi.encodeWithSelector(PonsV2Raw.HARVESTER_HARVEST, address(curve)));
        vm.revertToState(snap);
    }

    function _distributeAndBuyback() internal {
        _start();
        vault.distribute();
        vm.stopBroadcast();
        console2.log("distributed (wei)", vault.totalDistributed());

        uint256 pending = executor.pendingETH(token);
        uint256 cap = executor.maxBuyback(token);
        uint256 amount = pending < cap ? pending : cap;
        _start();
        if (amount > 0) executor.buybackAndBurn(token, amount, 1);
        if (rewards.pendingReward(me) > 0) rewards.claim();
        if (vault.creatorOwed(me) > 0) vault.claimCreator();
        vm.stopBroadcast();
        console2.log("burned", executor.totalBurned(token));
    }
}
