import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { Group, Identity, generateProof } from "@semaphore-protocol/core";
import { expect } from "chai";
import { run, ethers ,network} from "hardhat";
import { Feedback, ISemaphore } from "../typechain-types";
import { keccak256, AbiCoder } from "ethers";

describe("Feedback (Multi-Round + Commit/Reveal)", () => {
  async function deployFeedbackFixture() {
    const { semaphore } = await run("deploy:semaphore", { logs: false });
    const semaphoreContract: ISemaphore = semaphore;

    const feedbackContract: Feedback = await run("deploy", {
      logs: false,
      semaphore: await semaphoreContract.getAddress(),
    });

    const rounds = 2;
    const candidates = 3;
    const commitSecs = 5 * 60;
    const revealSecs = 5 * 60;
    const resultSecs = 2 * 60;
    await feedbackContract.initializeElection(rounds, candidates, commitSecs, revealSecs, resultSecs);

    return { semaphoreContract, feedbackContract };
  }

  function generateVoteHash(c1: number, c2: number, salt: number): string {
    const sorted = [c1, c2].sort((a, b) => a - b);
    const coder = AbiCoder.defaultAbiCoder();
    const encoded = coder.encode(["uint256", "uint256", "uint256"], [sorted[0], sorted[1], salt]);
    return keccak256(encoded);
  }

  describe("Phase transitions", () => {
    it("should correctly report voting phase transitions over time", async () => {
      const { feedbackContract } = await deployFeedbackFixture();
      const roundId = 1;

      expect(await feedbackContract.getCurrentPhase(roundId)).to.equal("commit");
      await time.increase(300 + 1);
      await network.provider.send("evm_mine");
      expect(await feedbackContract.getCurrentPhase(roundId)).to.equal("reveal");

      await time.increase(300 + 1);
      await network.provider.send("evm_mine");
      expect(await feedbackContract.getCurrentPhase(roundId)).to.equal("result");

      await time.increase(120 + 1);
      await network.provider.send("evm_mine");
      expect(await feedbackContract.getCurrentPhase(roundId)).to.equal("ended");
    });

    it("should allow EA to manually start a new round and restrict others", async () => {
      const { feedbackContract } = await deployFeedbackFixture();
      const round1 = 1;
      const round2 = 2;

      expect(await feedbackContract.getCurrentPhase(round1)).to.equal("commit");
      await expect(feedbackContract.getCurrentPhase(round2)).to.be.revertedWith("Round not started");

      await feedbackContract.startRound(round2);
      expect(await feedbackContract.getCurrentPhase(round2)).to.equal("commit");

      const [EA, nonEA] = await ethers.getSigners();
      await expect(feedbackContract.connect(nonEA).startRound(round2)).to.be.revertedWith("Not authorized");
    });
  });

  describe("Multi-round commit/reveal", () => {
    it("Should allow vote reveal in each round", async () => {
      const { feedbackContract } = await deployFeedbackFixture();
      const user = new Identity();
      const group = new Group();
      await feedbackContract.joinGroup(user.commitment);
      group.addMember(user.commitment);

      const c1 = 2, c2 = 3, salt = 12345;
      const voteHash = generateVoteHash(c1, c2, salt);

      const proof1 = await generateProof(user, group, voteHash, "1");
      await feedbackContract.commitVote(proof1.merkleTreeDepth, proof1.merkleTreeRoot, proof1.nullifier, voteHash, 1, proof1.points);
      await feedbackContract.revealVote(1, proof1.nullifier, c1, c2, salt);
      expect(await feedbackContract.getVotes(1, c1)).to.equal(1);
      expect(await feedbackContract.getVotes(1, c2)).to.equal(1);

      const proof2 = await generateProof(user, group, voteHash, "2");
      await feedbackContract.startRound(2);
      await feedbackContract.commitVote(proof2.merkleTreeDepth, proof2.merkleTreeRoot, proof2.nullifier, voteHash, 2, proof2.points);
      await feedbackContract.revealVote(2, proof2.nullifier, c1, c2, salt);
      expect(await feedbackContract.getVotes(2, c1)).to.equal(1);
      expect(await feedbackContract.getVotes(2, c2)).to.equal(1);
    });

    it("Should reject duplicate reveal", async () => {
      const { feedbackContract } = await deployFeedbackFixture();
      const user = new Identity();
      const group = new Group();
      await feedbackContract.joinGroup(user.commitment);
      group.addMember(user.commitment);

      const voteHash = generateVoteHash(2, 3, 999);
      const proof = await generateProof(user, group, voteHash, "1");

      await feedbackContract.commitVote(proof.merkleTreeDepth, proof.merkleTreeRoot, proof.nullifier, voteHash, 1, proof.points);
      await feedbackContract.revealVote(1, proof.nullifier, 2, 3, 999);

      await expect(feedbackContract.revealVote(1, proof.nullifier, 2, 3, 999)).to.be.revertedWith("Already revealed");
    });

    it("Should reject mismatched reveal hash", async () => {
      const { feedbackContract } = await deployFeedbackFixture();
      const user = new Identity();
      const group = new Group();
      await feedbackContract.joinGroup(user.commitment);
      group.addMember(user.commitment);

      const voteHash = generateVoteHash(1, 2, 123);
      const proof = await generateProof(user, group, voteHash, "1");

      await feedbackContract.commitVote(proof.merkleTreeDepth, proof.merkleTreeRoot, proof.nullifier, voteHash, 1, proof.points);
      await expect(feedbackContract.revealVote(1, proof.nullifier, 1, 2, 999)).to.be.revertedWith("Vote hash mismatch");
    });

    it("Should reject invalid candidate ID", async () => {
      const { feedbackContract } = await deployFeedbackFixture();
      const user = new Identity();
      const group = new Group();
      await feedbackContract.joinGroup(user.commitment);
      group.addMember(user.commitment);

      const voteHash = generateVoteHash(1, 99, 1);
      const proof = await generateProof(user, group, voteHash, "1");

      await feedbackContract.commitVote(proof.merkleTreeDepth, proof.merkleTreeRoot, proof.nullifier, voteHash, 1, proof.points);
      await expect(feedbackContract.revealVote(1, proof.nullifier, 1, 99, 1)).to.be.revertedWith("Invalid candidate 2");
    });

    it("Should correctly determine winner by round and total", async () => {
      const { feedbackContract } = await deployFeedbackFixture();
      const user = new Identity();
      const group = new Group();
      await feedbackContract.joinGroup(user.commitment);
      group.addMember(user.commitment);

      const salt1 = 111;
      const voteHash1 = generateVoteHash(2, 3, salt1);
      const proof1 = await generateProof(user, group, voteHash1, "1");
      await feedbackContract.commitVote(proof1.merkleTreeDepth, proof1.merkleTreeRoot, proof1.nullifier, voteHash1, 1, proof1.points);
      await feedbackContract.revealVote(1, proof1.nullifier, 2, 3, salt1);

      const salt2 = 222;
      const voteHash2 = generateVoteHash(2, 2, salt2);
      const proof2 = await generateProof(user, group, voteHash2, "2");
      await feedbackContract.startRound(2);
      await feedbackContract.commitVote(proof2.merkleTreeDepth, proof2.merkleTreeRoot, proof2.nullifier, voteHash2, 2, proof2.points);
      await feedbackContract.revealVote(2, proof2.nullifier, 2, 2, salt2);

      const winnerR1 = await feedbackContract.getFinalResult(1);
      expect([2, 3]).to.include(Number(winnerR1));

      const [winnerTotal, voteTotals] = await feedbackContract.getFinalResultTotal(2);
      expect(winnerTotal).to.equal(2);
      expect(voteTotals[2]).to.equal(3);
    });
  });
});

