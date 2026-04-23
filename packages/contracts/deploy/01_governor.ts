import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  let lockAddress = process.env.UNLOCK_PUBLIC_LOCK_ADDRESS;

  if (!lockAddress) {
    const mock = await deploy("MockPublicLock", { from: deployer, log: true });
    lockAddress = mock.address;
    console.log(`No UNLOCK_PUBLIC_LOCK_ADDRESS set; deployed MockPublicLock at ${lockAddress}`);
  }

  const votingPeriod = process.env.VOTING_PERIOD_BLOCKS ?? "7200";

  const governor = await deploy("UnlockConfidentialGovernor", {
    from: deployer,
    args: [lockAddress, votingPeriod],
    log: true,
  });

  console.log(
    `UnlockConfidentialGovernor: ${governor.address} ` + `(lock: ${lockAddress}, votingPeriod: ${votingPeriod} blocks)`,
  );

  const delegation = await deploy("LiquidDelegation", {
    from: deployer,
    args: [lockAddress],
    log: true,
  });

  console.log(`LiquidDelegation: ${delegation.address} (lock: ${lockAddress})`);

  const governorLiquid = await deploy("UnlockConfidentialGovernorLiquid", {
    from: deployer,
    args: [lockAddress, delegation.address, votingPeriod],
    log: true,
  });

  console.log(
    `UnlockConfidentialGovernorLiquid: ${governorLiquid.address} ` +
      `(lock: ${lockAddress}, delegation: ${delegation.address}, votingPeriod: ${votingPeriod} blocks)`,
  );
};

export default func;
func.id = "deploy_unlock_confidential_governor";
func.tags = ["UnlockConfidentialGovernor", "LiquidDelegation", "UnlockConfidentialGovernorLiquid"];
