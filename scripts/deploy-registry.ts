import { network } from "hardhat";

const { ethers } = await network.create();
const [deployer] = await ethers.getSigners();
const networkInfo = await ethers.provider.getNetwork();

if (networkInfo.chainId !== 43113n) {
  throw new Error(`Refusing Fuji deployment on chain ${networkInfo.chainId}. Expected 43113.`);
}

const initialAdmin = process.env.INITIAL_ADMIN_ADDRESS || deployer.address;
const initialApprovedWallets = (process.env.INITIAL_APPROVED_WALLETS || "")
  .split(",")
  .map((wallet) => wallet.trim())
  .filter(Boolean);

if (!ethers.isAddress(initialAdmin) || initialAdmin === ethers.ZeroAddress) {
  throw new Error("INITIAL_ADMIN_ADDRESS must be a non-zero EVM address when provided.");
}

for (const wallet of initialApprovedWallets) {
  if (!ethers.isAddress(wallet) || wallet === ethers.ZeroAddress) {
    throw new Error(`INITIAL_APPROVED_WALLETS contains an invalid address: ${wallet}`);
  }
}

console.log(`Deploying StealthTipRegistry to Fuji from ${deployer.address}`);
console.log(`Initial registry admin: ${initialAdmin}`);

const registry = await ethers.deployContract("StealthTipRegistry", [initialAdmin]);
await registry.waitForDeployment();

const address = await registry.getAddress();
const deployment = await registry.deploymentTransaction()?.wait();

for (const wallet of [...new Set(initialApprovedWallets.map((wallet) => wallet.toLowerCase()))]) {
  if (wallet === initialAdmin.toLowerCase()) continue;
  const approval = await registry.setApprovedWallet(wallet, true);
  await approval.wait();
  console.log(`Approved registry wallet: ${wallet}`);
}

console.log(`StealthTipRegistry deployed: ${address}`);
console.log(`Deployment tx: ${deployment?.hash ?? "unknown"}`);
console.log(`Set VITE_TIP_REGISTRY_ADDRESS=${address}`);
