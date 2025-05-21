"use client"

import Stepper from "@/components/Stepper"
import { useLogContext } from "@/context/LogContext"
import { useSemaphoreContext } from "@/context/SemaphoreContext"
import { generateProof, Group } from "@semaphore-protocol/core"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import useSemaphoreIdentity from "@/hooks/useSemaphoreIdentity"
import { JsonRpcProvider, Contract } from "ethers"
import Feedback from "../../../contract-artifacts/Feedback.json"

export default function ProofsPage() {
  const router = useRouter()
  const { setLog } = useLogContext()
  const { _users, _feedback, refreshFeedback, addFeedback } = useSemaphoreContext()
  const [loading, setLoading] = useState(false)
  const { _identity } = useSemaphoreIdentity()
  const [round, setRound] = useState<"not-started" | "1" | "1-result" | "2" | "end">("not-started")
  const [timeLeft, setTimeLeft] = useState<string>("")
  const [votedRounds, setVotedRounds] = useState<number[]>([])

  // 新增：選擇兩票
  const [selectedCandidates, setSelectedCandidates] = useState<number[]>([])

  const [round1Votes, setRound1Votes] = useState<number[]>([])
  const [round1Visible, setRound1Visible] = useState(false)
  const [round1Loading, setRound1Loading] = useState(false)

  const [finalVotes, setFinalVotes] = useState<number[]>([])
  const [resultVisible, setResultVisible] = useState(false)
  const [resultLoading, setResultLoading] = useState(false)

  useEffect(() => {
    const startTimestamp = new Date("2025-05-21T17:40:00+08:00").getTime()
    const updateRound = () => {
      const now = Date.now()
      const elapsed = now - startTimestamp
      const minutesPassed = Math.floor(elapsed / 60000)

      if (elapsed < 0) {
        setRound("not-started")
        setTimeLeft("Not started")
        return
      }
      if (minutesPassed < 5) {
        setRound("1")
        setTimeLeft(`Voting ends in ${5 - minutesPassed}m`)
      } else if (minutesPassed < 7) {
        setRound("1-result")
        setTimeLeft(`View Round 1 Result (${7 - minutesPassed}m left)`)
      } else if (minutesPassed < 12) {
        setRound("2")
        setTimeLeft(`Round 2 ends in ${12 - minutesPassed}m`)
      } else {
        setRound("end")
        setTimeLeft("Voting ended")
      }
    }

    updateRound()
    const timer = setInterval(updateRound, 10000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (_feedback.length > 0) {
      setLog(`${_feedback.length} feedback retrieved from the group 🤙🏽`)
    }
  }, [_feedback, setLog])

  const feedback = useMemo(() => [..._feedback].reverse(), [_feedback])

  const toggleCandidate = useCallback((id: number) => {
    setSelectedCandidates(prev => {
      if (prev.includes(id)) {
        return prev.filter(c => c !== id)
      }
      if (prev.length < 2) {
        return [...prev, id]
      }
      return prev
    })
  }, [])

  const sendFeedbackWithCandidates = async () => {
    if (!(_identity && _users.length)) return
    if (loading || round === "end" || round === "1-result" || round === "not-started") return
    const roundNumber = parseInt(round, 10)
    if (votedRounds.includes(roundNumber)) return
    if (selectedCandidates.length !== 2) return

    setLoading(true)
    setLog("Posting your anonymous double-vote...")

    try {
      const [id1, id2] = selectedCandidates
      const encoded = id1 * 100 + id2

      const group = new Group(_users)
      const { points, merkleTreeDepth, merkleTreeRoot, nullifier } = await generateProof(
        _identity,
        group,
        encoded.toString(),
        round
      )

      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merkleTreeDepth,
          merkleTreeRoot,
          nullifier,
          candidateId: encoded,
          round: roundNumber,
          points
        })
      })

      if (response.ok) {
        addFeedback({ round: roundNumber, text: `Voted for #${id1} & #${id2}` })
        setVotedRounds(prev => [...prev, roundNumber])
        setSelectedCandidates([])
        setLog("Your votes have been posted 🎉")
      } else {
        setLog("Voting failed, please try again.")
      }
    } catch (err) {
      console.error("Voting error:", err)
      setLog("Some error occurred, please try again!")
    } finally {
      setLoading(false)
    }
  }

  // Round 1 结果
  const getRound1Result = async () => {
    setRound1Loading(true)
    try {
      const provider = new JsonRpcProvider("http://127.0.0.1:8545")
      const contract = new Contract(
        process.env.NEXT_PUBLIC_FEEDBACK_CONTRACT_ADDRESS!,
        Feedback.abi,
        provider
      )
      const votes: number[] = []
      for (let i = 1; i <= 3; i++) {
        const count = await contract.getVotes(1, i)
        votes.push(Number(count.toString()))
      }
      setRound1Votes(votes)
      setRound1Visible(true)
    } catch (e) {
      console.error("Get Round 1 Result Error:", e)
    } finally {
      setRound1Loading(false)
    }
  }

  // Final 结果
  const getFinalResult = async () => {
    setResultLoading(true)
    try {
      const provider = new JsonRpcProvider("http://127.0.0.1:8545")
      const contract = new Contract(
        process.env.NEXT_PUBLIC_FEEDBACK_CONTRACT_ADDRESS!,
        Feedback.abi,
        provider
      )
      const totalRounds = 2
      const votes: number[] = []
      for (let i = 1; i <= 3; i++) {
        let sum = 0
        for (let r = 1; r <= totalRounds; r++) {
          const count = await contract.getVotes(r, i)
          sum += Number(count.toString())
        }
        votes.push(sum)
      }
      setFinalVotes(votes)
      setResultVisible(true)
    } catch (e) {
      console.error("Get Final Result Error:", e)
    } finally {
      setResultLoading(false)
    }
  }

  return (
    <>
      <h2>Proofs</h2>
      <p>
        Semaphore members can anonymously{" "}
        <a
          href="https://docs.semaphore.pse.dev/guides/proofs"
          target="_blank"
          rel="noreferrer noopener"
        >
          prove
        </a>{" "}
        that they are part of a group and send anonymous votes.
      </p>
      <div className="divider" />

      <div className="text-top">
        <h3>Votes ({_feedback.length})</h3>
        <button className="refresh-button" onClick={refreshFeedback}>
          Refresh
        </button>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label>Current Round: </label>
        <select value={round} disabled>
          <option value="not-started">Not Started</option>
          <option value="1">Round 1</option>
          <option value="1-result">Round 1 Result</option>
          <option value="2">Round 2</option>
          <option value="end">Voting Ended</option>
        </select>
        <span style={{ marginLeft: "1rem", fontStyle: "italic" }}>
          ⏳ {timeLeft}
        </span>
      </div>

      {round === "not-started" && (
        <p style={{ color: "gray", fontStyle: "italic" }}>
          Voting hasn't started yet. Please wait...
        </p>
      )}

      <div style={{ marginBottom: "1rem" }}>
        <label>Select up to two candidates:</label>
        <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem" }}>
          {[1, 2, 3].map(id => (
            <button
              key={id}
              className={`button ${
                selectedCandidates.includes(id) ? "selected" : ""
              }`}
              disabled={
                loading ||
                round === "end" ||
                round === "1-result" ||
                round === "not-started" ||
                votedRounds.includes(parseInt(round, 10)) && !selectedCandidates.includes(id)
              }
              onClick={() => toggleCandidate(id)}
            >
              {selectedCandidates.includes(id) ? "✅" : "🗳️"} Candidate {id}
            </button>
          ))}
        </div>
      </div>
      
      {(round === "1" || round === "2") && (
        <button
          className="button"
          disabled={selectedCandidates.length !== 2 || loading}
          onClick={sendFeedbackWithCandidates}
        >
          {loading
            ? "Submitting..."
            : `Submit Votes (${selectedCandidates.join(" & ")})`}
        </button>
      )}

      {round === "1" && feedback.some(e => e.round === 1) && (
        <div
          className="fedback-wraper"
          style={{ maxHeight: 400, overflowY: "auto", marginTop: "1rem" }}
        >
          {feedback
            .filter(entry => entry.round === 1)
            .map((entry, i) => (
              <div key={i}>
                <p className="box box-text">
                  Round {entry.round}: {entry.text}
                </p>
              </div>
            ))}
        </div>
      )}

      {round === "2" && feedback.some(e => e.round === 2) && (
        <div
          className="fedback-wraper"
          style={{ maxHeight: 400, overflowY: "auto", marginTop: "1rem" }}
        >
          {feedback
            .filter(entry => entry.round === 2)
            .map((entry, i) => (
              <div key={i}>
                <p className="box box-text">
                  Round {entry.round}: {entry.text}
                </p>
              </div>
            ))}
        </div>
      )}

      {round === "1-result" && (
        <div style={{ marginTop: "2rem", marginBottom: "2rem" }}>
          <button onClick={getRound1Result} className="button">
            {round1Loading ? "Loading..." : "🔍 View Round 1"}
          </button>
          {round1Visible && round1Votes.length === 3 && (() => {
            const maxVotes = Math.max(...round1Votes);
            const winners = round1Votes
              .map((v, i) => ({ v, idx: i + 1 }))
              .filter(x => x.v === maxVotes)
              .map(x => x.idx);
            return (
              <p style={{ fontWeight: "bold", fontSize: "1.2rem" }}>
                🏆 {winners.length > 1 ? "Winners" : "Winner"}:{" "}
                {winners
                  .map((c, i) =>
                    i > 0 ? ` & Candidate ${c}` : `Candidate ${c}`
                  )
                  .join("")}
              </p>
              );
            })()}
          </div>
        )}

      {round === "end" && (
        <div style={{ marginTop: "2rem", marginBottom: "2rem" }}>
          <button onClick={getFinalResult} className="button">
            {resultLoading ? "Loading..." : "📢 Reveal Final"}
          </button>
          {resultVisible && finalVotes.length === 3 && (() => {
            const maxVotes = Math.max(...finalVotes);
            const winners = finalVotes
              .map((v, i) => ({ v, idx: i + 1 }))
              .filter(x => x.v === maxVotes)
              .map(x => x.idx);
            return (
              <>
                <p style={{ fontWeight: "bold", fontSize: "1.2rem" }}>
                  🏆 {winners.length > 1 ? "Winners" : "Winner"}:{" "}
                  {winners.map((c, i) =>
                    i > 0
                      ? ` & Candidate ${c}`
                      : `Candidate ${c}`
                  )}
                </p>
                <ul style={{ marginTop: "1rem" }}>
                  <li>Candidate 1: {finalVotes[0]}</li>
                  <li>Candidate 2: {finalVotes[1]}</li>
                  <li>Candidate 3: {finalVotes[2]}</li>
                </ul>
              </>
            );
          })()}
        </div>
      )}
      <div className="divider" />
      <Stepper step={3} onPrevClick={() => router.push("/group")} />
    </>
  )
} 