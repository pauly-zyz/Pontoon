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
import {FeeConfig} from "../src/interfaces/IPontoon.sol";
import {IPonsV2Curve, IPonsV2LaunchFactory} from "../src/interfaces/IPonsV2Live.sol";

/// @notice Local demo on an anvil FORK of Robinhood Chain mainnet, against the real Pons V2 contracts.
///         Generates activity for every indexed event. Never broadcast to a real network.
///
///   anvil --fork-url https://rpc.mainnet.chain.robinhood.com --port 8546
///   forge script script/LocalDemo.s.sol --rpc-url http://127.0.0.1:8546 --broadcast            # deploy + launch
///   cast rpc evm_increaseTime 10 && cast rpc evm_mine                                          # past snipe tax
///   forge script script/LocalDemo.s.sol --sig "trade()" --rpc-url ... --broadcast              # trades, fees
///   cast rpc evm_increaseTime 259201 && cast rpc evm_mine                                      # past timelocks
///   forge script script/LocalDemo.s.sol --sig "phase2()" --rpc-url ... --broadcast
contract LocalDemo is Script {
    string constant MNEMONIC = "test test test test test test test test test test test junk";
    string constant OUT = "./deployments/local.json";
    IPonsV2LaunchFactory constant PONS = IPonsV2LaunchFactory(0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e);

    uint256 deployerPk;
    uint256 multisigPk;
    uint256 creatorAPk;
    uint256 creatorBPk;
    uint256 stakerPk;
    uint256 keeperPk;
    uint256 ctoPk;

    TokenRegistry registry;
    PlatformTreasury treasury;
    BuybackExecutor executor;
    CTOManager cto;
    PontoonLauncher launcher;
    address[] tokens;

    function _keys() internal {
        deployerPk = vm.deriveKey(MNEMONIC, 0);
        multisigPk = vm.deriveKey(MNEMONIC, 1);
        creatorAPk = vm.deriveKey(MNEMONIC, 2);
        creatorBPk = vm.deriveKey(MNEMONIC, 3);
        stakerPk = vm.deriveKey(MNEMONIC, 4);
        keeperPk = vm.deriveKey(MNEMONIC, 5);
        ctoPk = vm.deriveKey(MNEMONIC, 6);
    }

    function _guard() internal view {
        require(address(PONS).code.length > 0, "run against a Robinhood Chain mainnet fork");
        // Anvil's first dev account only has ETH on a local fork.
        require(vm.addr(deployerPk).balance >= 1000 ether, "local fork only");
    }

    function _meta(string memory name, string memory symbol, string memory description)
        internal
        pure
        returns (PontoonLauncher.TokenMeta memory)
    {
        return PontoonLauncher.TokenMeta({
            name: name,
            symbol: symbol,
            logo: "",
            description: description,
            twitter: string.concat("https://x.com/", symbol),
            telegram: string.concat("https://t.me/", symbol),
            website: ""
        });
    }

    function run() external {
        _keys();
        _guard();
        address multisig = vm.addr(multisigPk);

        vm.startBroadcast(deployerPk);
        registry = new TokenRegistry(vm.addr(deployerPk));
        treasury = new PlatformTreasury(multisig);
        executor = new BuybackExecutor(multisig, registry);
        cto = new CTOManager(multisig, registry);
        launcher = new PontoonLauncher(
            multisig,
            PONS,
            registry,
            address(new FeeVault()),
            address(new HolderRewards()),
            address(executor),
            address(treasury),
            address(cto)
        );
        registry.setLauncher(address(launcher));
        registry.transferOwnership(multisig);
        vm.stopBroadcast();

        uint256 fee = launcher.launchFee();
        _launch(
            creatorAPk,
            _meta("Pontoon Alpha", "PALPHA", "The first raft on Robinhood Chain."),
            fee + 0.1 ether,
            false,
            4_000,
            2_000
        );
        _launch(creatorBPk, _meta("Nvidia Meme", "NVMEME", "GPUs go brrr."), fee, true, 6_000, 3_000);
        _launch(
            creatorAPk, _meta("Robin Hood Coin", "ROBIN", "Steal from the bears."), fee + 0.05 ether, true, 4_000, 2_000
        );
        _launch(stakerPk, _meta("Pontoon Dog", "PDOG", "Good boy, floats on every chain."), fee, false, 4_000, 2_000);
        _launch(ctoPk, _meta("Moon Raft", "MRAFT", "Paddling toward the moon."), fee, false, 4_000, 2_000);

        string memory o = "deployments";
        vm.serializeAddress(o, "PonsFactory", address(PONS));
        vm.serializeAddress(o, "PontoonLauncher", address(launcher));
        vm.serializeAddress(o, "TokenRegistry", address(registry));
        vm.serializeAddress(o, "BuybackExecutor", address(executor));
        vm.serializeAddress(o, "PlatformTreasury", address(treasury));
        vm.serializeAddress(o, "CTOManager", address(cto));
        vm.serializeUint(o, "startBlock", block.number);
        string memory json = vm.serializeAddress(o, "tokens", tokens);
        vm.createDir("./deployments", true);
        vm.writeJson(json, OUT);
        console2.log("written", OUT);
    }

    function _launch(
        uint256 pk,
        PontoonLauncher.TokenMeta memory meta,
        uint256 value,
        bool memestock,
        uint16 buybackBps,
        uint16 rewardBps
    ) internal {
        vm.broadcast(pk);
        (address t,) = launcher.launch{value: value}(meta, address(0), memestock, FeeConfig(buybackBps, rewardBps), 300);
        tokens.push(t);
    }

    function _load() internal {
        _keys();
        _guard();
        string memory json = vm.readFile(OUT);
        registry = TokenRegistry(vm.parseJsonAddress(json, ".TokenRegistry"));
        executor = BuybackExecutor(payable(vm.parseJsonAddress(json, ".BuybackExecutor")));
        cto = CTOManager(vm.parseJsonAddress(json, ".CTOManager"));
        treasury = PlatformTreasury(payable(vm.parseJsonAddress(json, ".PlatformTreasury")));
        tokens = vm.parseJsonAddressArray(json, ".tokens");
    }

    function _curve(address t) internal view returns (IPonsV2Curve) {
        return IPonsV2Curve(registry.getToken(t).curve);
    }

    function _buy(uint256 pk, address t, uint256 eth) internal {
        IPonsV2Curve c = _curve(t);
        address to = vm.addr(pk);
        vm.broadcast(pk);
        c.buy{value: eth}(eth, 1, to);
    }

    /// @notice Run after the snipe-tax window (a few seconds after `run`).
    function trade() external {
        _load();
        require(block.timestamp > _curve(tokens[0]).launchedAt() + 3, "advance time past the snipe tax first");
        address a = tokens[0];
        address b = tokens[1];

        // Real curve trades: creator tax + curve fees accrue for each token's FeeVault.
        _buy(stakerPk, a, 1 ether);
        _buy(keeperPk, a, 0.6 ether);
        _buy(ctoPk, b, 0.8 ether);
        for (uint256 i = 2; i < tokens.length; i++) {
            _buy(keeperPk, tokens[i], 0.2 ether * i);
        }
        // A sell.
        IPonsV2Curve ca = _curve(a);
        uint256 half = IERC20(a).balanceOf(vm.addr(keeperPk)) / 2;
        vm.startBroadcast(keeperPk);
        IERC20(a).approve(address(ca), half);
        ca.sell(half, 1, vm.addr(keeperPk));
        vm.stopBroadcast();

        // Stake, distribute (harvest + claim from Pons), buyback on the curve, claims.
        HolderRewards rewardsA = HolderRewards(payable(registry.getToken(a).holderRewards));
        uint256 stake = IERC20(a).balanceOf(vm.addr(stakerPk)) / 2;
        vm.startBroadcast(stakerPk);
        IERC20(a).approve(address(rewardsA), type(uint256).max);
        rewardsA.stake(stake);
        vm.stopBroadcast();

        vm.startBroadcast(keeperPk);
        for (uint256 i; i < tokens.length; i++) {
            FeeVault(payable(registry.getToken(tokens[i]).vault)).distribute();
        }
        uint256 amt = executor.pendingETH(a);
        uint256 cap = executor.maxBuyback(a);
        executor.buybackAndBurn(a, amt < cap ? amt : cap, 1);
        vm.stopBroadcast();

        vm.startBroadcast(stakerPk);
        rewardsA.claim();
        rewardsA.unstake(stake / 5);
        vm.stopBroadcast();
        FeeVault vaultA = FeeVault(payable(registry.getToken(a).vault));
        vm.broadcast(creatorAPk);
        vaultA.claimCreator();

        // Graduate token B on the real curve (fills the 4.2 ETH threshold -> Uniswap V4 pool).
        _buy(ctoPk, b, 4.5 ether);
        vm.startBroadcast(keeperPk);
        registry.markGraduated(b);
        if (executor.pendingETH(b) > 0) executor.redirectToRewards(b);
        vm.stopBroadcast();

        // Timelocked actions, finished in phase2.
        vm.broadcast(creatorAPk);
        vaultA.queueConfig(FeeConfig({buybackBps: 5_000, rewardBps: 1_000}));
        vm.broadcast(ctoPk);
        cto.requestCTO(b, vm.addr(ctoPk));
        vm.startBroadcast(multisigPk);
        cto.approveCTO(b);
        treasury.queueWithdraw(vm.addr(multisigPk), 0.001 ether);
        vm.stopBroadcast();
    }

    /// @notice Run after advancing anvil time by > 3 days.
    function phase2() external {
        _load();
        address a = tokens[0];
        address b = tokens[1];
        vm.startBroadcast(keeperPk);
        cto.executeCTO(b);
        FeeVault(payable(registry.getToken(a).vault)).applyConfig();
        vm.stopBroadcast();

        _buy(stakerPk, a, 0.5 ether);
        vm.startBroadcast(keeperPk);
        FeeVault(payable(registry.getToken(a).vault)).distribute();
        vm.stopBroadcast();

        vm.broadcast(multisigPk);
        treasury.withdraw(0);
    }
}
