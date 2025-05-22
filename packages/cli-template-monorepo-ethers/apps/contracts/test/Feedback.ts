import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { Group, Identity, generateProof } from "@semaphore-protocol/core"
import { expect } from "chai"
import { run, ethers } from "hardhat"
import { Feedback, ISemaphore } from "../typechain-types"
import { keccak256, AbiCoder } from "ethers"

describe("Feedback (Multi-Round + Commit/Reveal)", () => {
  async function deployFeedbackFixture() {
    const { semaphore } = await run("deploy:semaphore", { logs: false })
    const semaphoreContract: ISemaphore = semaphore

    const feedbackContract: Feedback = await run("deploy", {
      logs: false,
      semaphore: await semaphoreContract.getAddress()
    })

    return { semaphoreContract, feedbackContract }
  }

  function generateVoteHash(c1: number, c2: number, salt: number): string {
    const sorted = [c1, c2].sort((a, b) => a - b)
    const coder = AbiCoder.defaultAbiCoder()
    const encoded = coder.encode(
      ["uint256", "uint256", "uint256"],
      [sorted[0], sorted[1], salt]
    )
    return keccak256(encoded)
  }

  describe("Multi-round commit/reveal", () => {
    it("Should allow vote reveal in each round", async () => {
      const { feedbackContract } = await loadFixture(deployFeedbackFixture)

      const user = new Identity()
      const group = new Group()
      await feedbackContract.joinGroup(user.commitment)
      group.addMember(user.commitment)

      const c1 = 2, c2 = 3, salt = 12345
      const round1 = 1, round2 = 2
      const voteHash = generateVoteHash(c1, c2, salt)

      const proof1 = await generateProof(user, group, voteHash, round1.toString())
      await feedbackContract.commitVote(
        proof1.merkleTreeDepth,
        proof1.merkleTreeRoot,
        proof1.nullifier,
        voteHash,
        round1,
        proof1.points
      )
      await feedbackContract.revealVote(round1, proof1.nullifier, c1, c2, salt)
      expect(await feedbackContract.getVotes(round1, c1)).to.equal(1)
      expect(await feedbackContract.getVotes(round1, c2)).to.equal(1)

      const proof2 = await generateProof(user, group, voteHash, round2.toString())
      await feedbackContract.commitVote(
        proof2.merkleTreeDepth,
        proof2.merkleTreeRoot,
        proof2.nullifier,
        voteHash,
        round2,
        proof2.points
      )
      await feedbackContract.revealVote(round2, proof2.nullifier, c1, c2, salt)
      expect(await feedbackContract.getVotes(round2, c1)).to.equal(1)
      expect(await feedbackContract.getVotes(round2, c2)).to.equal(1)
    })

    it("Should reject duplicate reveal", async () => {
      const { feedbackContract } = await loadFixture(deployFeedbackFixture)
      const user = new Identity()
      const group = new Group()
      await feedbackContract.joinGroup(user.commitment)
      group.addMember(user.commitment)

      const c1 = 2, c2 = 3, salt = 999, round = 1
      const voteHash = generateVoteHash(c1, c2, salt)
      const proof = await generateProof(user, group, voteHash, round.toString())

      await feedbackContract.commitVote(proof.merkleTreeDepth, proof.merkleTreeRoot, proof.nullifier, voteHash, round, proof.points)
      await feedbackContract.revealVote(round, proof.nullifier, c1, c2, salt)

      await expect(
        feedbackContract.revealVote(round, proof.nullifier, c1, c2, salt)
      ).to.be.revertedWith("Already revealed")
    })

    it("Should reject mismatched reveal hash", async () => {
      const { feedbackContract } = await loadFixture(deployFeedbackFixture)
      const user = new Identity()
      const group = new Group()
      await feedbackContract.joinGroup(user.commitment)
      group.addMember(user.commitment)

      const voteHash = generateVoteHash(1, 2, 123)
      const round = 1
      const proof = await generateProof(user, group, voteHash, round.toString())

      await feedbackContract.commitVote(proof.merkleTreeDepth, proof.merkleTreeRoot, proof.nullifier, voteHash, round, proof.points)

      await expect(
        feedbackContract.revealVote(round, proof.nullifier, 1, 2, 999)
      ).to.be.revertedWith("Vote hash mismatch")
    })

    it("Should reject invalid candidate ID", async () => {
      const { feedbackContract } = await loadFixture(deployFeedbackFixture)
      const user = new Identity()
      const group = new Group()
      await feedbackContract.joinGroup(user.commitment)
      group.addMember(user.commitment)

      const round = 1, salt = 1
      const invalidVote = generateVoteHash(1, 99, salt) // 99 is invalid
      const proof = await generateProof(user, group, invalidVote, round.toString())

      await feedbackContract.commitVote(proof.merkleTreeDepth, proof.merkleTreeRoot, proof.nullifier, invalidVote, round, proof.points)

      await expect(
        feedbackContract.revealVote(round, proof.nullifier, 1, 99, salt)
      ).to.be.revertedWith("Invalid candidate 2")
    })
  })
})
