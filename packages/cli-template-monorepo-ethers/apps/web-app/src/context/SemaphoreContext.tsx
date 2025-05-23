"use client"

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode
} from "react"
import { JsonRpcProvider, Contract, InfuraProvider, Wallet } from "ethers"
import { SemaphoreEthers } from "@semaphore-protocol/data"
import FeedbackABI from "../../contract-artifacts/Feedback.json"

export type FeedbackEntry = {
  round: number
  text: string
}

export type SemaphoreContextType = {
  _users: string[]
  _feedback: FeedbackEntry[]
  votes: number[]
  winner: number | null
  currentRound: number
  setCurrentRound: (round: number) => void
  refreshUsers: () => Promise<void>
  refreshFeedback: () => Promise<void>
  refreshVotes: () => Promise<void>
  /**
   * Fetch and set winner and votes for given round
   */
  getWinner: (round: number) => Promise<void>
  fetchTotalVotes: () => Promise<void>
  addUser: (user: string) => void
  addFeedback: (entry: FeedbackEntry) => void
  setVotes: (votes: number[]) => void
}

const SemaphoreContext = createContext<SemaphoreContextType | null>(null)

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
          const enc = parseInt(p.message.toString(), 10)
          const c1 = Math.floor(enc / 100)
          const c2 = enc % 100
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

  const refreshVotes = useCallback(async () => {
    try {
      const result: number[] = []
      for (let i = 1; i <= 3; i++) {
        const count = await feedbackContract.getVotes(currentRound, i)
        result.push(Number(count.toString()))
      }
      setVotes(result)
    } catch (e) {
      console.error("refreshVotes error", e)
    }
  }, [currentRound])

  /**
   * Fetch winner and votes for the specified round
   */
  const getWinner = useCallback(async (round: number) => {
    try {
      if (round === 1) {
        const w = await feedbackContract.getFinalResult(1)
        setWinner(Number(w.toString()))
      } else {
        const [w, totals] = await feedbackContract.getFinalResultTotal(round)
        // totals is BigInt[], first element dummy
        setVotes(totals.slice(1).map((v: any) => Number(v.toString())))
        setWinner(Number(w.toString()))
      }
    } catch (e) {
      console.error("getWinner error", e)
    }
  }, [])

  const fetchTotalVotes = useCallback(async () => {
    try {
      const res = await fetch("/api/feedback")
      const data = await res.json()
      setVotes(data.totalVotes.map(Number))
    } catch (e) {
      console.error("fetchTotalVotes error", e)
    }
  }, [])

  const addUser = useCallback((user: string) => {
    setUsers((prev) => [...prev, user])
  }, [])

  const addFeedback = useCallback((entry: FeedbackEntry) => {
    setFeedback((prev) => [...prev, entry])
  }, [])

  useEffect(() => {
    refreshUsers()
    refreshFeedback()
    refreshVotes()
    getWinner(currentRound)
  }, [refreshUsers, refreshFeedback, refreshVotes, getWinner, currentRound])

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
        fetchTotalVotes,
        addUser,
        addFeedback,
        setVotes
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
