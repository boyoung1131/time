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
    const [_loading, setLoading] = useState(false)
    const { _identity } = useSemaphoreIdentity()
    const [candidateId,setCandidateId] = useState(1)
    

    useEffect(() => {
        if (_feedback.length > 0) {
            setLog(`${_feedback.length} feedback retrieved from the group 🤙🏽`)
        }
    }, [_feedback, setLog])

    const feedback = useMemo(() => [..._feedback].reverse(), [_feedback])

    const sendFeedback = useCallback(async () => {
        if (!_identity || !_users) return

        setLoading(true)
        setLog("Posting your anonymous votes...")

        try {
            const group = new Group(_users)

            const { points, merkleTreeDepth, merkleTreeRoot, nullifier } = await generateProof(
                _identity,
                group,
                candidateId.toString(),
                process.env.NEXT_PUBLIC_GROUP_ID as string
            )

            const response = await fetch("api/feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    merkleTreeDepth,
                    merkleTreeRoot,
                    nullifier,
                    candidateId,
                    points
                })
            })
             
            if (response.status === 200) {
                addFeedback(`Vote for Candidate #${candidateId}`)

                const text = await response.text()
                if (text.includes("Candidate")) {
                    addFeedback(`${text}`)
                }
                setLog("Your votes have been posted 🎉")
            } else {
                setLog("Some error occurred while voting, please try again!")
            } 
        } catch (error: any) {
            console.error("Voting error:", error)
            setLog("Some error occurred, please try again!")
        } finally {
            setLoading(false)
        }
    }, [_identity, _users, candidateId, addFeedback, setLog])

    return (
        <>
            <h2>Proofs</h2>

            <p>
                Semaphore members can anonymously {" "}
                <a
                    href="https://docs.semaphore.pse.dev/guides/proofs"
                    target="_blank"
                    rel="noreferrer noopener nofollow"
                >
                    prove
                </a>{" "}
                that they are part of a group and send their anonymous messages. In this case, anonymous votes.
            </p>

            <div className="divider"></div>

            <div className="text-top">
                <h3>Votes ({_feedback.length})</h3>
                <button className="refresh-button" onClick={refreshFeedback}>
                    <span className="refresh-span">
                        <svg viewBox="0 0 24 24" focusable="false" className="refresh-icon">
                            <path
                                fill="currentColor"
                                d="M5.463 4.43301C7.27756 2.86067 9.59899 1.99666 12 2.00001C17.523 2.00001 22 6.47701 22 12C22 14.136 21.33 16.116 20.19 17.74L17 12H20C20.0001 10.4316 19.5392 8.89781 18.6747 7.58927C17.8101 6.28072 16.5799 5.25517 15.1372 4.64013C13.6944 4.0251 12.1027 3.84771 10.56 4.13003C9.0172 4.41234 7.59145 5.14191 6.46 6.22801L5.463 4.43301ZM18.537 19.567C16.7224 21.1393 14.401 22.0034 12 22C6.477 22 2 17.523 2 12C2 9.86401 2.67 7.88401 3.81 6.26001L7 12H4C3.99987 13.5684 4.46075 15.1022 5.32534 16.4108C6.18992 17.7193 7.42007 18.7449 8.86282 19.3599C10.3056 19.9749 11.8973 20.1523 13.44 19.87C14.9828 19.5877 16.4085 18.8581 17.54 17.772L18.537 19.567Z"
                            ></path>
                        </svg>
                    </span>
                    Refresh
                </button>
            </div>

            <div style={{ marginBottom: "1rem" }}>
                <label>Select Candidate: </label>
                <select value={candidateId} onChange={(e) => setCandidateId(parseInt(e.target.value))}>
                    <option value={1}>Candidate 1</option>
                    <option value={2}>Candidate 2</option>
                    <option value={3}>Candidate 3</option>
                </select>
            </div>

            {feedback.length > 0 && (
                <div className="feedback-wrapper">
                    {feedback.map((f, i) => (
                        <div key={i}>
                            <p className={`box box-text ${f.startsWith("# Final Result") ? "highlight-box" : ""}`}>
                                {f}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            <div className="send-feedback-button">
                <button className="button" onClick={sendFeedback} disabled={_loading}>
                    <span>{_loading ? "Submitting..." : "Send Vote"}</span>
                    {_loading && <div className="loader"></div>}
                </button>
            </div>

            <div className="divider"></div>

            <Stepper step={3} onPrevClick={() => router.push("/group")} />
        </>
    )
}
