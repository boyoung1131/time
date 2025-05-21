// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

contract Feedback {
    ISemaphore public semaphore;
    uint256 public groupId;
    uint256 public candidateCount;

    mapping(uint256 => mapping(uint256 => uint256)) public votes;
    mapping(uint256 => mapping(uint256 => bool)) public nullifiers;

    event VoteSubmitted(
        uint256 indexed roundId,
        uint256 indexed nullifier,
        uint256 candidateId1,
        uint256 candidateId2
    );

    constructor(address semaphoreAddress) {
        semaphore = ISemaphore(semaphoreAddress);
        candidateCount = 3;        // 固定候選人數
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
        require(!nullifiers[externalNullifier][nullifier], "Duplicate vote");

        uint256 candidateId1 = candidateId / 100;
        uint256 candidateId2 = candidateId % 100;

        require(candidateId1 >= 1 && candidateId1 <= candidateCount, "Invalid candidate 1");
        require(candidateId2 >= 1 && candidateId2 <= candidateCount, "Invalid candidate 2");

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

        votes[externalNullifier][candidateId1]++;
        votes[externalNullifier][candidateId2]++;

        emit VoteSubmitted(externalNullifier, nullifier, candidateId1, candidateId2);
    }
    //查詢某輪某候選人得票數
    function getVotes(uint256 roundId, uint256 candidateId) external view returns (uint256) {
        require(candidateId >= 1 && candidateId <= candidateCount, "Invalid candidate");
        return votes[roundId][candidateId];
    }
    //查詢某輪最高票的候選人
    function getFinalResult(uint256 roundId) external view returns (uint256 winnerId) {
        uint256 maxVotes;
        for (uint256 i = 1; i <= candidateCount; i++) {
            if (votes[roundId][i] > maxVotes) {
                maxVotes = votes[roundId][i];
                winnerId = i;
            }
        }
    }
    //查詢某輪所有候選人總得票數
    function totalVotes(uint256 roundId) external view returns (uint256 total) {
        for (uint256 i = 1; i <= candidateCount; i++) {
            total += votes[roundId][i];
        }
    }
}
