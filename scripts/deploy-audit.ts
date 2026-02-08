import { ethers } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('Deploying PredicGuardAudit contract...');

  const [deployer] = await ethers.getSigners();
  console.log('Deploying with account:', deployer.address);

  const balance = await deployer.provider?.getBalance(deployer.address);
  console.log('Account balance:', ethers.formatEther(balance || 0n), 'ETH');

  // Deploy contract
  const PredicGuardAudit = await ethers.getContractFactory('PredicGuardAudit');
  const audit = await PredicGuardAudit.deploy();
  await audit.waitForDeployment();

  const address = await audit.getAddress();
  console.log('PredicGuardAudit deployed to:', address);

  // Save deployment info
  const deploymentInfo = {
    contract: 'PredicGuardAudit',
    address,
    deployer: deployer.address,
    timestamp: Date.now(),
    network: (await deployer.provider?.getNetwork())?.name || 'unknown'
  };

  const deploymentsDir = path.join(__dirname, '../deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(deploymentsDir, 'audit-contract.json'),
    JSON.stringify(deploymentInfo, null, 2)
  );

  // Verify on explorer (if not local)
  const network = await deployer.provider?.getNetwork();
  if (network?.chainId !== 1337n) {
    console.log('\nTo verify on explorer, run:');
    console.log(`npx hardhat verify --network ${network?.name} ${address}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });