"use client"

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode
} from "react"
import { JsonRpcProvider, Contract } from "ethers"
import { SemaphoreEthers } from "@semaphore-protocol/data"
import FeedbackABI from "../../contract-artifacts/Feedback.json"

export type FeedbackEntry = {
  round: number
  text: string
}

export type SemaphoreContextType = {
  // on-chain users
  _users: string[]
  // raw feedback entries
  _feedback: FeedbackEntry[]
  // dynamic vote tallies for current round
  votes: number[]
  // winner of the current round or final
  winner: number | null
  // dynamic parameters
  candidateCount: number
  totalRounds: number
  // current active round
  currentRound: number
  setCurrentRound: (round: number) => void
  // fetch helpers
  refreshUsers: () => Promise<void>
  refreshFeedback: () => Promise<void>
  refreshVotes: () => Promise<void>
  getWinner: (round: number) => Promise<void>
  fetchElectionConfig: () => Promise<void>
  addUser: (user: string) => void
  addFeedback: (entry: FeedbackEntry) => void
  setVotes: (votes: number[]) => void
}

const SemaphoreContext = createContext<SemaphoreContextType | null>(null)

// JSON-RPC provider for local dev
const provider = new JsonRpcProvider("http://127.0.0.1:8545")
const feedbackContract = new Contract(
  process.env.NEXT_PUBLIC_FEEDBACK_CONTRACT_ADDRESS!,
  FeedbackABI.abi,
  provider
)

export const SemaphoreContextProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [_users, setUsers] = useState<string[]>([])
  const [_feedback, setFeedback] = useState<FeedbackEntry[]>([])
  const [votes, setVotes] = useState<number[]>([])
  const [winner, setWinner] = useState<number | null>(null)
  const [currentRound, setCurrentRound] = useState<number>(1)

  // dynamic parameters from contract
  const [candidateCount, setCandidateCount] = useState<number>(0)
  const [totalRounds, setTotalRounds] = useState<number>(0)

  // refresh group members
  const refreshUsers = useCallback(async () => {
    try {
      const semaphore = new SemaphoreEthers("http://127.0.0.1:8545", {
        address: process.env.NEXT_PUBLIC_SEMAPHORE_CONTRACT_ADDRESS!
      })
      const members = await semaphore.getGroupMembers(
        process.env.NEXT_PUBLIC_GROUP_ID!
      )
      setUsers(members.map((m) => m.toString()))
    } catch (e) {
      console.error("refreshUsers error", e)
    }
  }, [])

  // refresh feedback proofs
  const refreshFeedback = useCallback(async () => {
    try {
      const semaphore = new SemaphoreEthers("http://127.0.0.1:8545", {
        address: process.env.NEXT_PUBLIC_SEMAPHORE_CONTRACT_ADDRESS!
      })
      const proofs = await semaphore.getGroupValidatedProofs(
        process.env.NEXT_PUBLIC_GROUP_ID!
      )
      setFeedback(
        proofs.map((p: any) => {
          const msg = parseInt(p.message.toString(), 10)
          const c1 = Math.floor(msg / 100)
          const c2 = msg % 100
          return {
            round: Number(p.scope.toString()),
            text: `Voted for #${c1} & #${c2}`
          }
        })
      )
    } catch (e) {
      console.error("refreshFeedback error", e)
    }
  }, [])

  // fetch dynamic election parameters from contract
  const fetchElectionConfig = useCallback(async () => {
    try {
      const rounds = await feedbackContract.totalRounds()
      const candidates = await feedbackContract.candidateCount()
      setTotalRounds(rounds.toNumber())
      setCandidateCount(candidates.toNumber())
    } catch (e) {
      console.error("fetchElectionConfig error", e)
    }
  }, [])

  // refresh votes for current round using dynamic candidateCount
  const refreshVotes = useCallback(async () => {
    try {
      const result: number[] = []
      for (let i = 1; i <= candidateCount; i++) {
        const count = await feedbackContract.getVotes(currentRound, i)
        result.push(Number(count.toString()))
      }
      setVotes(result)
    } catch (e) {
      console.error("refreshVotes error", e)
    }
  }, [currentRound, candidateCount])

  // fetch winner & set votes array
  const getWinner = useCallback(async (round: number) => {
    try {
      if (round === 1) {
        const w = await feedbackContract.getFinalResult(1)
        setWinner(w.toNumber())
      } else {
        const [w, totals] = await feedbackContract.getFinalResultTotal(round)
        setWinner(w.toNumber())
        setVotes(totals.slice(1).map((v: any) => v.toNumber()))
      }
    } catch (e) {
      console.error("getWinner error", e)
    }
  }, [])

  const addUser = useCallback((user: string) => {
    setUsers((prev) => [...prev, user])
  }, [])

  const addFeedback = useCallback((entry: FeedbackEntry) => {
    setFeedback((prev) => [...prev, entry])
  }, [])

  // initial load
  useEffect(() => {
    fetchElectionConfig()
    refreshUsers()
    refreshFeedback()
  }, [fetchElectionConfig, refreshUsers, refreshFeedback])

  // update votes/winner when round or params change
  useEffect(() => {
    if (candidateCount > 0) {
      refreshVotes()
      getWinner(currentRound)
    }
  }, [currentRound, candidateCount, refreshVotes, getWinner])

  return (
    <SemaphoreContext.Provider
      value={{
        _users,
        _feedback,
        votes,
        winner,
        currentRound,
        setCurrentRound,
        refreshUsers,
        refreshFeedback,
        refreshVotes,
        getWinner,
        addUser,
        addFeedback,
        fetchElectionConfig,
        setVotes,
        candidateCount,
        totalRounds
      }}
    >
      {children}
    </SemaphoreContext.Provider>
  )
}

export const useSemaphoreContext = () => {
  const context = useContext(SemaphoreContext)
  if (!context) {
    throw new Error(
      "useSemaphoreContext must be used within a SemaphoreContextProvider"
    )
  }
  return context
}
