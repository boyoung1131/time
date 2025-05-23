// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

contract Feedback {
    ISemaphore public semaphore;
    uint256 public groupId;
    uint256 public candidateCount;

    struct Commitment {
        uint256 voteHash;  // keccak256(candidateId1, candidateId2, salt)
        bool revealed;
    }

    mapping(uint256 => mapping(uint256 => Commitment)) public commitments;
    // roundId => nullifier => Commitment

    mapping(uint256 => mapping(uint256 => uint256)) public votes;
    // roundId => candidateId => vote count

    mapping(uint256 => mapping(uint256 => bool)) public nullifiers;
    // roundId => nullifier => used or not

    event VoteCommitted(uint256 indexed roundId, uint256 indexed nullifier, uint256 voteHash);
    event VoteSubmitted(uint256 indexed roundId, uint256 indexed nullifier, uint256 candidateId1, uint256 candidateId2);

    constructor(address semaphoreAddress) {
        semaphore = ISemaphore(semaphoreAddress);
        candidateCount = 3;
        groupId = semaphore.createGroup();
    }

    function joinGroup(uint256 identityCommitment) external {
        semaphore.addMember(groupId, identityCommitment);
    }

    function commitVote(
        uint256 merkleTreeDepth,
        uint256 merkleTreeRoot,
        uint256 nullifier,
        uint256 voteHash,
        uint256 externalNullifier, // roundId
        uint256[8] calldata points
    ) external {
        require(!nullifiers[externalNullifier][nullifier], "Already committed");

        ISemaphore.SemaphoreProof memory proof = ISemaphore.SemaphoreProof(
            merkleTreeDepth,
            merkleTreeRoot,
            nullifier,
            voteHash,
            externalNullifier,
            points
        );
        semaphore.validateProof(groupId, proof);

        commitments[externalNullifier][nullifier] = Commitment({
            voteHash: voteHash,
            revealed: false
        });

        nullifiers[externalNullifier][nullifier] = true;
        emit VoteCommitted(externalNullifier, nullifier, voteHash);
    }

    function revealVote(
        uint256 roundId,
        uint256 nullifier,
        uint256 candidateId1,
        uint256 candidateId2,
        uint256 salt
    ) external {
        Commitment storage c = commitments[roundId][nullifier];
        require(!c.revealed, "Already revealed");

        uint256 computedHash = uint256(keccak256(abi.encodePacked(candidateId1, candidateId2, salt)));
        require(c.voteHash == computedHash, "Vote hash mismatch");

        require(candidateId1 >= 1 && candidateId1 <= candidateCount, "Invalid candidate 1");
        require(candidateId2 >= 1 && candidateId2 <= candidateCount, "Invalid candidate 2");

        votes[roundId][candidateId1]++;
        votes[roundId][candidateId2]++;
        c.revealed = true;

        emit VoteSubmitted(roundId, nullifier, candidateId1, candidateId2);
    }

    function getVotes(uint256 roundId, uint256 candidateId) external view returns (uint256) {
        require(candidateId >= 1 && candidateId <= candidateCount, "Invalid candidate");
        return votes[roundId][candidateId];
    }

    function getFinalResult(uint256 roundId) external view returns (uint256 winnerId) {
        uint256 maxVotes;
        for (uint256 i = 1; i <= candidateCount; i++) {
            if (votes[roundId][i] > maxVotes) {
                maxVotes = votes[roundId][i];
                winnerId = i;
            }
        }
    }

    function totalVotes(uint256 roundId) external view returns (uint256 total) {
        for (uint256 i = 1; i <= candidateCount; i++) {
            total += votes[roundId][i];
        }
    }

    function getFinalResultTotal(uint256 upToRound) external view returns (uint256 winnerId, uint256[] memory totalVotesPerCandidate) {
        totalVotesPerCandidate = new uint256[](candidateCount + 1); // index from 1
        uint256 maxVotes = 0;

        for (uint256 round = 1; round <= upToRound; round++) {
            for (uint256 candidate = 1; candidate <= candidateCount; candidate++) {
                totalVotesPerCandidate[candidate] += votes[round][candidate];
                if (totalVotesPerCandidate[candidate] > maxVotes) {
                    maxVotes = totalVotesPerCandidate[candidate];
                    winnerId = candidate;
                }
            }
        }
    }
}