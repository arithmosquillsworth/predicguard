import { ethers } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  console.log('Deploying PredicGuardRiskManager contract...');

  const [deployer] = await ethers.getSigners();
  console.log('Deploying with account:', deployer.address);

  // Load audit contract address
  const deploymentsDir = path.join(__dirname, '../deployments');
  const auditDeployment = JSON.parse(
    fs.readFileSync(path.join(deploymentsDir, 'audit-contract.json'), 'utf-8')
  );

  console.log('Using audit contract:', auditDeployment.address);

  // Deploy contract
  const PredicGuardRiskManager = await ethers.getContractFactory('PredicGuardRiskManager');
  const riskManager = await PredicGuardRiskManager.deploy(auditDeployment.address);
  await riskManager.waitForDeployment();

  const address = await riskManager.getAddress();
  console.log('PredicGuardRiskManager deployed to:', address);

  // Save deployment info
  const deploymentInfo = {
    contract: 'PredicGuardRiskManager',
    address,
    auditContract: auditDeployment.address,
    deployer: deployer.address,
    timestamp: Date.now(),
    network: (await deployer.provider?.getNetwork())?.name || 'unknown'
  };

  fs.writeFileSync(
    path.join(deploymentsDir, 'risk-manager-contract.json'),
    JSON.stringify(deploymentInfo, null, 2)
  );

  // Authorize risk manager in audit contract
  const PredicGuardAudit = await ethers.getContractFactory('PredicGuardAudit');
  const audit = PredicGuardAudit.attach(auditDeployment.address);
  
  console.log('Authorizing risk manager in audit contract...');
  const tx = await audit.authorizeSubmitter(address);
  await tx.wait();
  console.log('Risk manager authorized');

  const network = await deployer.provider?.getNetwork();
  if (network?.chainId !== 1337n) {
    console.log('\nTo verify on explorer, run:');
    console.log(`npx hardhat verify --network ${network?.name} ${address} ${auditDeployment.address}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });