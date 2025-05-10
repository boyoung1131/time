import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { Group, Identity, generateProof } from "@semaphore-protocol/core"
import { expect } from "chai"
import { run } from "hardhat"
// @ts-ignore: typechain folder will be generated after contracts compilation
import { Feedback, ISemaphore } from "../typechain-types"

describe("Feedback (3 candidates)", () => {
    async function deployFeedbackFixture() {
        const { semaphore } = await run("deploy:semaphore", { logs: false })

        const semaphoreContract: ISemaphore = semaphore

        const feedbackContract: Feedback = await run("deploy", {
            logs: false,
            semaphore: await semaphoreContract.getAddress()
        })

        const groupId = await feedbackContract.groupId()

        return { semaphoreContract, feedbackContract, groupId }
    }

    describe("# joinGroup", () => {
        it("Should allow users to join the group", async () => {
            const { semaphoreContract, feedbackContract, groupId } = await loadFixture(deployFeedbackFixture)

            const users = [new Identity(), new Identity()]
            const group = new Group()

            for (const [i, user] of users.entries()) {
                const tx = await feedbackContract.joinGroup(user.commitment)
                group.addMember(user.commitment)

                await expect(tx)
                    .to.emit(semaphoreContract, "MemberAdded")
                    .withArgs(groupId, i, user.commitment, group.root)
            }
        })
    })

    describe("# sendVote", () => {
        it("Should allow voting for candidate 3", async () => {
            const { semaphoreContract, feedbackContract, groupId } = await loadFixture(deployFeedbackFixture)

            const voter = new Identity()
            const group = new Group()

            await feedbackContract.joinGroup(voter.commitment)
            group.addMember(voter.commitment)

            const candidateId = 3
            const proof = await generateProof(voter, group, candidateId, groupId)

            const tx = feedbackContract.sendVote(
                proof.merkleTreeDepth,
                proof.merkleTreeRoot,
                proof.nullifier,
                candidateId,
                proof.points
            )

            await expect(tx)
                .to.emit(semaphoreContract, "ProofValidated")
                .withArgs(
                    groupId,
                    proof.merkleTreeDepth,
                    proof.merkleTreeRoot,
                    proof.nullifier,
                    candidateId,
                    groupId,
                    proof.points
                )

            const votes = await feedbackContract.getVotes(3)
            expect(votes).to.equal(1)

            const total = await feedbackContract.totalVotes()
            expect(total).to.equal(1)

            const winner = await feedbackContract.getFinalResult()
            expect(winner).to.equal(3)
        })

        it("Should reject invalid candidateId (e.g. 4)", async () => {
            const { feedbackContract, groupId } = await loadFixture(deployFeedbackFixture)

            const voter = new Identity()
            const group = new Group()

            await feedbackContract.joinGroup(voter.commitment)
            group.addMember(voter.commitment)

            const invalidCandidateId = 4
            const proof = await generateProof(voter, group, invalidCandidateId, groupId)

            await expect(
                feedbackContract.sendVote(
                    proof.merkleTreeDepth,
                    proof.merkleTreeRoot,
                    proof.nullifier,
                    invalidCandidateId,
                    proof.points
                )
            ).to.be.revertedWith("Invalid candidate")
        })

        it("Should reject duplicate votes (same nullifier)", async () => {
            const { feedbackContract, groupId } = await loadFixture(deployFeedbackFixture)

            const voter = new Identity()
            const group = new Group()

            await feedbackContract.joinGroup(voter.commitment)
            group.addMember(voter.commitment)

            const candidateId = 2
            const proof = await generateProof(voter, group, candidateId, groupId)

            await feedbackContract.sendVote(
                proof.merkleTreeDepth,
                proof.merkleTreeRoot,
                proof.nullifier,
                candidateId,
                proof.points
            )

            await expect(
                feedbackContract.sendVote(
                    proof.merkleTreeDepth,
                    proof.merkleTreeRoot,
                    proof.nullifier,
                    candidateId,
                    proof.points
                )
            ).to.be.revertedWith("Duplicate vote")
        })
    })
})
