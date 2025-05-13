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
  const [round, setRound] = useState<"1" | "2">("1")

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

      {/* 輪次選擇 */}
      <div style={{ marginBottom: "1rem" }}>
        <label>Select Round: </label>
        <select value={round} onChange={e => setRound(e.target.value as "1" | "2")}>
          <option value="1">Round 1</option>
          <option value="2">Round 2</option>
        </select>
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
            maxHeight:"500px",
            overflowY:"auto",
            marginBottom: "1rem"
          }}
        >
          {feedback.map((entry, i) => {
            let display = entry.text
              if (entry.round === 1 && entry.text.startsWith("Final Result")) {
                const parts = entry.text
                  .replace("Final Result:", "")
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

              return (
                <div key={i}>
                  <p className="box box-text">
                    Round {entry.round}: {display}
                  </p>
                </div>
              )
            })}
        </div>
      )}

      {/* 送出按鈕 */}
      <div className="send-feedback-button">
        <button className="button" onClick={sendFeedback} disabled={loading}>
          <span>{loading ? "Submitting..." : "Send Vote"}</span>
          {loading && <div className="loader" />}
        </button>
      </div>

      <div className="divider" />

      <Stepper step={3} onPrevClick={() => router.push("/group")} />
    </>
  )
}
