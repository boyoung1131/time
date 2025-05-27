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

  // 動態參數
  const [candidateCount, setCandidateCount] = useState<number>(0)
  const [totalRounds, setTotalRounds] = useState<number>(0)

  // 讀取初始化設定
  useEffect(() => {
    fetch('/api/election/start')
      .then(res => res.json())
      .then(data => {
        if (!data.initialized) return router.push('/ea')
        setCandidateCount(data.candidateCount)
        setTotalRounds(data.totalRounds)
      })
  }, [])

  // 階段計時 (5m commit,5m reveal,2m result)
  useEffect(() => {
    const start = Date.now()
    const update = () => {
      const elapsed = Math.floor((Date.now() - start) / 60000)
      const commitDur = 5
      const revealDur = 5
      const resultDur = 2
      const cycle = commitDur + revealDur + resultDur
      if (elapsed < 0) {
        setPhase('not-started')
        setTimeLeft('Voting not started')
        return
      }
      const round = Math.floor(elapsed / cycle) + 1
      if (round > totalRounds) {
        setPhase(`r${totalRounds}-result`)
        setTimeLeft('Voting completed')
        return
      }
      setCurrentRound(round)
      const within = elapsed % cycle
      if (within < commitDur) {
        setPhase(`r${round}-commit`)
        setTimeLeft(`${commitDur - within}m left to commit`)
      } else if (within < commitDur + revealDur) {
        setPhase(`r${round}-reveal`)
        setTimeLeft(`${commitDur + revealDur - within}m left to reveal`)
      } else {
        setPhase(`r${round}-result`)
        setTimeLeft(`${cycle - within}m until next round`)
      }
    }
    update()
    const timer = setInterval(update, 10000)
    return () => clearInterval(timer)
  }, [totalRounds])

  // 切換階段時重置選擇與 salt
  useEffect(() => {
    setSelectedCandidates([])
    setSalt(Date.now().toString())
  }, [phase, currentRound])

  // 結果階段抓票並決定勝者
  useEffect(() => {
    if (phase.endsWith('-result')) {
      fetch(`/api/feedback?round=${currentRound}`)
        .then(r => r.json())
        .then(data => setVotes(data.totalVotes.map(Number)))
      getWinner(currentRound)
    }
  }, [phase, currentRound])

  const getVoteHash = (c1: number, c2: number, salt: string) => {
    const sorted = [c1, c2].sort((a, b) => a - b)
    const encoded = AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256', 'uint256'], [sorted[0], sorted[1], salt]
    )
    return keccak256(encoded)
  }

  const toggleCandidate = (id: number) => {
    setSelectedCandidates(prev =>
      prev.includes(id) ? prev.filter(x => x !== id)
        : prev.length < 2 ? [...prev, id] : prev
    )
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
    const maxV = Math.max(...votes)
    const winners = votes
      .map((v, i) => ({ v, id: i + 1 }))
      .filter(x => x.v === maxV)
      .map(x => x.id)

    if (currentRound < totalRounds) {
      return <p className="text-lg font-semibold">🏆 Round {currentRound} Winner: Candidate {winners.join(', ')}</p>
    }
    return (
      <div>
        <p className="text-lg font-semibold">🏆 Final Winner{winners.length > 1 ? 's' : ''}: {winners.map(i => `Candidate ${i}`).join(' & ')}</p>
        <ul className="mt-2">
          {votes.map((v, i) => (
            <li key={i}>Candidate {i + 1}: {v} votes</li>
          ))}
        </ul>
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
      <button className="refresh-button" onClick={refreshFeedback}>Refresh</button>
    </div>

    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: "1.1rem",
        fontWeight: "500",
        marginBottom: "1rem",
      }}
    >
      <span>⏳ {timeLeft}</span>
      <span>🌀 Phase: {phase}</span>
    </div>

    {/* 投票區塊 */}
    {(phase.includes("commit") || phase.includes("reveal")) && (
      <div className="mb-4">
        <div className="grid grid-cols-3 gap-4 mb-4">
          {buttons.map((id) => (
            <button
              key={id}
              onClick={() => toggleCandidate(id)}
              disabled={
                loading ||
                (phase.includes("commit") && votedRounds.includes(currentRound)) ||
                (phase.includes("reveal") && revealedRounds.includes(currentRound))
              }
              className={`p-4 rounded ${
                selectedCandidates.includes(id)
                  ? "bg-green-500"
                  : "bg-gray-700 hover:bg-gray-600"
              } disabled:opacity-50`}
            >
              候選人 {id}
            </button>
          ))}
        </div>

        {/* Commit 階段 */}
        {phase.includes("commit") && (
          <>
            <div className="button">
              <input
                type="text"
                readOnly
                value={salt}
                placeholder="尚未產生 Salt"
                className="button"
              />
              <button
                onClick={() => {
                  const newSalt = Math.floor(100000 + Math.random() * 900000).toString();
                  localStorage.setItem(`salt-round-${currentRound}`, newSalt);
                  setSalt(newSalt);
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
          <>
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                marginBottom: "0.5rem",
              }}
            >
              <input
                type="text"
                placeholder="Reveal salt"
                value={salt}
                onChange={(e) => setSalt(e.target.value)}
                className="input"
                style={{ width: "200px", height: "40px" }}
              />
              <button
                onClick={revealVote}
                disabled={selectedCandidates.length !== 2 || !salt || loading}
                className="button"
              >
                {loading ? "Revealing..." : "📢 Reveal Vote"}
              </button>
            </div>
          </>
        )}
      </div> // ✅ 加上這行結束 commit/reveal 整體區塊
    )}

    {/* 結果階段 */}
    {phase.endsWith("-result") && (
      <div className="mt-8 space-y-4">
        {renderResults()}
        {currentRound < totalRounds && (
          <p className="text-center text-lg">下一回合將在 {timeLeft} 分鐘後自動開始</p>
        )}
      </div>
    )}

    <div className="divider" />
    <Stepper step={3} onPrevClick={() => router.push("/group")} />
  </>
)}
