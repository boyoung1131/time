// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

contract Feedback {
    ISemaphore public semaphore;

    uint256 public groupId;
    uint256 public candidateCount;

    mapping(uint256 => uint256) public votes; // candidateId => vote count
    mapping(uint256 => bool) public nullifiers; // nullifier => used or not

    event VoteSubmitted(uint256 indexed nullifier, uint256 candidateId);

    constructor(address semaphoreAddress) {
        semaphore = ISemaphore(semaphoreAddress);
        candidateCount = 3; // ✅ 固定為 3 位候選人
        groupId = semaphore.createGroup();
    }

    function joinGroup(uint256 identityCommitment) external {
        semaphore.addMember(groupId, identityCommitment);
    }

    function sendVote(
        uint256 merkleTreeDepth,
        uint256 merkleTreeRoot,
        uint256 nullifier,
        uint256 candidateId,
        uint256[8] calldata points
    ) external {
        require(candidateId >= 1 && candidateId <= candidateCount, "Invalid candidate");
        require(!nullifiers[nullifier], "Duplicate vote");

        ISemaphore.SemaphoreProof memory proof = ISemaphore.SemaphoreProof(
            merkleTreeDepth,
            merkleTreeRoot,
            nullifier,
            candidateId,
            groupId,
            points
        );

        semaphore.validateProof(groupId, proof);

        nullifiers[nullifier] = true;
        votes[candidateId]++;

        emit VoteSubmitted(nullifier, candidateId);
    }

    function getFinalResult() external view returns (uint256 winnerId) {
        uint256 maxVotes = 0;
        uint256 winningCandidate = 0;

        for (uint256 i = 1; i <= candidateCount; i++) {
            if (votes[i] > maxVotes) {
                maxVotes = votes[i];
                winningCandidate = i;
            }
        }

        return winningCandidate;
    }

    function totalVotes() external view returns (uint256 total) {
        for (uint256 i = 1; i <= candidateCount; i++) {
            total += votes[i];
        }
    }

    function getVotes(uint256 candidateId) external view returns (uint256) {
        require(candidateId >= 1 && candidateId <= candidateCount, "Invalid candidate");
        return votes[candidateId];
    }
}
