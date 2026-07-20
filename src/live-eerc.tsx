import type { ReactNode } from "react";
import { useWriteContract } from "wagmi";
import { EERC, useEERC } from "@avalabs/eerc-sdk";
import type { Address, PublicClient, WalletClient } from "viem";
import type { ConnectState, LiveActions } from "./main";

type CircuitURLs = {
  register: { wasm: string; zkey: string };
  transfer: { wasm: string; zkey: string };
  mint: { wasm: string; zkey: string };
  withdraw: { wasm: string; zkey: string };
  burn: { wasm: string; zkey: string };
};

// The SDK exposes this data internally, but its auditor event lookup only
// searches a limited block range. Read the current on-chain configuration
// directly before decrypting so an older, correctly configured auditor works.
const auditorReadAbi = [
  {
    type: "function",
    name: "registrar",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "auditor",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "isConverter",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
] as const;

export default function LiveEercBridge({
  connection,
  publicClient,
  walletClient,
  contractAddress,
  underlyingToken,
  circuitURLs,
  decryptionKey,
  children,
}: {
  connection: ConnectState;
  publicClient: PublicClient;
  walletClient: WalletClient;
  contractAddress: Address;
  underlyingToken?: Address;
  circuitURLs: CircuitURLs;
  decryptionKey?: string;
  children: (live: LiveActions) => ReactNode;
}) {
  const eerc = useEERC(publicClient, walletClient, contractAddress, circuitURLs, decryptionKey);
  const encryptedBalance = eerc.useEncryptedBalance(underlyingToken);
  const { writeContractAsync } = useWriteContract();

  const decryptAsCurrentAuditor = async () => {
    const connectedAddress = walletClient.account?.address;
    if (!connectedAddress) {
      throw new Error("Connect the eERC auditor wallet first.");
    }
    if (!decryptionKey) {
      throw new Error("Unlock this encrypted wallet in Settings first.");
    }

    const [registrar, auditor, isConverter] = await Promise.all([
      publicClient.readContract({ address: contractAddress, abi: auditorReadAbi, functionName: "registrar" }),
      publicClient.readContract({ address: contractAddress, abi: auditorReadAbi, functionName: "auditor" }),
      publicClient.readContract({ address: contractAddress, abi: auditorReadAbi, functionName: "isConverter" }),
    ]);

    if (auditor.toLowerCase() !== connectedAddress.toLowerCase()) {
      throw new Error(`This wallet is not the configured eERC auditor (${auditor}).`);
    }

    const auditorEerc = new EERC(
      publicClient,
      walletClient,
      contractAddress,
      registrar,
      isConverter,
      circuitURLs,
      decryptionKey,
    );

    // We proved the current auditor against the contract above. Bypass only
    // the SDK's limited historical-event discovery guard, not authorization.
    Object.defineProperty(auditorEerc, "hasBeenAuditor", { value: async () => true });
    return auditorEerc.auditorDecrypt();
  };

  return children({ eerc, encryptedBalance, writeContractAsync, publicClient, decryptAsCurrentAuditor });
}
