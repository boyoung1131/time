import { Contract, InfuraProvider, JsonRpcProvider, Wallet } from "ethers"
import { NextRequest } from "next/server"
import Feedback from "../../../../contract-artifacts/Feedback.json"

export async function POST(req: NextRequest) {
    if (typeof process.env.ETHEREUM_PRIVATE_KEY !== "string") {
        throw new Error("Please, define ETHEREUM_PRIVATE_KEY in your .env file")
    }

    const ethereumPrivateKey = process.env.ETHEREUM_PRIVATE_KEY
    const ethereumNetwork = process.env.NEXT_PUBLIC_DEFAULT_NETWORK as string
    const infuraApiKey = process.env.NEXT_PUBLIC_INFURA_API_KEY as string
    const contractAddress = process.env.NEXT_PUBLIC_FEEDBACK_CONTRACT_ADDRESS as string

    const provider =
        ethereumNetwork === "localhost"
            ? new JsonRpcProvider("http://127.0.0.1:8545")
            : new InfuraProvider(ethereumNetwork, infuraApiKey)

    const signer = new Wallet(ethereumPrivateKey, provider)
    const contract = new Contract(contractAddress, Feedback.abi, signer)

    const { merkleTreeDepth, merkleTreeRoot, nullifier, candidateId, points, round } = await req.json()

    try {
        const tx = await contract.sendVote(
            merkleTreeDepth,
            merkleTreeRoot,
            nullifier,
            candidateId,
            round,
            points
        )
        await tx.wait()

        // 當前 round 的票數
        const votes = {
            1: Number(await contract.getVotes(round, 1)),
            2: Number(await contract.getVotes(round, 2)),
            3: Number(await contract.getVotes(round, 3))
        }
        const totalVotes = votes[1] + votes[2] + votes[3]

        // 第一輪公布 Round 1 結果
        if (round === 1 && totalVotes >= 3) {
            const result = `Round 1 Result:
Candidate 1: ${votes[1]}
Candidate 2: ${votes[2]}
Candidate 3: ${votes[3]}`
            return new Response(result, { status: 200 })
        }

        // 第二輪公布 Final Result（兩輪累加）
        if (round === 2 && totalVotes >= 3) {
            const prev = {
                1: Number(await contract.getVotes(1, 1)),
                2: Number(await contract.getVotes(1, 2)),
                3: Number(await contract.getVotes(1, 3))
            }

            const result = `Final Result:
Candidate 1: ${votes[1] + prev[1]}
Candidate 2: ${votes[2] + prev[2]}
Candidate 3: ${votes[3] + prev[3]}`

            return new Response(result, { status: 200 })
        }

        return new Response(`Voted for #${candidateId} in round ${round}`, { status: 200 })
    } catch (error: any) {
        console.error("Voting error:", error)
        return new Response(`Server error: ${error}`, { status: 500 })
    }
}
