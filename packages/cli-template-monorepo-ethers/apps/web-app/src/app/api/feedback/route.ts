import { NextRequest, NextResponse } from "next/server"
import { Contract, InfuraProvider, JsonRpcProvider, Wallet } from "ethers"
import FeedbackABI from "../../../../contract-artifacts/Feedback.json"

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_FEEDBACK_CONTRACT_ADDRESS!
const NETWORK = process.env.NEXT_PUBLIC_DEFAULT_NETWORK!
const INFURA_KEY = process.env.NEXT_PUBLIC_INFURA_API_KEY!
const PRIVATE_KEY = process.env.ETHEREUM_PRIVATE_KEY!

function getProvider() {
  return NETWORK === "localhost"
    ? new JsonRpcProvider("http://127.0.0.1:8545")
    : new InfuraProvider(NETWORK, INFURA_KEY)
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const roundParam = url.searchParams.get("round")
    const round = roundParam ? parseInt(roundParam, 10) : 0

    if (round < 1) {
      return NextResponse.json(
        { error: "Missing or invalid round parameter" },
        { status: 400 }
      )
    }

    const provider = getProvider()
    const contract = new Contract(CONTRACT_ADDRESS, FeedbackABI.abi, provider)
    const candidateCount = 3  // 可調整或讀自 env

    let totals: string[]

    if (round === 1) {
      totals = []
      for (let i = 1; i <= candidateCount; i++) {
        const c = await contract.getVotes(1, i)
        totals.push(c.toString())
      }
    } else {
      const [, arr] = await contract.getFinalResultTotal(round)
      totals = arr.slice(1).map((v: any) => v.toString())
    }

    return NextResponse.json({ totalVotes: totals })
  } catch (err: any) {
    console.error("GET /api/feedback error:", err)
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const provider = getProvider()

    // ⚠️ 這裡必須 await，否則 signer 會是 Promise<JsonRpcSigner>
    let signer
    if (NETWORK === "localhost") {
      signer = await provider.getSigner(0)
    } else {
      signer = new Wallet(PRIVATE_KEY!, provider)
    }

    const contract = new Contract(CONTRACT_ADDRESS, FeedbackABI.abi, signer)

    // --- Commit 模式 ---
    if (
      "voteHash" in body &&
      "merkleTreeDepth" in body &&
      "merkleTreeRoot" in body &&
      "nullifier" in body &&
      "round" in body &&
      "points" in body
    ) {
      const { merkleTreeDepth, merkleTreeRoot, nullifier, voteHash, round, points } = body
      const tx = await contract.commitVote(
        merkleTreeDepth,
        merkleTreeRoot,
        nullifier,
        voteHash,
        round,
        points
      )
      await tx.wait()
      return NextResponse.json({ message: `✅ Commit success in round ${round}` })
    }

    // --- Reveal 模式 ---
    if (
      "candidateId1" in body &&
      "candidateId2" in body &&
      "salt" in body &&
      "round" in body &&
      "nullifier" in body
    ) {
      const { round, nullifier, candidateId1, candidateId2, salt } = body
      const tx = await contract.revealVote(
        round,
        nullifier,
        candidateId1,
        candidateId2,
        salt
      )
      await tx.wait()
      return NextResponse.json({ message: `✅ Reveal success in round ${round}` })
    }

    return NextResponse.json(
      { error: "Missing required fields for commit or reveal" },
      { status: 400 }
    )
  } catch (error: any) {
    console.error("POST /api/feedback error:", error)
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    )
  }
}
