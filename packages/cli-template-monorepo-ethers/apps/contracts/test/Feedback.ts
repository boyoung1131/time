import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { Group, Identity, generateProof } from "@semaphore-protocol/core"
import { expect } from "chai"
import { run } from "hardhat"
// typechain
import { Feedback, ISemaphore } from "../typechain-types"

describe("Feedback (Multi-Round)", () => {
  async function deployFeedbackFixture() {
    const { semaphore } = await run("deploy:semaphore", { logs: false })
    const semaphoreContract: ISemaphore = semaphore

    const feedbackContract: Feedback = await run("deploy", {
      logs: false,
      semaphore: await semaphoreContract.getAddress()
    })

    return { semaphoreContract, feedbackContract }
  }

  describe("Multi-round voting", () => {
    it("Should allow one vote in each round (dual-vote encoded)", async () => {
      const { semaphoreContract, feedbackContract } = await loadFixture(deployFeedbackFixture)

      const user = new Identity()
      const group = new Group()

      await feedbackContract.joinGroup(user.commitment)
      group.addMember(user.commitment)

      const candidate1 = 2
      const candidate2 = 3
      const encoded = candidate1 * 100 + candidate2 // encoded as 203

      // ---- Round 1 ----
      const round1 = 1
      const proof1 = await generateProof(
        user,
        group,
        encoded.toString(),
        round1.toString()
      )

      await expect(
        feedbackContract.sendVote(
          proof1.merkleTreeDepth,
          proof1.merkleTreeRoot,
          proof1.nullifier,
          encoded,
          round1,
          proof1.points
        )
      )
        .to.emit(semaphoreContract, "ProofValidated")

      const votes1_c1 = await feedbackContract.getVotes(round1, candidate1)
      const votes1_c2 = await feedbackContract.getVotes(round1, candidate2)
      expect(votes1_c1).to.equal(1)
      expect(votes1_c2).to.equal(1)

      // ---- Round 2 ----
      const round2 = 2
      const proof2 = await generateProof(
        user,
        group,
        encoded.toString(),
        round2.toString()
      )

      await expect(
        feedbackContract.sendVote(
          proof2.merkleTreeDepth,
          proof2.merkleTreeRoot,
          proof2.nullifier,
          encoded,
          round2,
          proof2.points
        )
      ).to.emit(semaphoreContract, "ProofValidated")

      const votes2_c1 = await feedbackContract.getVotes(round2, candidate1)
      const votes2_c2 = await feedbackContract.getVotes(round2, candidate2)
      expect(votes2_c1).to.equal(1)
      expect(votes2_c2).to.equal(1)
    })

    it("Should reject duplicate vote in same round", async () => {
      const { feedbackContract } = await loadFixture(deployFeedbackFixture)

      const user = new Identity()
      const group = new Group()

      await feedbackContract.joinGroup(user.commitment)
      group.addMember(user.commitment)

      const encoded = 303 // two votes for candidate 3
      const round1 = 1
      const proof = await generateProof(
        user,
        group,
        encoded.toString(),
        round1.toString()
      )

      await feedbackContract.sendVote(
        proof.merkleTreeDepth,
        proof.merkleTreeRoot,
        proof.nullifier,
        encoded,
        round1,
        proof.points
      )

      await expect(
        feedbackContract.sendVote(
          proof.merkleTreeDepth,
          proof.merkleTreeRoot,
          proof.nullifier,
          encoded,
          round1,
          proof.points
        )
      ).to.be.revertedWith("Duplicate vote")
    })

    it("Should reject invalid candidateId (decoded value out of range)", async () => {
      const { feedbackContract } = await loadFixture(deployFeedbackFixture)

      const user = new Identity()
      const group = new Group()

      await feedbackContract.joinGroup(user.commitment)
      group.addMember(user.commitment)

      const invalidEncoded = 105 // candidate 5 is out of range
      const round1 = 1
      const proof = await generateProof(
        user,
        group,
        invalidEncoded.toString(),
        round1.toString()
      )

      await expect(
        feedbackContract.sendVote(
          proof.merkleTreeDepth,
          proof.merkleTreeRoot,
          proof.nullifier,
          invalidEncoded,
          round1,
          proof.points
        )
      ).to.be.revertedWith("Invalid candidate 2")
    })
  })
})
