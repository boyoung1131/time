"use client"

import Stepper from "@/components/Stepper"
import { useLogContext } from "@/context/LogContext"
import { useSemaphoreContext } from "@/context/SemaphoreContext"
import { generateProof, Group } from "@semaphore-protocol/core"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
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
        refreshVotes,
        getWinner
    } = useSemaphoreContext()

    const { _identity } = useSemaphoreIdentity()
    const [phase, setPhase] = useState<"not-started" | "r1-commit" | "r1-reveal" | "r1-result" | "r2-commit" | "r2-reveal" | "r2-result">("not-started")
    const [timeLeft, setTimeLeft] = useState<string>("")
    const [loading, setLoading] = useState(false)
    const [selectedCandidates, setSelectedCandidates] = useState<number[]>([])
    const [salt, setSalt] = useState<string>("")
    const [revealedRounds, setRevealedRounds] = useState<number[]>([])
    const [votedRounds, setVotedRounds] = useState<number[]>([])

    const feedback = useMemo(() => [..._feedback].reverse(), [_feedback])
    const getVoteHash = (c1: number, c2: number, salt: string) => {
    const sorted = [c1, c2].sort((a, b) => a - b)
    const coder = AbiCoder.defaultAbiCoder()
    const encoded = coder.encode(["uint256", "uint256", "uint256"], [sorted[0], sorted[1], salt])
    return keccak256(encoded)
}

  useEffect(() => {
    setSelectedCandidates([])
    setSalt("")
  }, [phase])

  useEffect(() => {
    const startTimestamp = new Date("2025-05-22T17:53:00+08:00").getTime()
    const updatePhase = () => {
      const now = Date.now()
      const elapsed = now - startTimestamp
      const min = Math.floor(elapsed / 60000)

      if (elapsed < 0) {
        setPhase("not-started")
        setTimeLeft("Voting not started")
        return
      }
      if (min < 5) {
        setPhase("r1-commit")
        setCurrentRound(1)
        setTimeLeft(`${5 - min}m left to commit`)
      } else if (min < 10) {
        setPhase("r1-reveal")
        setCurrentRound(1)
        setTimeLeft(`${10 - min}m left to reveal`)
      } else if (min < 12) {
        setPhase("r1-result")
        setCurrentRound(1)
        setTimeLeft("Displaying R1 result")
      } else if (min < 17) {
        setPhase("r2-commit")
        setCurrentRound(2)
        setTimeLeft(`${17 - min}m left to commit`)
      } else if (min < 22) {
        setPhase("r2-reveal")
        setCurrentRound(2)
        setTimeLeft(`${22 - min}m left to reveal`)
      } else if (min < 24) {
        setPhase("r2-result")
        setCurrentRound(2)
        setTimeLeft("Final result")
      } else {
        setPhase("r2-result")
        setTimeLeft("Voting completed")
      }
    }
    updatePhase()
    const timer = setInterval(updatePhase, 10000)
    return () => clearInterval(timer)
  }, [setCurrentRound])

  useEffect(() => {
    if (phase.includes("reveal")) {
        const saved = localStorage.getItem(`salt-round-${currentRound}`)
        if (saved) {
        setSalt(saved)
        }
    }
    }, [phase, currentRound])


  const toggleCandidate = useCallback((id: number) => {
    setSelectedCandidates(prev =>
      prev.includes(id) ? prev.filter(c => c !== id)
        : prev.length < 2 ? [...prev, id] : prev
    )
  }, [])

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
        setVotedRounds(prev => [...prev, currentRound])
        setSelectedCandidates([])
        setLog("Vote committed!")

        await refreshVotes()
      }else {
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
        setRevealedRounds(prev => [...prev, currentRound])
        addFeedback({ round: currentRound, text: `Voted for #${sorted[0]} & #${sorted[1]}` })
        setLog("Vote revealed!")

        await refreshVotes()
      }else {
        const msg = await res.text()
        setLog(msg.includes("Duplicate") ? "❌ You already voted in this round." : "❌ Commit failed.")
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const renderResults = () => {
    if (phase === "r1-result" && currentRound === 1) {
      const maxVotes = Math.max(...votes)
      const winners = votes.map((v, i) => ({ v, i: i + 1 })).filter(x => x.v === maxVotes)
      return (
        <>
          <p style={{ fontWeight: "bold", fontSize: "1.2rem" }}>
            🏆 R1 Winner{winners.length > 1 ? "s" : ""}:{" "}
            {winners.map(w => `Candidate ${w.i}`).join(" & ")}
          </p>

        </>
      )
    }

    if (phase === "r2-result" && currentRound === 2) {
      const maxVotes = Math.max(...votes)
      const winners = votes.map((v, i) => ({ v, i: i + 1 })).filter(x => x.v === maxVotes)
      return (
        <>
          <p style={{ fontWeight: "bold", fontSize: "1.2rem" }}>
            🏆 Final Winner{winners.length > 1 ? "s" : ""}:{" "}
            {winners.map(w => `Candidate ${w.i}`).join(" & ")}
          </p>
          <ul>
            {votes.map((v, i) => (
              <li key={i}>Candidate {i + 1}: {v}</li>
            ))}
          </ul>
        </>
      )
    }

    return null
  }

  return (
    <>
      <h2>Proofs</h2>
      <div className="divider" />
      <div className="text-top">
        <h3>Votes ({_feedback.length})</h3>
        <button className="refresh-button" onClick={refreshFeedback}>Refresh</button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "1.1rem", fontWeight: "500", marginBottom: "1rem" }}>
        <span>⏳ {timeLeft}</span>
        <span>🌀 Phase: {phase}</span>
      </div>

      {(phase.includes("commit") || phase.includes("reveal")) && (
        <>
            <div style={{ marginBottom: "1rem" }}>
                <label>Select 2 candidates:</label>
                <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem" }}>
                {[1, 2, 3].map(id => (
                    <button
                    key={id}
                    className={`button ${selectedCandidates.includes(id) ? "selected" : ""}`}
                    disabled={loading}
                    onClick={() => toggleCandidate(id)}
                    >
                    {selectedCandidates.includes(id) ? "✅" : "🗳️"} Candidate {id}
                    </button>
                ))}
                </div>
            </div>

            {phase.includes("commit") && (
            <>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <input
                    type="text"
                    placeholder="Enter salt"
                    value={salt}
                    onChange={(e) => setSalt(e.target.value)}
                    className="input"
                    style={{ flex: 1 }}
                />
                <button
                    className="button"
                    onClick={() => {
                    const newSalt = Math.floor(100000 + Math.random() * 900000).toString()
                    localStorage.setItem(`salt-round-${currentRound}`, newSalt)
                    setSalt(newSalt)
                    }}
                >
                    🎲 Generate Salt
                </button>
                </div>
                <button
                className="button"
                disabled={selectedCandidates.length !== 2 || !salt || loading}
                onClick={commitVote}
                >
                {loading ? "Committing..." : "🔐 Commit Vote"}
                </button>
            </>
            )}


          {phase.includes("reveal") && (
            <>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
                <input
                  type="text"
                  placeholder="Reveal salt"
                  value={salt}
                  onChange={(e) => setSalt(e.target.value)}
                  className="input"
                  style={{ flex: 1 }}
                />
                <button
                  className="button"
                  disabled={selectedCandidates.length !== 2 || !salt || loading}
                  onClick={revealVote}
                >
                  {loading ? "Revealing..." : "📢 Reveal Vote"}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {!phase.includes("commit") || phase.includes("reveal") && feedback.some(f => f.round === currentRound) && (
        <div
          className="fedback-wraper"
          style={{
            marginTop: "1rem",
            maxHeight: "200px",
            overflowY: "auto",
            paddingRight: "0.5rem",
            border: "1px solid #444",
            borderRadius: "6px"
          }}
        >
          {feedback
            .filter(f => f.round === currentRound)
            .map((entry, i) => (
              <p key={i} className="box box-text" style={{ margin: "0.5rem 0" }}>
                Round {entry.round}: {entry.text}
              </p>
            ))}
        </div>
      )}

      {(phase === "r1-result" || phase === "r2-result") && (
        <div style={{ marginTop: "2rem" }}>
          {renderResults()}
        </div>
      )}

      <div className="divider" />
      <Stepper step={3} onPrevClick={() => router.push("/group")} />
    </>
  )
}
