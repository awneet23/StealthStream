import { Base8, addPoint, inCurve, mulPointEscalar, type Point } from "@zk-kit/baby-jubjub";
import { poseidonEncrypt } from "@zk-kit/poseidon-cipher";
import createBlakeHash from "blake-hash";
import { poseidon3, poseidon5 } from "poseidon-lite";
import { groth16 } from "snarkjs";
import type { Abi, Address, PublicClient } from "viem";

const subgroupOrder = 2736030358979909402780800718157159386076813972158567259200215660948447373041n;

const eercReadAbi = [
  { type: "function", name: "registrar", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "auditorPublicKey",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "tuple", components: [{ name: "x", type: "uint256" }, { name: "y", type: "uint256" }] }],
  },
] as const;

const registrarAbi = [{
  type: "function",
  name: "getUserPublicKey",
  stateMutability: "view",
  inputs: [{ name: "user", type: "address" }],
  outputs: [{ type: "tuple", components: [{ name: "x", type: "uint256" }, { name: "y", type: "uint256" }] }],
}] as const;

export const registrarRegisterAbi: Abi = [{
  type: "function",
  name: "register",
  stateMutability: "nonpayable",
  inputs: [{
    name: "proof",
    type: "tuple",
    components: [
      {
        name: "proofPoints",
        type: "tuple",
        components: [
          { name: "a", type: "uint256[2]" },
          { name: "b", type: "uint256[2][2]" },
          { name: "c", type: "uint256[2]" },
        ],
      },
      { name: "publicSignals", type: "uint256[5]" },
    ],
  }],
  outputs: [],
}] as const;

// This ABI intentionally uses the no-message overload. StealthStream stores
// only the eERC transaction reference in its own registry, so a second
// encrypted metadata payload is unnecessary for demo funding.
export const eercPrivateMintAbi: Abi = [{
  type: "function",
  name: "privateMint",
  stateMutability: "nonpayable",
  inputs: [
    { name: "user", type: "address" },
    {
      name: "proof",
      type: "tuple",
      components: [
        {
          name: "proofPoints",
          type: "tuple",
          components: [
            { name: "a", type: "uint256[2]" },
            { name: "b", type: "uint256[2][2]" },
            { name: "c", type: "uint256[2]" },
          ],
        },
        { name: "publicSignals", type: "uint256[24]" },
      ],
    },
  ],
  outputs: [],
}] as const;

type CircuitFiles = { wasm: string; zkey: string };
type ContractProof = {
  proofPoints: { a: [bigint, bigint]; b: [[bigint, bigint], [bigint, bigint]]; c: [bigint, bigint] };
  publicSignals: bigint[];
};

type RegistrationProof = {
  proofPoints: ContractProof["proofPoints"];
  publicSignals: bigint[];
  registrarAddress: Address;
};

function randomBigInt(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return BigInt(`0x${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`);
}

// Rejection sampling keeps the ElGamal scalar in the BabyJubJub subgroup.
function randomScalar() {
  const limit = (1n << 256n) - ((1n << 256n) % subgroupOrder);
  let value = 0n;
  do value = randomBigInt(32); while (value >= limit);
  return value % subgroupOrder;
}

function randomNonce() {
  return randomBigInt(16) + 1n;
}

function encryptAmount(publicKey: Point<bigint>, amount: bigint) {
  const random = randomScalar();
  const messagePoint = mulPointEscalar(Base8, amount);
  const c1 = mulPointEscalar(Base8, random);
  const shared = mulPointEscalar(publicKey, random);
  const c2 = addPoint(messagePoint, shared);
  return { random, c1, c2 };
}

function encryptPCT(publicKey: Point<bigint>, amount: bigint) {
  const encryptionRandom = randomScalar();
  const nonce = randomNonce();
  const encryptionKey = mulPointEscalar(publicKey, encryptionRandom);
  const authKey = mulPointEscalar(Base8, encryptionRandom);
  const cipher = poseidonEncrypt([amount], encryptionKey, nonce) as bigint[];
  return { cipher, nonce, authKey, encryptionRandom };
}

function asPoint(point: readonly [bigint, bigint] | { x: bigint; y: bigint }): Point<bigint> {
  if (typeof point === "object" && point !== null && "x" in point) return [point.x, point.y];
  return [point[0], point[1]];
}

function toContractProof(calldata: string): ContractProof {
  const [a, b, c, publicSignals] = JSON.parse(`[${calldata}]`) as [string[], string[][], string[], string[]];
  return {
    proofPoints: {
      a: [BigInt(a[0]), BigInt(a[1])],
      b: [[BigInt(b[0][0]), BigInt(b[0][1])], [BigInt(b[1][0]), BigInt(b[1][1])]],
      c: [BigInt(c[0]), BigInt(c[1])],
    },
    publicSignals: publicSignals.map((value) => BigInt(value)),
  };
}

function formatKeyForCurve(key: string) {
  const digest = createBlakeHash("blake512").update(Buffer.from(key, "hex")).digest().subarray(0, 32);
  const pruned = Uint8Array.from(digest);
  pruned[0] = (pruned[0] ?? 0) & 0xf8;
  pruned[31] = ((pruned[31] ?? 0) & 0x7f) | 0x40;
  const littleEndian = Uint8Array.from(pruned).reverse();
  return (BigInt(`0x${Buffer.from(littleEndian).toString("hex")}`) >> 3n) % subgroupOrder;
}

export async function createOfficialRegistrationProof({
  publicClient,
  eercAddress,
  walletAddress,
  decryptionKey,
  circuit,
}: {
  publicClient: PublicClient;
  eercAddress: Address;
  walletAddress: Address;
  decryptionKey: string;
  circuit: CircuitFiles;
}): Promise<RegistrationProof> {
  const [registrarAddress, chainId] = await Promise.all([
    publicClient.readContract({ address: eercAddress, abi: eercReadAbi, functionName: "registrar" }),
    publicClient.getChainId(),
  ]);
  const privateKey = formatKeyForCurve(decryptionKey);
  const publicKey = mulPointEscalar(Base8, privateKey);
  const addressValue = BigInt(walletAddress);
  const registrationHash = poseidon3([BigInt(chainId), privateKey, addressValue].map(String));
  const input = {
    SenderPrivateKey: privateKey,
    SenderPublicKey: publicKey,
    SenderAddress: addressValue,
    ChainID: BigInt(chainId),
    RegistrationHash: registrationHash,
  };
  const { proof, publicSignals } = await groth16.fullProve(input, circuit.wasm, circuit.zkey);
  const parsed = toContractProof(await groth16.exportSolidityCallData(proof, publicSignals));
  return { ...parsed, registrarAddress };
}

export async function createOfficialMintProof({
  publicClient,
  eercAddress,
  recipient,
  amount,
  circuit,
}: {
  publicClient: PublicClient;
  eercAddress: Address;
  recipient: Address;
  amount: bigint;
  circuit: CircuitFiles;
}): Promise<ContractProof> {
  const registrarAddress = await publicClient.readContract({ address: eercAddress, abi: eercReadAbi, functionName: "registrar" });
  const [recipientKeyRaw, auditorKeyRaw, chainId] = await Promise.all([
    publicClient.readContract({ address: registrarAddress, abi: registrarAbi, functionName: "getUserPublicKey", args: [recipient] }),
    publicClient.readContract({ address: eercAddress, abi: eercReadAbi, functionName: "auditorPublicKey" }),
    publicClient.getChainId(),
  ]);
  const recipientKey = asPoint(recipientKeyRaw);
  const auditorKey = asPoint(auditorKeyRaw);
  if (recipientKey[0] === 0n && recipientKey[1] === 0n) {
    throw new Error(`The recipient is not registered with this eERC Registrar: ${registrarAddress}`);
  }
  if (!inCurve(recipientKey)) throw new Error(`The recipient's BabyJubJub key is invalid in eERC Registrar: ${registrarAddress}`);
  if (!inCurve(auditorKey)) throw new Error("The eERC auditor public key is invalid or has not been set.");

  const receiverValue = encryptAmount(recipientKey, amount);
  const receiverPCT = encryptPCT(recipientKey, amount);
  const auditorPCT = encryptPCT(auditorKey, amount);
  const nullifierHash = poseidon5([BigInt(chainId), ...auditorPCT.cipher].map(String));
  const input = {
    ValueToMint: amount,
    ChainID: BigInt(chainId),
    NullifierHash: nullifierHash,
    ReceiverPublicKey: recipientKey,
    ReceiverVTTC1: receiverValue.c1,
    ReceiverVTTC2: receiverValue.c2,
    ReceiverVTTRandom: receiverValue.random,
    ReceiverPCT: receiverPCT.cipher,
    ReceiverPCTAuthKey: receiverPCT.authKey,
    ReceiverPCTNonce: receiverPCT.nonce,
    ReceiverPCTRandom: receiverPCT.encryptionRandom,
    AuditorPublicKey: auditorKey,
    AuditorPCT: auditorPCT.cipher,
    AuditorPCTAuthKey: auditorPCT.authKey,
    AuditorPCTNonce: auditorPCT.nonce,
    AuditorPCTRandom: auditorPCT.encryptionRandom,
  };
  const { proof, publicSignals } = await groth16.fullProve(input, circuit.wasm, circuit.zkey);
  return toContractProof(await groth16.exportSolidityCallData(proof, publicSignals));
}
