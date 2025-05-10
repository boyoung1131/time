"use client"

import React, {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useState
} from "react"
import { Contract, JsonRpcProvider } from "ethers"
import FeedbackABI from "../../contract-artifacts/Feedback.json"
import { SemaphoreEthers } from "@semaphore-protocol/data"

export type SemaphoreContextType = {
    _users: string[]
    _feedback: string[]
    refreshUsers: () => Promise<void>
    addUser: (user: string) => void
    refreshFeedback: () => Promise<void>
    addFeedback: (feedback: string) => void
    votes: number[]
    winner: number | null
    refreshVotes: () => Promise<void>
    getWinner: () => Promise<void>
}

const SemaphoreContext = createContext<SemaphoreContextType | null>(null)

interface ProviderProps {
    children: ReactNode
}

// ✅ 本地鏈固定 provider（localhost:8545）
const provider = new JsonRpcProvider("http://127.0.0.1:8545")

// ✅ 合約實例（用來讀取票數、勝者）
const feedbackContract = new Contract(
    process.env.NEXT_PUBLIC_FEEDBACK_CONTRACT_ADDRESS!,
    FeedbackABI.abi,
    provider
)

export const SemaphoreContextProvider: React.FC<ProviderProps> = ({ children }) => {
    const [_users, setUsers] = useState<string[]>([])
    const [_feedback, setFeedback] = useState<string[]>([])
    const [votes, setVotes] = useState<number[]>([])
    const [winner, setWinner] = useState<number | null>(null)

    const refreshUsers = useCallback(async () => {
        
        const semaphore = new SemaphoreEthers(provider, {
            address: process.env.NEXT_PUBLIC_SEMAPHORE_CONTRACT_ADDRESS!
        })
        const members = await semaphore.getGroupMembers(process.env.NEXT_PUBLIC_GROUP_ID!)
        setUsers(members.map((m) => m.toString()))
    }, [])

    const addUser = useCallback((user: string) => {
        setUsers((prev) => [...prev, user])
    }, [])

    const refreshFeedback = useCallback(async () => {
        const semaphore = new SemaphoreEthers(provider, {
            address: process.env.NEXT_PUBLIC_SEMAPHORE_CONTRACT_ADDRESS!
        })
        const proofs = await semaphore.getGroupValidatedProofs(process.env.NEXT_PUBLIC_GROUP_ID!)
        setFeedback(proofs.map(({ message }: any) => `Voted for #${parseInt(message.toString())}`))
    }, [])

    const addFeedback = useCallback((feedback: string) => {
        setFeedback((prev) => [...prev, feedback])
    }, [])

    const refreshVotes = useCallback(async () => {
        try {
            const result = await Promise.all(
                [1, 2, 3].map((i) => feedbackContract.getVotes(i))
            )
            setVotes(result.map((r) => Number(r)))
        } catch (err) {
            console.error("getVotes() error", err)
        }
    }, [])

    const getWinner = useCallback(async () => {
        try {
            const winnerId = await feedbackContract.getFinalResult()
            setWinner(Number(winnerId))
        } catch (err) {
            console.error("getFinalResult() error", err)
        }
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
                refreshUsers,
                addUser,
                refreshFeedback,
                addFeedback,
                votes,
                winner,
                refreshVotes,
                getWinner
            }}
        >
            {children}
        </SemaphoreContext.Provider>
    )
}

export const useSemaphoreContext = () => {
    const context = useContext(SemaphoreContext)
    if (!context) {
        throw new Error("useSemaphoreContext must be used within a SemaphoreContextProvider")
    }
    return context
}
