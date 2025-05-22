import { Contract, InfuraProvider, JsonRpcProvider, Wallet } from "ethers"
import { NextRequest } from "next/server"
import Feedback from "../../../../contract-artifacts/Feedback.json"

export async function POST(req: NextRequest) {
    if (typeof process.env.ETHEREUM_PRIVATE_KEY !== "string") {
        throw new Error("Missing ETHEREUM_PRIVATE_KEY")
    }

    const ethereumPrivateKey = process.env.ETHEREUM_PRIVATE_KEY
    const network = process.env.NEXT_PUBLIC_DEFAULT_NETWORK as string
    const infuraApiKey = process.env.NEXT_PUBLIC_INFURA_API_KEY as string
    const contractAddress = process.env.NEXT_PUBLIC_FEEDBACK_CONTRACT_ADDRESS as string

    const provider = network === "localhost"
        ? new JsonRpcProvider("http://127.0.0.1:8545")
        : new InfuraProvider(network, infuraApiKey)

    const signer = new Wallet(ethereumPrivateKey, provider)
    const contract = new Contract(contractAddress, Feedback.abi, signer)

    const body = await req.json()

    try {
        // --- Commit 模式 ---
        if ("voteHash" in body && "merkleTreeDepth" in body) {
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
            return new Response(`✅ Commit success in round ${round}`, { status: 200 })
        }

        // --- Reveal 模式 ---
        if ("candidateId1" in body && "salt" in body) {
            const { round, nullifier, candidateId1, candidateId2, salt } = body
            const tx = await contract.revealVote(
                round,
                nullifier,
                candidateId1,
                candidateId2,
                salt
            )
            await tx.wait()
            return new Response(`✅ Reveal success in round ${round}`, { status: 200 })
        }

        return new Response("❌ Missing required fields for commit or reveal", { status: 400 })
    } catch (error: any) {
        console.error("Route error:", error)
        return new Response(`🚨 Error: ${error.message || error}`, { status: 500 })
    }
}