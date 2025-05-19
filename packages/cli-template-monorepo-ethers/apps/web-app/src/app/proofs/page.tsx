"use client"

import Stepper from "@/components/Stepper"
import { useLogContext } from "@/context/LogContext"
import { useSemaphoreContext } from "@/context/SemaphoreContext"
import { generateProof, Group } from "@semaphore-protocol/core"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import useSemaphoreIdentity from "@/hooks/useSemaphoreIdentity"

export default function ProofsPage() {
  const router = useRouter()
  const { setLog } = useLogContext()
  const { _users, _feedback, refreshFeedback, addFeedback } = useSemaphoreContext()
  const [loading, setLoading] = useState(false)
  const { _identity } = useSemaphoreIdentity()
  const [candidateId, setCandidateId] = useState(1)
  const [round, setRound] = useState<"1" | "2" | "end">("1")
  const [timeLeft, setTimeLeft] = useState<string>("")

  useEffect(() => {
    const startTimestamp = new Date("2025-05-19T15:35:00+08:00").getTime()
    const roundDurationMs = 5 * 60 * 1000

    const updateRound = () => {
      const now = Date.now()
      const elapsed = now - startTimestamp

      if (elapsed < 0) {
        setRound("1")
        setTimeLeft("Not started")
        return
      }

      const roundIndex = Math.floor(elapsed / roundDurationMs)
      const currentRound = roundIndex + 1

      if (currentRound === 1 || currentRound === 2) {
        setRound(currentRound.toString() as "1" | "2")
        const nextRoundStart = startTimestamp + (roundIndex + 1) * roundDurationMs
        const remaining = nextRoundStart - now
        const minutes = Math.floor(remaining / 60000)
        const seconds = Math.floor((remaining % 60000) / 1000)
        setTimeLeft(`${minutes}:${seconds.toString().padStart(2, "0")}`)
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

  const sendFeedback = useCallback(async () => {
    if (!(_identity && _users.length)) return

    setLoading(true)
    setLog("Posting your anonymous votes...")

    try {
      const group = new Group(_users)

      const { points, merkleTreeDepth, merkleTreeRoot, nullifier } =
        await generateProof(
          _identity,
          group,
          candidateId.toString(),
          round
        )

      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merkleTreeDepth,
          merkleTreeRoot,
          nullifier,
          candidateId,
          points,
          round: parseInt(round, 10)
        })
      })

      if (response.ok) {
        addFeedback({ round: parseInt(round, 10), text: `Voted for #${candidateId}` })

        const text = await response.text()
        if (text.includes("Candidate")) {
          addFeedback({ round: parseInt(round, 10), text })
        }

        setLog("Your votes have been posted 🎉")
      } else {
        setLog("Some error occurred while voting, please try again!")
      }
    } catch (err) {
      console.error("Voting error:", err)
      setLog("Some error occurred, please try again!")
    } finally {
      setLoading(false)
    }
  }, [_identity, _users, candidateId, round, addFeedback, setLog])

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

      {/* 顯示當前輪次與倒數時間 */}
      <div style={{ marginBottom: "1rem" }}>
        <label>Current Round: </label>
        <select value={round} disabled>
          <option value="1">Round 1</option>
          <option value="2">Round 2</option>
          <option value="end">Voting Ended</option>
        </select>
        <span style={{ marginLeft: "1rem", fontStyle: "italic" }}>⏳ {timeLeft}</span>
      </div>

      {/* 候選人選擇 */}
      <div style={{ marginBottom: "1rem" }}>
        <label>Select Candidate: </label>
        <select
          value={candidateId}
          onChange={e => setCandidateId(parseInt(e.target.value, 10))}
        >
          <option value={1}>Candidate 1</option>
          <option value={2}>Candidate 2</option>
          <option value={3}>Candidate 3</option>
        </select>
      </div>

      {/* 歷史投票紀錄 */}
      {feedback.length > 0 && (
        <div className="fedback-wraper"
          style={{
            maxHeight:"1000px",
            overflowY:"auto",
            marginBottom: "1rem"
          }}
        >
          {feedback.map((entry, i) => {
            let display = entry.text

            // Round 1 Winner
            if (
              entry.round === 1 &&
              entry.text.startsWith("Round 1 Result")
            ) {
              const parts = entry.text
                .replace("Round 1 Result:", "")
                .trim()
                .split("Candidate ")
                .filter(p => p)

              let maxCount = -1
              let winnerId = ""
              parts.forEach(p => {
                const [id, cnt] = p.split(":").map(s => s.trim())
                const num = Number(cnt)
                if (num > maxCount) {
                  maxCount = num
                  winnerId = id
                }
              })
              display = `Winner: Candidate ${winnerId}`
            }
            else if (
              entry.round === 2 &&
              entry.text.startsWith("Final Result")
            ) {
              display = entry.text
            }
            return (
              <div key={i}>
                <p className="box box-text">
                  {entry.text.startsWith("Final Result") ? display : `Round ${entry.round}: ${display}`}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* 送出按鈕 */}
      <div className="send-feedback-button">
        <button className="button" onClick={sendFeedback} disabled={loading || round === "end"}>
          <span>{loading ? "Submitting..." : round === "end" ? "Voting Closed" : "Send Vote"}</span>
          {loading && <div className="loader" />}
        </button>
      </div>

      <div className="divider" />

      <Stepper step={3} onPrevClick={() => router.push("/group")} />
    </>
  )
}
