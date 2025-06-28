"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export default function EASetupPage() {
    const [candidateCount, setCandidateCount] = useState(1)
    const [totalRounds, setTotalRounds] = useState(1)
    const [commitTime, setCommitTime] = useState(1)
    const [revealTime, setRevealTime] = useState(1)
    const [resultTime, setResultTime] = useState(1)
    const [startTime, setStartTime] = useState<string>("")
    const [status, setStatus] = useState<string | null>(null)
    const [txHash, setTxHash] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    // 預設開始時間為現在 + 60 秒
    useEffect(() => {
        const bufferSeconds = 60
        const now = new Date(Date.now() + bufferSeconds * 1000)
        const tzoffset = now.getTimezoneOffset() * 60000
        const local = new Date(now.getTime() - tzoffset)
        const isoLocal = local.toISOString().slice(0, 16) // yyyy-MM-ddTHH:mm
        setStartTime(isoLocal)
    }, [])

    useEffect(() => {
        const prev = document.body.style.backgroundColor
            document.body.style.backgroundColor = "#fff"
        return () => {
            document.body.style.backgroundColor = prev
        }
    }, [])

    const startElection = async () => {
        setLoading(true)
        setStatus(null)
        setTxHash(null)

        const parsedStart = new Date(startTime)
        if (!startTime || Number.isNaN(parsedStart.getTime())) {
            setStatus("❌ 請輸入有效的投票開始時間")
            setLoading(false)
            return
        }

        try {
            const startTimestamp = Math.floor(parsedStart.getTime() / 1000)
            const res = await fetch("/api/election/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    candidateCount,
                    totalRounds,
                    commitTime,
                    revealTime,
                    resultTime,
                    startTimestamp
                })
            })
            const data = await res.json()
            if (data.success) {
                setStatus("✅ 初始化成功")
                setTxHash(data.txHash)
                setTimeout(() => router.push("/"), 1000)
            } else {
                setStatus(`❌ 初始化失敗：${data.error}`)
            }
        } catch (err: any) {
            setStatus(`❌ 初始化過程發生錯誤：${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="p-8 max-w-xl mx-auto bg-white text-gray-900 rounded-lg shadow-lg">
                <h1 className="text-3xl font-semibold mb-6 text-center">🛠️ 選舉參數設定</h1>

                <div style={{ marginBottom: "3rem" }}>
                    <div className="text-top" style={{ marginBottom: "1rem" }}>
                        <label htmlFor="startTime" className="text-gray-900 ">投票開始時間</label>
                        <input
                            id="startTime"
                            type="datetime-local"
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            className="input text-gray-900 "
                            style={{ width: "300px", height: "30px" }}
                        />
                        {startTime && (
                            <p className="text-sm mt-2 text-gray-900 ">⏱️ 預計投票開始時間：{new Date(startTime).toLocaleString()}</p>
                        )}
                    </div>

                    <div className="text-top">
                        <label htmlFor="candidateCount">候選人數</label>
                        <input
                            id="candidateCount"
                            type="number"
                            min={1}
                            value={candidateCount}
                            onChange={(e) => setCandidateCount(+e.target.value)}
                            placeholder="請輸入候選人數"
                            className="input"
                            style={{ width: "500px", height: "30px" }}
                        />
                    </div>

                    <div className="text-top" style={{ marginBottom: "1rem" }}>
                        <label htmlFor="totalRounds">回合數</label>
                        <input
                            id="totalRounds"
                            type="number"
                            min={1}
                            value={totalRounds}
                            onChange={(e) => setTotalRounds(+e.target.value)}
                            placeholder="請輸入回合數"
                            className="input"
                            style={{ width: "500px", height: "30px" }}
                        />
                    </div>

                    <div className="text-top" style={{ marginBottom: "1rem" }}>
                        <label htmlFor="commitTime">Commit 階段時間（分鐘）</label>
                        <input
                            id="commitTime"
                            type="number"
                            min={1}
                            value={commitTime}
                            onChange={(e) => setCommitTime(+e.target.value)}
                            className="input"
                            style={{ width: "400px", height: "30px" }}
                        />
                    </div>

                    <div className="text-top" style={{ marginBottom: "1rem" }}>
                        <label htmlFor="revealTime">Reveal 階段時間（分鐘）</label>
                        <input
                            id="revealTime"
                            type="number"
                            min={1}
                            value={revealTime}
                            onChange={(e) => setRevealTime(+e.target.value)}
                            className="input"
                            style={{ width: "400px", height: "30px" }}
                        />
                    </div>

                    <div className="text-top" style={{ marginBottom: "1rem" }}>
                        <label htmlFor="resultTime">Result 階段時間（分鐘）</label>
                        <input
                            id="resultTime"
                            type="number"
                            min={1}
                            value={resultTime}
                            onChange={(e) => setResultTime(+e.target.value)}
                            className="input"
                            style={{ width: "400px", height: "30px" }}
                        />
                    </div>
                </div>

                <div className="mt-8 text-center">
                    <button type="button" onClick={startElection} disabled={loading} className="button">
                        {loading ? "初始化中…" : "🚀 開始初始化"}
                    </button>
                </div>

                {status && <p className="mt-4 text-center">{status}</p>}
                {txHash && (
                    <p className="mt-2 break-words text-sm text-center">
                        交易哈希：<code>{txHash}</code>
                    </p>
                )}
            </div>
        </div>
    )
}
