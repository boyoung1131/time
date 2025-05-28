import { NextRequest, NextResponse } from "next/server"
import { Contract, InfuraProvider, JsonRpcProvider, Wallet, ethers } from "ethers"
import FeedbackABI from "../../../../../contract-artifacts/Feedback.json"

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_FEEDBACK_CONTRACT_ADDRESS!
const NETWORK = process.env.NEXT_PUBLIC_DEFAULT_NETWORK!
const INFURA_KEY = process.env.NEXT_PUBLIC_INFURA_API_KEY!
const PRIVATE_KEY = process.env.ETHEREUM_PRIVATE_KEY!

function getProvider() {
    return NETWORK === "localhost"
        ? new JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL)
        : new InfuraProvider(NETWORK, INFURA_KEY)
}

export async function GET(_: NextRequest) {
    try {
        const provider = getProvider()
        const contract = new Contract(CONTRACT_ADDRESS, FeedbackABI.abi, provider)

        const electionAuthority = await contract.electionAuthority()
        const totalRounds = await contract.totalRounds()
        const candidateCount = await contract.candidateCount()
        const commitTime = await contract.commitDuration()
        const revealTime = await contract.revealDuration()
        const resultTime = await contract.resultDuration()
        const round1Start = await contract.roundStartTime(1)

        return NextResponse.json({
            initialized: electionAuthority !== ethers.ZeroAddress,
            electionAuthority,
            totalRounds: Number(totalRounds),
            candidateCount: Number(candidateCount),
            commitTime: Number(commitTime) / 60,
            revealTime: Number(revealTime) / 60,
            resultTime: Number(resultTime) / 60,
            startTimestamp: Number(round1Start) * 1000
        })
    } catch (err: any) {
        console.error("GET /api/election/start 讀取失敗：", err)
        return NextResponse.json({ error: err.message || "讀取選舉狀態失敗" }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const { totalRounds, candidateCount, commitTime, revealTime, resultTime, startTimestamp } = await req.json()

        if (
            typeof totalRounds !== "number" ||
            totalRounds < 1 ||
            typeof candidateCount !== "number" ||
            candidateCount < 1 ||
            typeof commitTime !== "number" ||
            commitTime < 1 ||
            typeof revealTime !== "number" ||
            revealTime < 1 ||
            typeof resultTime !== "number" ||
            resultTime < 1 ||
            typeof startTimestamp !== "number" ||
            startTimestamp < 1
        ) {
            return NextResponse.json({ success: false, error: "請傳入有效的選舉參數" }, { status: 400 })
        }

        const provider = getProvider()
        const signer = NETWORK === "localhost" ? await provider.getSigner(0) : new Wallet(PRIVATE_KEY, provider)

        const contract = new Contract(CONTRACT_ADDRESS, FeedbackABI.abi, signer)

        const tx = await contract.initializeElection(
            totalRounds,
            candidateCount,
            commitTime * 60,
            revealTime * 60,
            resultTime * 60,
            startTimestamp
        )
        const receipt = await tx.wait()

        return NextResponse.json({
            success: true,
            txHash: receipt.transactionHash
        })
    } catch (err: any) {
        console.error("POST /api/election/start 初始化失敗：", err)
        return NextResponse.json({ success: false, error: err.message || "初始化選舉失敗" }, { status: 500 })
    }
}
