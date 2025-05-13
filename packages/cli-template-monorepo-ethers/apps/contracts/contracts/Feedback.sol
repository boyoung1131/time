// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

contract Feedback {
    ISemaphore public semaphore;

    uint256 public groupId;
    uint256 public candidateCount;

    mapping(uint256 => mapping(uint256 => uint256)) public votes;
    mapping(uint256 => mapping(uint256 => bool)) public nullifiers;

    event VoteSubmitted(uint256 indexed roundId, uint256 indexed nullifier, uint256 candidateId);

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
        uint256 externalNullifier,
        uint256[8] calldata points
    ) external {
        require(candidateId >= 1 && candidateId <= candidateCount, "Invalid candidate");
        require(!nullifiers[externalNullifier][nullifier], "Duplicate vote");

        ISemaphore.SemaphoreProof memory proof = ISemaphore.SemaphoreProof(
            merkleTreeDepth,
            merkleTreeRoot,
            nullifier,
            candidateId,
            externalNullifier,
            points
        );

        semaphore.validateProof(groupId, proof);

        nullifiers[externalNullifier][nullifier] = true;
        votes[externalNullifier][candidateId]++;

        emit VoteSubmitted(externalNullifier, nullifier, candidateId);
    }

    function getVotes(uint256 roundId, uint256 candidateId) external view returns (uint256) {
        require(candidateId >= 1 && candidateId <= candidateCount, "Invalid candidate");
        return votes[roundId][candidateId];
    }

    function getFinalResult(uint256 roundId) external view returns (uint256 winnerId) {
        uint256 maxVotes;
        uint256 winner;
        for (uint256 i = 1; i <= candidateCount; i++) {
            if (votes[roundId][i] > maxVotes) {
                maxVotes = votes[roundId][i];
                winner = i;
            }
        }
        return winner;
    }

    function totalVotes(uint256 roundId) external view returns (uint256 total) {
        for (uint256 i = 1; i <= candidateCount; i++) {
            total += votes[roundId][i];
        }
    }
}
