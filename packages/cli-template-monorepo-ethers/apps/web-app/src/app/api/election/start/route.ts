// src/app/api/election/start/route.ts

import { NextRequest, NextResponse } from "next/server";
import {
  Contract,
  InfuraProvider,
  JsonRpcProvider,
  Wallet,
  ethers,
} from "ethers";
import FeedbackABI from "../../../../../contract-artifacts/Feedback.json";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_FEEDBACK_CONTRACT_ADDRESS!;
const NETWORK            = process.env.NEXT_PUBLIC_DEFAULT_NETWORK!;
const INFURA_KEY         = process.env.NEXT_PUBLIC_INFURA_API_KEY!;
const PRIVATE_KEY        = process.env.ETHEREUM_PRIVATE_KEY!;

/**
 * 根據環境回傳 Provider（本地或 Infura）
 */
function getProvider() {
  return NETWORK === "localhost"
    ? new JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL)
    : new InfuraProvider(NETWORK, INFURA_KEY);
}

/**
 * GET /api/election/start
 * 讀取選舉初始化狀態與參數
 */
export async function GET(_: NextRequest) {
  try {
    const provider = getProvider();
    const contract = new Contract(CONTRACT_ADDRESS, FeedbackABI.abi, provider);

    const electionAuthority = await contract.electionAuthority();
    const totalRounds       = await contract.totalRounds();
    const candidateCount    = await contract.candidateCount();

    return NextResponse.json({
      initialized: electionAuthority !== ethers.ZeroAddress,
      electionAuthority,
      totalRounds: Number(totalRounds),
      candidateCount: Number(candidateCount),
    });
  } catch (err: any) {
    console.error("GET /api/election/start 讀取失敗：", err);
    return NextResponse.json(
      { error: err.message || "讀取選舉狀態失敗" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/election/start
 * 初始化選舉參數：設定回合數與候選人數
 */
export async function POST(req: NextRequest) {
  try {
    const { totalRounds, candidateCount } = await req.json();

    // 參數基本檢查
    if (
      typeof totalRounds !== "number" || totalRounds < 1 ||
      typeof candidateCount !== "number" || candidateCount < 1
    ) {
      return NextResponse.json(
        { success: false, error: "參數錯誤：請傳入有效的 totalRounds 與 candidateCount" },
        { status: 400 }
      );
    }

    const provider = getProvider()
    const signer = NETWORK === "localhost"
        ? await provider.getSigner(0)             
        : new Wallet(PRIVATE_KEY, provider);

    const contract = new Contract(CONTRACT_ADDRESS, FeedbackABI.abi, signer);

    // 呼叫 initializeElection 並等待確認
    const tx = await contract.initializeElection(totalRounds, candidateCount);
    const receipt = await tx.wait();

    return NextResponse.json({
      success: true,
      txHash: receipt.transactionHash,
    });
  } catch (err: any) {
    console.error("POST /api/election/start 初始化失敗：", err);
    return NextResponse.json(
      { success: false, error: err.message || "初始化選舉失敗" },
      { status: 500 }
    );
  }
}
