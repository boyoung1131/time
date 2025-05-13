import { Contract, InfuraProvider, JsonRpcProvider, Wallet } from "ethers"
import { NextRequest} from "next/server"
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

        const votesFor1 = Number(await contract.getVotes(round, 1))
        const votesFor2 = Number(await contract.getVotes(round, 2))
        const votesFor3 = Number(await contract.getVotes(round, 3))
        const totalVotes = votesFor1 + votesFor2 + votesFor3

        if (totalVotes >= 3) {
            const result = `Final Result:
Candidate 1: ${votesFor1}
Candidate 2: ${votesFor2}
Candidate 3: ${votesFor3}`
            return new Response(result, { status: 200 })
        } else {
            return new Response(`Voted for #${candidateId} in round ${round}`, { status: 200 })
        }
    } catch (error: any) {
        console.error("Voting error:", error)
        return new Response(`Server error: ${error}`, { status: 500 })
    }
}
