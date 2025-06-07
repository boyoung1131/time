// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

contract Feedback {
    ISemaphore public semaphore;
    uint256 public groupId;
    uint256 public candidateCount;
    uint256 public totalRounds;
    address public electionAuthority;

    uint256 public commitDuration;
    uint256 public revealDuration;
    uint256 public resultDuration;
    uint256 public startTimestamp;

    mapping(uint256 => uint256) public roundStartTime;

    mapping(uint256 => uint256[]) public revealedSalts;

    struct Commitment {
        uint256 voteHash;
        bool revealed;
    }

    mapping(uint256 => mapping(uint256 => Commitment)) public commitments;
    mapping(uint256 => mapping(uint256 => uint256)) public votes;
    mapping(uint256 => mapping(uint256 => bool)) public nullifiers;

    event VoteCommitted(uint256 indexed roundId, uint256 indexed nullifier, uint256 voteHash);
    event VoteSubmitted(uint256 indexed roundId, uint256 indexed nullifier, uint256 candidateId1, uint256 candidateId2);

    modifier onlyEA() {
        require(msg.sender == electionAuthority, "Not authorized");
        _;
    }

    constructor(address semaphoreAddress) {
        semaphore = ISemaphore(semaphoreAddress);
        groupId = semaphore.createGroup();
    }

    function initializeElection(
        uint256 _rounds,
        uint256 _candidates,
        uint256 _commitDuration,
        uint256 _revealDuration,
        uint256 _resultDuration,
        uint256 _startTimestamp
    ) external {
        require(electionAuthority == address(0), "Already initialized");
        require(_rounds > 0, "Rounds must be > 0");
        require(_candidates > 0, "Candidates must be > 0");

        electionAuthority = msg.sender;
        totalRounds = _rounds;
        candidateCount = _candidates;

        commitDuration = _commitDuration;
        revealDuration = _revealDuration;
        resultDuration = _resultDuration;

        for (uint256 i = 1; i <= _rounds; i++) {
            roundStartTime[i] = _startTimestamp + (i - 1) * (commitDuration + revealDuration + resultDuration);
        }
    }


    function getCurrentPhase(uint256 roundId) public view returns (string memory) {
        uint256 start = roundStartTime[roundId];
        require(start != 0, "Round not started");
        require(roundId >= 1 && roundId <= totalRounds, "Invalid round");

        uint256 elapsed = block.timestamp - start;

        if (elapsed < commitDuration) {
            return "commit";
        } else if (elapsed < commitDuration + revealDuration) {
            return "reveal";
        } else if (elapsed < commitDuration + revealDuration + resultDuration) {
            return "result";
        } else {
            return "ended";
        }
    }

    function joinGroup(uint256 identityCommitment) external {
        semaphore.addMember(groupId, identityCommitment);
    }

    function commitVote(
        uint256 merkleTreeDepth,
        uint256 merkleTreeRoot,
        uint256 nullifier,
        uint256 voteHash,
        uint256 externalNullifier,
        uint256[8] calldata points
    ) external {
        require(electionAuthority != address(0), "Election not initialized");
        require(externalNullifier >= 1 && externalNullifier <= totalRounds, "Invalid round");
        require(!nullifiers[externalNullifier][nullifier], "Already committed");

        require(
            keccak256(abi.encodePacked(getCurrentPhase(externalNullifier))) == keccak256(abi.encodePacked("commit")),
            "Not in commit phase"
        );

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
        require(electionAuthority != address(0), "Election not initialized");
        require(roundId >= 1 && roundId <= totalRounds, "Invalid round");

        require(
        keccak256(abi.encodePacked(getCurrentPhase(roundId))) == keccak256(abi.encodePacked("reveal")),
            "Not in reveal phase"
        );

        Commitment storage c = commitments[roundId][nullifier];
        require(!c.revealed, "Already revealed");

        uint256 computedHash = uint256(keccak256(abi.encodePacked(candidateId1, candidateId2, salt)));
        require(c.voteHash == computedHash, "Vote hash mismatch");

        require(candidateId1 >= 1 && candidateId1 <= candidateCount, "Invalid candidate 1");
        require(candidateId2 >= 1 && candidateId2 <= candidateCount, "Invalid candidate 2");

        votes[roundId][candidateId1]++;
        votes[roundId][candidateId2]++;
        c.revealed = true;

        revealedSalts[roundId].push(salt);
        emit VoteSubmitted(roundId, nullifier, candidateId1, candidateId2);
    }

    function getRevealedSalts(uint256 roundId) public view returns (uint256[] memory) {
        return revealedSalts[roundId];
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

    function getFinalResultTotal(uint256 upToRound) external view returns (uint256 winnerId, uint256[] memory totalVotesPerCandidate) {
        require(upToRound >= 1 && upToRound <= totalRounds, "Invalid round");
        totalVotesPerCandidate = new uint256[](candidateCount + 1);
        uint256 maxVotes;

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
