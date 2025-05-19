import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { Group, Identity, generateProof } from "@semaphore-protocol/core"
import { expect } from "chai"
import { run } from "hardhat"
// typechain
import { Feedback, ISemaphore } from "../typechain-types"

describe("Feedback (Multi-Round)", () => {
  async function deployFeedbackFixture() {
    // 部署 Semaphore
    const { semaphore } = await run("deploy:semaphore", { logs: false })
    const semaphoreContract: ISemaphore = semaphore

    // 部署 Feedback
    const feedbackContract: Feedback = await run("deploy", {
      logs: false,
      semaphore: await semaphoreContract.getAddress()
    })

    return { semaphoreContract, feedbackContract }
  }

  describe("Multi-round voting", () => {
    it("Should allow one vote in each round", async () => {
      const { semaphoreContract, feedbackContract } = await loadFixture(deployFeedbackFixture)

      const user = new Identity()
      const group = new Group()

      // 註冊到 on-chain group
      await feedbackContract.joinGroup(user.commitment)
      group.addMember(user.commitment)

      const candidate = 2

      // ---- Round 1 ----
      const round1 = 1
      const proof1 = await generateProof(
        user,
        group,
        candidate.toString(),  
        round1.toString()    
      )

      // 傳入 depth, root, nullifier, candidate, round, points
      await expect(
        feedbackContract.sendVote(
          proof1.merkleTreeDepth,
          proof1.merkleTreeRoot,
          proof1.nullifier,
          candidate,
          round1,
          proof1.points
        )
      )
      .to.emit(semaphoreContract, "ProofValidated")
      .withArgs(
        await feedbackContract.groupId(),
        proof1.merkleTreeDepth,
        proof1.merkleTreeRoot,
        proof1.nullifier,
        candidate,
        round1,
        proof1.points
      )

      // 讀回 Round1 的票數
      const votes1 = await feedbackContract.getVotes(round1, candidate)
      expect(votes1).to.equal(1)

      // ---- Round 2 ----
      const round2 = 2
      const proof2 = await generateProof(
        user,
        group,
        candidate.toString(),
        round2.toString()
      )

      await expect(
        feedbackContract.sendVote(
          proof2.merkleTreeDepth,
          proof2.merkleTreeRoot,
          proof2.nullifier,
          candidate,
          round2,
          proof2.points
        )
      ).to.emit(semaphoreContract, "ProofValidated")

      const votes2 = await feedbackContract.getVotes(round2, candidate)
      expect(votes2).to.equal(1)
    })

    it("Should reject duplicate vote in same round", async () => {
      const { feedbackContract } = await loadFixture(deployFeedbackFixture)

      const user = new Identity()
      const group = new Group()

      await feedbackContract.joinGroup(user.commitment)
      group.addMember(user.commitment)

      const candidate = 3
      const round1 = 1
      const proof = await generateProof(
        user,
        group,
        candidate.toString(),
        round1.toString()
      )

      // 第一次投票
      await feedbackContract.sendVote(
        proof.merkleTreeDepth,
        proof.merkleTreeRoot,
        proof.nullifier,
        candidate,
        round1,
        proof.points
      )

      // 第二次用同一 nullifier & 同一 round 要被拒
      await expect(
        feedbackContract.sendVote(
          proof.merkleTreeDepth,
          proof.merkleTreeRoot,
          proof.nullifier,
          candidate,
          round1,
          proof.points
        )
      ).to.be.revertedWith("Duplicate vote")
    })

    it("Should reject invalid candidateId", async () => {
      const { feedbackContract } = await loadFixture(deployFeedbackFixture)

      const user = new Identity()
      const group = new Group()

      await feedbackContract.joinGroup(user.commitment)
      group.addMember(user.commitment)

      const invalidCandidate = 99
      const round1 = 1
      const proof = await generateProof(
        user,
        group,
        invalidCandidate.toString(),
        round1.toString()
      )

      await expect(
        feedbackContract.sendVote(
          proof.merkleTreeDepth,
          proof.merkleTreeRoot,
          proof.nullifier,
          invalidCandidate,
          round1,
          proof.points
        )
      ).to.be.revertedWith("Invalid candidate")
    })
  })
})
