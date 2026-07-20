import { network } from "hardhat";

const { ethers } = await network.create();
const networkInfo = await ethers.provider.getNetwork();

if (networkInfo.chainId !== 43113n) {
  throw new Error(`Refusing creator registration on chain ${networkInfo.chainId}. Expected Fuji 43113.`);
}

const registryAddress = process.env.TIP_REGISTRY_ADDRESS || process.env.VITE_TIP_REGISTRY_ADDRESS;
const handle = process.env.CREATOR_HANDLE?.trim();

if (!registryAddress || !ethers.isAddress(registryAddress)) {
  throw new Error("Set TIP_REGISTRY_ADDRESS (or VITE_TIP_REGISTRY_ADDRESS) to the deployed registry address.");
}
if (!handle) {
  throw new Error("Set CREATOR_HANDLE, for example CREATOR_HANDLE=@alice_streams.");
}

const [creator] = await ethers.getSigners();
const registry = await ethers.getContractAt("StealthTipRegistry", registryAddress, creator);

if (!(await registry.approvedWallets(creator.address))) {
  throw new Error(`Creator wallet ${creator.address} is not approved. Add it to INITIAL_APPROVED_WALLETS and redeploy, or approve it from the registry owner wallet.`);
}

console.log(`Registering ${handle} from ${creator.address}`);
const tx = await registry.registerCreator(handle);
const receipt = await tx.wait();

console.log(`Creator registered: ${handle}`);
console.log(`Registration tx: ${receipt?.hash ?? tx.hash}`);
