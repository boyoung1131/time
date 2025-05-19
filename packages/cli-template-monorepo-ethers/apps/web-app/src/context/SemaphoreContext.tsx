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
  _users: string[]
  _feedback: FeedbackEntry[]
  votes: number[]
  winner: number | null
  refreshUsers: () => Promise<void>
  refreshFeedback: () => Promise<void>
  refreshVotes: () => Promise<void>
  getWinner: () => Promise<void>
  addUser: (user: string) => void
  addFeedback: (entry: FeedbackEntry) => void
}

const SemaphoreContext = createContext<SemaphoreContextType | null>(null)

const provider = new JsonRpcProvider("http://127.0.0.1:8545")
const feedbackContract = new Contract(
  process.env.NEXT_PUBLIC_FEEDBACK_CONTRACT_ADDRESS!,
  FeedbackABI.abi,
  provider
)

export const SemaphoreContextProvider: React.FC<{ children: ReactNode }> = ({
  children
}) => {
  const [_users, setUsers] = useState<string[]>([])
  const [_feedback, setFeedback] = useState<FeedbackEntry[]>([])
  const [votes, setVotes] = useState<number[]>([])
  const [winner, setWinner] = useState<number | null>(null)

  // 讀取群組成員並更新
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

  // 讀取已驗證的 proofs，並將 proof.scope 當作輪次
  const refreshFeedback = useCallback(async () => {
    try {
      const semaphore = new SemaphoreEthers("http://127.0.0.1:8545", {
        address: process.env.NEXT_PUBLIC_SEMAPHORE_CONTRACT_ADDRESS!
      })
      const proofs = await semaphore.getGroupValidatedProofs(
        process.env.NEXT_PUBLIC_GROUP_ID!
      )
      setFeedback(
        proofs.map((p: any) => ({
          round: Number(p.scope.toString()),
          text: `Voted for #${p.message.toString()}`
        }))
      )
    } catch (e) {
      console.error("refreshFeedback error", e)
    }
  }, [])

  // 讀取鏈上累計票數
  const refreshVotes = useCallback(async () => {
    try {
      const result: number[] = []
      for (let i = 1; i <= 3; i++) {
        const count = await feedbackContract.getVotes(i)
        result.push(Number(count.toString()))
      }
      setVotes(result)
    } catch (e) {
      console.error("refreshVotes error", e)
    }
  }, [])

  const getWinner = useCallback(async () => {
    try {
      const w = await feedbackContract.getFinalResult()
      setWinner(Number(w.toString()))
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

  useEffect(() => {
    refreshUsers()
    refreshFeedback()
    refreshVotes()
    getWinner()
  }, [refreshUsers, refreshFeedback, refreshVotes, getWinner])

  return (
    <SemaphoreContext.Provider
      value={{
        _users,
        _feedback,
        votes,
        winner,
        refreshUsers,
        refreshFeedback,
        refreshVotes,
        getWinner,
        addUser,
        addFeedback
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
