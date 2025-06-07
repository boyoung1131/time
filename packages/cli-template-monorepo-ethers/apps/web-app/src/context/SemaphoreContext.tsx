"use client"

import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react"
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
    candidateCount: number
    totalRounds: number
    commitDuration: number
    revealDuration: number
    resultDuration: number
    currentRound: number
    startTimestamp: number
    setCurrentRound: (round: number) => void
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

const provider = new JsonRpcProvider("http://127.0.0.1:8545")
const feedbackContract = new Contract(process.env.NEXT_PUBLIC_FEEDBACK_CONTRACT_ADDRESS!, FeedbackABI.abi, provider)

export const SemaphoreContextProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [_users, setUsers] = useState<string[]>([])
    const [_feedback, setFeedback] = useState<FeedbackEntry[]>([])
    const [votes, setVotes] = useState<number[]>([])
    const [winner, setWinner] = useState<number | null>(null)
    const [currentRound, setCurrentRound] = useState<number>(1)
    const [commitDuration, setCommitDuration] = useState<number>(0)
    const [revealDuration, setRevealDuration] = useState<number>(0)
    const [resultDuration, setResultDuration] = useState<number>(0)
    const [candidateCount, setCandidateCount] = useState<number>(0)
    const [totalRounds, setTotalRounds] = useState<number>(0)
    const [startTimestamp, setStartTimestamp] = useState<number>(0)

    const refreshUsers = useCallback(async () => {
        try {
            const semaphore = new SemaphoreEthers("http://127.0.0.1:8545", {
                address: process.env.NEXT_PUBLIC_SEMAPHORE_CONTRACT_ADDRESS!
            })
            const members = await semaphore.getGroupMembers(process.env.NEXT_PUBLIC_GROUP_ID!)
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
            const proofs = await semaphore.getGroupValidatedProofs(process.env.NEXT_PUBLIC_GROUP_ID!)
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

    const fetchElectionConfig = useCallback(async () => {
        try {
            const rounds = await feedbackContract.totalRounds()
            const candidates = await feedbackContract.candidateCount()
            const commit = await feedbackContract.commitDuration()
            const reveal = await feedbackContract.revealDuration()
            const result = await feedbackContract.resultDuration()
            const start = await feedbackContract.startTimestamp()

            setTotalRounds(Number(rounds))
            setCandidateCount(Number(candidates))
            setCommitDuration(Number(commit))
            setRevealDuration(Number(reveal))
            setResultDuration(Number(result))
            setStartTimestamp(Number(start) * 1000)
        } catch (e) {
            console.error("fetchElectionConfig error", e)
        }
    }, [])

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

    const getWinner = useCallback(async (round: number) => {
        try {
            const [w, totals] = await feedbackContract.getFinalResultTotal(round)
            setWinner(Number(w))
            setVotes(totals.slice(1).map((v: any) => Number(v)))
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
        fetchElectionConfig()
        refreshUsers()
        refreshFeedback()
    }, [fetchElectionConfig, refreshUsers, refreshFeedback])

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
                totalRounds,
                commitDuration,
                revealDuration,
                resultDuration,
                startTimestamp
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
