"use client"

import Stepper from "@/components/Stepper"
import { useLogContext } from "@/context/LogContext"
import { useSemaphoreContext } from "@/context/SemaphoreContext"
import { generateProof, Group } from "@semaphore-protocol/core"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import useSemaphoreIdentity from "@/hooks/useSemaphoreIdentity"
import { keccak256, AbiCoder } from "ethers"

export default function ProofsPage() {
    const router = useRouter()
    const { setLog } = useLogContext()
    const {
        _users,
        _feedback,
        addFeedback,
        refreshFeedback,
        votes,
        winner,
        currentRound,
        setCurrentRound,
        commitDuration,
        revealDuration,
        resultDuration,
        refreshVotes,
        setVotes,
        getWinner
    } = useSemaphoreContext()

    const { _identity } = useSemaphoreIdentity()
    const [phase, setPhase] = useState<string>("not-started")
    const [timeLeft, setTimeLeft] = useState<string>("")
    const [loading, setLoading] = useState(false)
    const [selectedCandidates, setSelectedCandidates] = useState<number[]>([])
    const [salt, setSalt] = useState<string>("")
    const [revealedRounds, setRevealedRounds] = useState<number[]>([])
    const [votedRounds, setVotedRounds] = useState<number[]>([])
    const [revealedSalts, setRevealedSalts] = useState<string[]>([])
    // 動態參數
    const [candidateCount, setCandidateCount] = useState<number>(0)
    const [totalRounds, setTotalRounds] = useState<number>(0)
    const [commitTime, setCommitTime] = useState<number>(5)
    const [revealTime, setRevealTime] = useState<number>(5)
    const [resultTime, setResultTime] = useState<number>(2)
    const [startTimestamp, setStartTimestamp] = useState<number>(2)
    // 讀取初始化設定
    useEffect(() => {
        fetch("/api/election/start")
            .then((res) => res.json())
            .then((data) => {
                if (!data.initialized) return router.push("/ea")
                setCandidateCount(data.candidateCount)
                setTotalRounds(data.totalRounds)
                setCommitTime(data.commitTime)
                setRevealTime(data.revealTime)
                setResultTime(data.resultTime)
                setStartTimestamp(data.startTimestamp)
            })
    }, [])

    useEffect(() => {
        const update = () => {
            const now = Date.now()
            const elapsedMs = now - startTimestamp
            const cycleMs = (commitTime + revealTime + resultTime) * 60 * 1000
            if (elapsedMs < 0) {
                setPhase("not-started")
                setTimeLeft("Voting not started")
                return
            }
            const round = Math.floor(elapsedMs / cycleMs) + 1
            if (round > totalRounds) {
                setPhase(`r${totalRounds}-result`)
                setTimeLeft("Voting completed")
                return
            }
            setCurrentRound(round)
            const withinMs = elapsedMs % cycleMs
            const commitMs = commitTime * 60 * 1000
            const revealMs = revealTime * 60 * 1000
            const resultMs = resultTime * 60 * 1000

            if (withinMs < commitMs) {
                setPhase(`r${round}-commit`)
                setTimeLeft(`${Math.ceil((commitMs - withinMs) / 60000)}m left to commit`)
            } else if (withinMs < commitMs + revealMs) {
                setPhase(`r${round}-reveal`)
                setTimeLeft(`${Math.ceil((commitMs + revealMs - withinMs) / 60000)}m left to reveal`)
            } else {
                setPhase(`r${round}-result`)
                setTimeLeft(`${Math.ceil((cycleMs - withinMs) / 60000)}m until next round`)
            }
        }
        if (startTimestamp === 0) return
        update()
        const timer = setInterval(update, 10000)
        return () => clearInterval(timer)
    }, [totalRounds, commitTime, revealTime, resultTime, startTimestamp])
    useEffect(() => {
        setSelectedCandidates([])
        if (phase.includes("-commit")) {
            setSalt("")
        }
    }, [phase, currentRound])

    // 結果階段抓票並決定勝者
    useEffect(() => {
        if (phase.endsWith("-result")) {
            fetch(`/api/feedback?round=${currentRound}`)
                .then((r) => r.json())
                .then((data) => {
                    setRevealedSalts(data.salts)
                })
            getWinner(currentRound)
        }
    }, [phase, currentRound])

    const getVoteHash = (c1: number, c2: number, salt: string) => {
        const sorted = [c1, c2].sort((a, b) => a - b)
        const encoded = AbiCoder.defaultAbiCoder().encode(
            ["uint256", "uint256", "uint256"],
            [sorted[0], sorted[1], salt]
        )
        return keccak256(encoded)
    }

    const toggleCandidate = (id: number) => {
        setSelectedCandidates((prev) => {
            const count = prev.filter((x) => x === id).length

            if (count === 2) {
                return prev.filter((x) => x !== id)
            }
            const updated = [...prev, id]
            // 保證最多兩票：從頭開始砍掉多的
            while (updated.length > 2) {
                updated.shift()
            }
            return updated
        })
    }

    const commitVote = async () => {
        if (!_identity || selectedCandidates.length !== 2 || votedRounds.includes(currentRound)) return
        setLoading(true)
        try {
            const sorted = [...selectedCandidates].sort((a, b) => a - b)
            const voteHash = getVoteHash(sorted[0], sorted[1], salt)
            const group = new Group(_users)
            const proof = await generateProof(_identity, group, voteHash, currentRound.toString())
            const res = await fetch("/api/feedback", {
                method: "POST",
                body: JSON.stringify({
                    merkleTreeDepth: proof.merkleTreeDepth,
                    merkleTreeRoot: proof.merkleTreeRoot,
                    nullifier: proof.nullifier,
                    voteHash,
                    round: currentRound,
                    points: proof.points
                }),
                headers: { "Content-Type": "application/json" }
            })
            if (res.ok) {
                setVotedRounds((prev) => [...prev, currentRound])
                setSelectedCandidates([])
                setLog("Vote committed!")
                await refreshVotes()
            } else {
                const msg = await res.text()
                setLog(msg.includes("Duplicate") ? "❌ You already voted in this round." : "❌ Commit failed.")
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const revealVote = async () => {
        if (!_identity || selectedCandidates.length !== 2 || !salt || revealedRounds.includes(currentRound)) return
        setLoading(true)
        try {
            const sorted = [...selectedCandidates].sort((a, b) => a - b)
            const group = new Group(_users)
            const voteHash = getVoteHash(sorted[0], sorted[1], salt)
            const proof = await generateProof(_identity, group, voteHash, currentRound.toString())
            const res = await fetch("/api/feedback", {
                method: "POST",
                body: JSON.stringify({
                    round: currentRound,
                    nullifier: proof.nullifier,
                    candidateId1: sorted[0],
                    candidateId2: sorted[1],
                    salt
                }),
                headers: { "Content-Type": "application/json" }
            })
            if (res.ok) {
                setRevealedRounds((prev) => [...prev, currentRound])
                addFeedback({ round: currentRound, text: `Voted for #${sorted[0]} & #${sorted[1]}` })
                setLog("Vote revealed!")
                await refreshVotes()
            } else {
                const msg = await res.text()
                setLog(msg.includes("Duplicate") ? "❌ You already revealed in this round." : "❌ Reveal failed.")
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const renderResults = () => {
        if (!votes || votes.length === 0) {
            return <p className="text-lg text-gray-400">⚠️ No votes recorded yet.</p>
        }

        const maxV = Math.max(...votes)
        const winners = votes
            .map((v, i) => ({ v, id: i + 1 }))
            .filter((x) => x.v === maxV && maxV > 0)
            .map((x) => x.id)

        return (
            <div>
                {/* 顯示勝者資訊 */}
                <p className="text-lg font-semibold">
                    {winners.length > 0
                        ? currentRound < totalRounds
                            ? `🏆 Round ${currentRound} Winner: Candidate ${winners.join(", ")}`
                            : `🏆 Final Winner${winners.length > 1 ? "s" : ""}: ${winners.map((i) => `Candidate ${i}`).join(" & ")}`
                        : `🏆 Round ${currentRound} Winner: (no winner)`}
                </p>

                {/* 顯示票數（僅在最後一輪） */}
                {currentRound === totalRounds && (
                    <ul className="mt-2">
                        {[...Array(candidateCount)].map((_, i) => (
                            <li key={i}>
                                Candidate {i + 1}: {votes[i] ?? 0} votes
                            </li>
                        ))}
                    </ul>
                )}

                {/* Revealed salts */}
                <div style={{ marginTop: "2rem" }}>
                    <p className="text-lg font-semibold">🧾 Revealed Salts in Round {currentRound}</p>
                    <div
                        style={{
                            maxHeight: "150px",
                            overflowY: "auto",
                            border: "1px solid #ccc",
                            padding: "0.5rem",
                            borderRadius: "8px",
                            backgroundColor: "#f9f9f9"
                        }}
                    >
                        <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
                            {revealedSalts.length > 0 ? (
                                revealedSalts.map((s, i) => <li key={i}>Salt: {s}</li>)
                            ) : (
                                <li>No salts revealed yet</li>
                            )}
                        </ul>
                    </div>
                </div>
            </div>
        )
    }

    const buttons = Array.from({ length: candidateCount }, (_, i) => i + 1)

    return (
        <>
            <h2>Proofs</h2>
            <div className="divider" />
            <div className="text-top">
                <h3>Votes ({_feedback.length})</h3>
                <button className="refresh-button" onClick={refreshFeedback}>
                    Refresh
                </button>
            </div>

            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "1.1rem",
                    fontWeight: "500",
                    marginBottom: "1rem"
                }}
            >
                <span>⏳ {timeLeft}</span>
                <span>🌀 Phase: {phase}</span>
            </div>

            {(phase.includes("commit") || phase.includes("reveal")) && (
                <>
                    <div style={{ marginBottom: "1rem" }}>
                        <label>Select 2 candidates:</label>
                        <div
                            style={{
                                display: "grid",
                                gap: "1rem",
                                marginTop: "0.5rem",
                                gridTemplateColumns: "repeat(3, minmax(0, 1fr))"
                            }}
                        >
                            {buttons.map((id) => {
                                const selectedCount = selectedCandidates.filter((x) => x === id).length
                                return (
                                    <button
                                        key={id}
                                        onClick={() => toggleCandidate(id)}
                                        disabled={
                                            loading ||
                                            (phase.includes("commit") && votedRounds.includes(currentRound)) ||
                                            (phase.includes("reveal") && revealedRounds.includes(currentRound))
                                        }
                                        className={`button ${selectedCount > 0 ? "selected" : ""}`}
                                    >
                                        {selectedCount === 2 ? "✅✅" : selectedCount === 1 ? "✅" : "📦"} Candidate{" "}
                                        {id}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {phase.includes("commit") && (
                        <>
                            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                                <input
                                    type="text"
                                    placeholder="Enter salt"
                                    value={salt}
                                    readOnly
                                    className="input"
                                    style={{ flex: 1 }}
                                />
                                <button
                                    onClick={() => {
                                        const newSalt = Math.floor(100000 + Math.random() * 900000).toString()
                                        localStorage.setItem(`salt-round-${currentRound}`, newSalt)
                                        setSalt(newSalt)
                                    }}
                                    disabled={loading || votedRounds.includes(currentRound)}
                                    className="button"
                                >
                                    🎲 Generate Salt
                                </button>
                            </div>
                            <button
                                onClick={commitVote}
                                disabled={selectedCandidates.length !== 2 || !salt || loading}
                                className="button"
                            >
                                {loading ? "Committing..." : "🔐 Commit Vote"}
                            </button>
                        </>
                    )}

                    {/* Reveal 階段 */}
                    {phase.includes("reveal") && (
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
                            <input
                                type="text"
                                placeholder="Reveal salt"
                                value={salt}
                                onChange={(e) => setSalt(e.target.value)}
                                className="input"
                                style={{ width: "200px", height: "40px" }}
                            />
                            <button
                                className="button"
                                disabled={selectedCandidates.length !== 2 || !salt || loading}
                                onClick={revealVote}
                            >
                                {loading ? "Revealing..." : "📢 Reveal Vote"}
                            </button>
                        </div>
                    )}
                </>
            )}

            {phase.endsWith("-result") && <div style={{ marginTop: "3rem" }}>{renderResults()}</div>}

            <div className="divider" />
            <Stepper step={3} onPrevClick={() => router.push("/group")} />
        </>
    )
}
