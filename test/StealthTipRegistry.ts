import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

const { ethers } = await network.create();

describe("StealthTipRegistry", () => {
  it("registers a creator and records an eERC transfer reference", async () => {
    const [admin, sender, creator] = await ethers.getSigners();
    const registry = await ethers.deployContract("StealthTipRegistry", [admin.address]);

    await registry.setApprovedWallet(sender.address, true);
    await registry.setApprovedWallet(creator.address, true);
    await registry.connect(creator).registerCreator("alice");

    const reference = ethers.keccak256(ethers.toUtf8Bytes("fuji-eerc-transfer-hash"));
    await registry.connect(sender).recordTip("alice", reference, false);

    assert.equal(await registry.tipCount(), 1n);
    assert.equal(await registry.creatorForHandle("alice"), creator.address);
    assert.equal(await registry.recordedTransferReferences(reference), true);
    const tip = await registry.tips(1n);
    assert.equal(tip.sender, ethers.ZeroAddress);
    assert.equal(tip.senderRevealed, false);
  });

  it("rejects duplicate transfer references", async () => {
    const [admin, sender, creator] = await ethers.getSigners();
    const registry = await ethers.deployContract("StealthTipRegistry", [admin.address]);

    await registry.setApprovedWallet(sender.address, true);
    await registry.setApprovedWallet(creator.address, true);
    await registry.connect(creator).registerCreator("alice");

    const reference = ethers.keccak256(ethers.toUtf8Bytes("same-transfer"));
    await registry.connect(sender).recordTip("alice", reference, true);

    await assert.rejects(
      registry.connect(sender).recordTip("alice", reference, true),
      /ReferenceUsed/,
    );
  });
});
